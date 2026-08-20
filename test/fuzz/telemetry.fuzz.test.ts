import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatTraceparent,
  injectTraceContext,
  parseTraceparent,
  type TraceContext,
} from '../../src/telemetry/context';
import { OtlpExporter } from '../../src/telemetry/exporter';
import { msToNanos, type Span } from '../../src/telemetry/span';

const hexCharacter = fc.constantFrom(...'0123456789abcdef');
const nonZeroHex = (length: number) =>
  fc
    .array(hexCharacter, { minLength: length, maxLength: length })
    .map((characters) => characters.join(''))
    .filter((value) => value !== '0'.repeat(length));

const traceContextArbitrary: fc.Arbitrary<TraceContext> = fc.record({
  traceId: nonZeroHex(32),
  spanId: nonZeroHex(16),
  traceFlags: fc
    .array(hexCharacter, { minLength: 2, maxLength: 2 })
    .map((characters) => characters.join('')),
});

const segmentArbitrary = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
    minLength: 1,
    maxLength: 16,
  })
  .map((characters) => characters.join(''));

const span = (index: number): Span => ({
  traceId: index.toString(16).padStart(32, '0'),
  spanId: index.toString(16).padStart(16, '0'),
  name: `span-${index}`,
  startTimeMs: index,
  endTimeMs: index + 1,
  durationMs: 1,
  method: 'GET',
  url: `https://example.test/${index}`,
  path: `/${index}`,
  status: 200,
  serviceName: 'fuzz',
});

const exportedNames = (mockFetch: ReturnType<typeof vi.fn>): string[] =>
  mockFetch.mock.calls.flatMap((call) => {
    const payload = JSON.parse(String((call[1] as RequestInit).body));
    return payload.resourceSpans[0].scopeSpans[0].spans.map(
      (item: { name: string }) => item.name,
    );
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('telemetry fuzzing', () => {
  it('round-trips arbitrary valid W3C trace contexts', () => {
    fc.assert(
      fc.property(traceContextArbitrary, (context) => {
        expect(parseTraceparent(formatTraceparent(context))).toEqual(context);
      }),
      { numRuns: 1_000 },
    );
  });

  it('injects generated trace context without changing unrelated headers', () => {
    fc.assert(
      fc.property(
        traceContextArbitrary,
        fc.dictionary(segmentArbitrary, segmentArbitrary, { maxKeys: 20 }),
        (context, headerValues) => {
          delete headerValues.traceparent;
          delete headerValues.tracestate;
          const request = new Request('https://example.test/resource', {
            headers: headerValues,
          });

          const injected = injectTraceContext(request, context);

          expect(parseTraceparent(injected.headers.get('traceparent') ?? undefined)).toEqual(
            context,
          );
          for (const [name, value] of Object.entries(headerValues)) {
            expect(injected.headers.get(name)).toBe(value);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('converts arbitrary millisecond timestamps to exact nanoseconds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000_000_000 }), (milliseconds) => {
        const expected = (BigInt(milliseconds) * 1_000_000n).toString();
        expect(msToNanos(milliseconds)).toBe(expected);
      }),
      { numRuns: 1_000 },
    );
  });

  it('removes process shutdown listeners after arbitrary exporter lifecycles', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (exporterCount) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
        const initialSigterm = process.listenerCount('SIGTERM');
        const initialSigint = process.listenerCount('SIGINT');
        const exporters = Array.from(
          { length: exporterCount },
          (_, index) =>
            new OtlpExporter({
              endpoint: 'https://otel.example.test',
              serviceName: `fuzz-${index}`,
              flushIntervalMs: 60_000,
            }),
        );

        await Promise.all(exporters.map((exporter) => exporter.shutdown()));

        expect(process.listenerCount('SIGTERM')).toBe(initialSigterm);
        expect(process.listenerCount('SIGINT')).toBe(initialSigint);
      }),
      { numRuns: 100 },
    );
  });

  it('drops only the oldest spans when an arbitrary queue overflows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 60 }),
        async (maxQueueSize, total) => {
          const mockFetch = vi.fn(async () => new Response(null, { status: 200 }));
          vi.stubGlobal('fetch', mockFetch);
          const exporter = new OtlpExporter({
            endpoint: 'https://otel.example.test',
            serviceName: 'fuzz',
            flushIntervalMs: 60_000,
            maxQueueSize,
            maxBatchSize: maxQueueSize + 1,
          });

          for (let index = 0; index < total; index++) exporter.addSpan(span(index));
          await exporter.shutdown();

          const firstRetained = Math.max(0, total - maxQueueSize);
          expect(exportedNames(mockFetch)).toEqual(
            Array.from({ length: Math.min(total, maxQueueSize) }, (_, offset) =>
              `span-${firstRetained + offset}`,
            ),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('exports every span exactly once in batches within the configured bound', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 60 }),
        async (maxBatchSize, total) => {
          const mockFetch = vi.fn(async () => new Response(null, { status: 200 }));
          vi.stubGlobal('fetch', mockFetch);
          const exporter = new OtlpExporter({
            endpoint: 'https://otel.example.test',
            serviceName: 'fuzz',
            flushIntervalMs: 60_000,
            maxQueueSize: 100,
            maxBatchSize,
          });

          for (let index = 0; index < total; index++) exporter.addSpan(span(index));
          await exporter.shutdown();

          expect(exportedNames(mockFetch)).toEqual(
            Array.from({ length: total }, (_, index) => `span-${index}`),
          );
          for (const call of mockFetch.mock.calls) {
            const payload = JSON.parse(String((call[1] as RequestInit).body));
            expect(payload.resourceSpans[0].scopeSpans[0].spans.length).toBeLessThanOrEqual(
              maxBatchSize,
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
