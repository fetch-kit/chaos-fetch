import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, registerBuiltins, registerMiddleware } from '../src/index';
import {
  generateTraceId,
  generateSpanId,
  spanToOtlpJson,
  createSpan,
  Span,
} from '../src/telemetry/span';
import {
  parseTraceparent,
  formatTraceparent,
  extractTraceContext,
  injectTraceContext,
  setTraceContextInCtx,
  getTraceContextFromCtx,
  getTraceIdFromContext,
} from '../src/telemetry/context';
import type { Context } from '../src/registry/middleware';
import { OtlpExporter } from '../src/telemetry/exporter';

describe('telemetry', () => {
  beforeEach(() => {
    registerBuiltins();
  });

  describe('span generation', () => {
    it('generateTraceId returns 32-char hex string', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generateSpanId returns 16-char hex string', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('creates span with correct structure', () => {
      const traceId = generateTraceId();
      const span = createSpan(traceId, 'GET', 'https://api.example.com/users', 'my-service');

      expect(span.traceId).toBe(traceId);
      expect(span.method).toBe('GET');
      expect(span.url).toBe('https://api.example.com/users');
      expect(span.path).toBe('/users');
      expect(span.serviceName).toBe('my-service');
      expect(span.name).toBe('GET /users');
    });

    it('handles URLs with query parameters', () => {
      const span = createSpan(
        generateTraceId(),
        'GET',
        'https://api.example.com/users?page=1&limit=10',
        'my-service'
      );

      expect(span.path).toBe('/users?page=1&limit=10');
    });

    it('handles malformed URLs gracefully', () => {
      const traceId = generateTraceId();
      const span = createSpan(traceId, 'GET', 'not-a-url', 'my-service');

      expect(span.path).toBe('not-a-url');
      expect(span.url).toBe('not-a-url');
    });

    it('generateTraceId uses Math.random fallback when crypto is unavailable', () => {
      const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.625); // floor(0.625 * 16) => 10 => 'a'

      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      try {
        const traceId = generateTraceId();
        expect(traceId).toBe('a'.repeat(32));
      } finally {
        randomSpy.mockRestore();
        if (originalCryptoDescriptor) {
          Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
        }
      }
    });

    it('generateSpanId uses Math.random fallback when crypto is unavailable', () => {
      const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.625); // floor(0.625 * 16) => 10 => 'a'

      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      try {
        const spanId = generateSpanId();
        expect(spanId).toBe('a'.repeat(16));
      } finally {
        randomSpy.mockRestore();
        if (originalCryptoDescriptor) {
          Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
        }
      }
    });
  });

  describe('OTLP serialization', () => {
    it('converts span to OTLP JSON format', () => {
      const span: Span = {
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: '1234567890abcdef',
        name: 'GET /users',
        startTimeMs: 1000,
        endTimeMs: 1100,
        durationMs: 100,
        method: 'GET',
        url: 'https://api.example.com/users',
        path: '/users',
        status: 200,
        serviceName: 'my-service',
      };

      const otlp = spanToOtlpJson(span) as {
        traceId: string;
        spanId: string;
        name: string;
        kind: string;
        status: { code: string; message: string };
      };

      expect(otlp.traceId).toBe('1234567890abcdef1234567890abcdef');
      expect(otlp.spanId).toBe('1234567890abcdef');
      expect(otlp.name).toBe('GET /users');
      expect(otlp.kind).toBe('SPAN_KIND_CLIENT');
      expect(otlp.status.code).toBe('STATUS_CODE_OK');
    });

    it('includes error status in OTLP', () => {
      const span: Span = {
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: '1234567890abcdef',
        name: 'GET /users',
        startTimeMs: 1000,
        endTimeMs: 1100,
        durationMs: 100,
        method: 'GET',
        url: 'https://api.example.com/users',
        path: '/users',
        serviceName: 'my-service',
        error: true,
        errorMessage: 'Connection timeout',
      };

      const otlp = spanToOtlpJson(span) as {
        status: { code: string; message: string };
      };

      expect(otlp.status.code).toBe('STATUS_CODE_ERROR');
      expect(otlp.status.message).toBe('Connection timeout');
    });
  });

  describe('W3C Trace Context headers', () => {
    it('parses valid traceparent header', () => {
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const context = parseTraceparent(traceparent);

      expect(context).not.toBeNull();
      expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(context?.spanId).toBe('b7ad6b7169203331');
      expect(context?.traceFlags).toBe('01');
    });

    it('rejects malformed traceparent header', () => {
      expect(parseTraceparent('invalid')).toBeNull();
      expect(parseTraceparent('00-invalid-invalid-xx')).toBeNull();
      expect(parseTraceparent('01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')).toBeNull();
    });

    it('formats trace context to traceparent header', () => {
      const context = {
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: '01',
      };

      const traceparent = formatTraceparent(context);

      expect(traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    });

    it('extracts trace context from request headers', () => {
      const req = new Request('https://example.com', {
        headers: {
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        },
      });

      const context = extractTraceContext(req);

      expect(context).not.toBeNull();
      expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    });

    it('injects trace context into request headers', () => {
      const req = new Request('https://example.com');
      const context = {
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: '01',
      };

      const newReq = injectTraceContext(req, context);

      expect(newReq.headers.get('traceparent')).toBe(
        '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      );
      expect(newReq.headers.get('tracestate')).toBe('');
    });

    it('returns null when traceparent is missing', () => {
      expect(parseTraceparent(undefined)).toBeNull();
    });

    it('rejects all-zero span ID', () => {
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01';
      expect(parseTraceparent(traceparent)).toBeNull();
    });

    it('rejects invalid trace flags', () => {
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-gg';
      expect(parseTraceparent(traceparent)).toBeNull();
    });
  });

  describe('trace context helpers', () => {
    it('returns null when context does not contain trace context', () => {
      const ctx = {
        req: new Request('https://example.test'),
      } as unknown as Context;

      expect(getTraceContextFromCtx(ctx)).toBeNull();
    });

    it('prefers stored trace ID over request header trace ID', () => {
      const ctx = {
        req: new Request('https://example.test'),
      } as unknown as Context;

      const storedContext = {
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        spanId: 'bbbbbbbbbbbbbbbb',
        traceFlags: '01',
      };
      setTraceContextInCtx(ctx, storedContext);

      const req = new Request('https://example.test', {
        headers: {
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        },
      });

      expect(getTraceIdFromContext(ctx, req)).toBe(storedContext.traceId);
    });

    it('uses request header trace ID when stored context is missing', () => {
      const ctx = {
        req: new Request('https://example.test'),
      } as unknown as Context;

      const req = new Request('https://example.test', {
        headers: {
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        },
      });

      expect(getTraceIdFromContext(ctx, req)).toBe('0af7651916cd43dd8448eb211c80319c');
    });

    it('returns null when neither stored nor request context exists', () => {
      const ctx = {
        req: new Request('https://example.test'),
      } as unknown as Context;

      expect(getTraceIdFromContext(ctx)).toBeNull();
    });
  });

  describe('OTLP exporter', () => {
    it('batches spans and exports to OTLP endpoint', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response('', { status: 200 });
      });

      // Replace global fetch with mock
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          maxBatchSize: 2,
        });

        const span1 = createSpan(generateTraceId(), 'GET', 'https://api.test/1', 'test');
        span1.status = 200;
        span1.endTimeMs = span1.startTimeMs + 50;

        const span2 = createSpan(generateTraceId(), 'POST', 'https://api.test/2', 'test');
        span2.status = 201;
        span2.endTimeMs = span2.startTimeMs + 100;

        exporter.addSpan(span1);
        exporter.addSpan(span2); // Should trigger flush at batch size 2

        // Wait a tick for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        await exporter.shutdown();

        expect(mockFetch).toHaveBeenCalled();
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs).toBeDefined();
        const [exportUrl, exportInit] = callArgs;
        expect(String(exportUrl)).toContain('/v1/traces');
        expect((exportInit as RequestInit | undefined)?.method).toBe('POST');

        const payload = JSON.parse(((exportInit as RequestInit).body ?? '') as string);
        expect(payload.resourceSpans).toBeDefined();
        expect(payload.resourceSpans[0].resource.attributes[0].value.stringValue).toBe('test');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('flushes periodically based on interval', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response('', { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          flushIntervalMs: 50,
          maxBatchSize: 1000, // High to avoid batch-triggered flush
        });

        const span = createSpan(generateTraceId(), 'GET', 'https://api.test/1', 'test');
        exporter.addSpan(span);

        // Wait for periodic flush
        await new Promise(resolve => setTimeout(resolve, 100));

        await exporter.shutdown();

        expect(mockFetch).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles export errors gracefully', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        throw new Error('Network error');
      });

      const originalFetch = globalThis.fetch;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
        });

        const span = createSpan(generateTraceId(), 'GET', 'https://api.test/1', 'test');
        exporter.addSpan(span);

        await exporter.flush();
        await exporter.shutdown();

        // Should have logged error but not thrown
        expect(consoleError).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        consoleError.mockRestore();
      }
    });

    it('includes optional headers in export request', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response('', { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          headers: {
            'Authorization': 'Bearer token123',
            'X-Custom': 'value',
          },
        });

        const span = createSpan(generateTraceId(), 'GET', 'https://api.test/1', 'test');
        exporter.addSpan(span);

        await exporter.flush();
        await exporter.shutdown();

        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs).toBeDefined();
        const [, exportInit] = callArgs;
        const headers = new Headers((exportInit as RequestInit | undefined)?.headers);
        expect(headers.get('Authorization')).toBe('Bearer token123');
        expect(headers.get('X-Custom')).toBe('value');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('ignores new spans after shutdown starts', async () => {
      const mockFetch = vi.fn(async (): Promise<Response> => {
        return new Response('', { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          maxBatchSize: 1,
        });

        await exporter.shutdown();
        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/ignored', 'test'));

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockFetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('drops oldest spans when queue exceeds maxQueueSize', async () => {
      const mockFetch = vi.fn(async (): Promise<Response> => {
        return new Response('', { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          maxBatchSize: 10,
          maxQueueSize: 1,
          flushIntervalMs: 60_000,
        });

        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/first', 'test'));
        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/second', 'test'));

        await exporter.flush();
        await exporter.shutdown();

        expect(mockFetch).toHaveBeenCalled();
        const firstCall = mockFetch.mock.calls[0];
        const firstInit = Array.isArray(firstCall)
          ? ((firstCall as unknown[])[1] as RequestInit | undefined)
          : undefined;
        const payload = JSON.parse(
          ((firstInit as RequestInit | undefined)?.body ?? '') as string
        );
        const exportedSpans = payload.resourceSpans[0].scopeSpans[0].spans as Array<{ name: string }>;
        expect(exportedSpans).toHaveLength(1);
        expect(exportedSpans[0].name).toContain('/second');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('logs errors when batch-size auto flush promise rejects', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          maxBatchSize: 1,
        });

        const flushSpy = vi
          .spyOn(exporter as unknown as { flush: () => Promise<void> }, 'flush')
          .mockRejectedValueOnce(new Error('forced flush rejection'));

        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/fail', 'test'));
        await new Promise(resolve => setTimeout(resolve, 10));
        flushSpy.mockRestore();
        await exporter.shutdown();

        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to flush on batch size reached')
        );
      } finally {
        consoleError.mockRestore();
      }
    });

    it('logs OTLP non-ok responses from export path', async () => {
      const mockFetch = vi.fn(async (): Promise<Response> => {
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });

      const originalFetch = globalThis.fetch;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
        });

        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/non-ok', 'test'));
        await exporter.flush();
        await exporter.shutdown();

        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('OTLP export failed: 503 Service Unavailable')
        );
      } finally {
        globalThis.fetch = originalFetch;
        consoleError.mockRestore();
      }
    });

    it('logs timer flush failures from interval callback', async () => {
      vi.useFakeTimers();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          flushIntervalMs: 10,
          maxBatchSize: 100,
        });

        const flushSpy = vi
          .spyOn(exporter as unknown as { flush: () => Promise<void> }, 'flush')
          .mockRejectedValueOnce(new Error('forced timer flush rejection'));

        await vi.advanceTimersByTimeAsync(20);
        flushSpy.mockRestore();
        await exporter.shutdown();

        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to flush on timer')
        );
      } finally {
        consoleError.mockRestore();
        vi.useRealTimers();
      }
    });

    it('registers node signal hooks and executes captured shutdown handler', async () => {
      const mockFetch = vi.fn(async (): Promise<Response> => {
        return new Response('', { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      const processOnSpy = vi.spyOn(process, 'on');
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          maxBatchSize: 1,
        });

        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/signal', 'test'));

        const sigtermCall = processOnSpy.mock.calls.find((call) => call[0] === 'SIGTERM');
        const shutdownHandler = sigtermCall?.[1] as (() => Promise<void>) | undefined;

        expect(shutdownHandler).toBeDefined();
        if (shutdownHandler) {
          await shutdownHandler();
        }

        expect(mockFetch).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        processOnSpy.mockRestore();
      }
    });

    it('registers browser lifecycle hooks and runs captured browser shutdown handler', async () => {
      const mockFetch = vi.fn(async (): Promise<Response> => {
        return new Response('', { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const eventHandlers = new Map<string, () => Promise<void> | void>();
      const addEventListener = vi.fn((eventName: string, handler: () => Promise<void> | void) => {
        eventHandlers.set(eventName, handler);
      });

      Object.defineProperty(globalThis, 'window', {
        value: { addEventListener },
        configurable: true,
      });

      try {
        const exporter = new OtlpExporter({
          endpoint: 'http://localhost:4318',
          serviceName: 'test',
          maxBatchSize: 1,
        });

        expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
        expect(addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));

        exporter.addSpan(createSpan(generateTraceId(), 'GET', 'https://api.test/browser', 'test'));
        const pagehideHandler = eventHandlers.get('pagehide');
        expect(pagehideHandler).toBeDefined();

        if (pagehideHandler) {
          await pagehideHandler();
        }

        expect(mockFetch).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;

        if (originalWindowDescriptor) {
          Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
        } else {
          delete (globalThis as { window?: unknown }).window;
        }
      }
    });
  });

  describe('telemetry middleware integration', () => {
    it('captures request telemetry and exports spans', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const exportFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response(null, { status: 204 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: RequestInfo | URL, options?: RequestInit) => {
        const rawUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (rawUrl.includes('/v1/traces')) {
          return exportFetch(url, options);
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      try {
        const chaosFetch = createClient({
          otel: {
            serviceName: 'test-client',
            endpoint: 'http://localhost:4318',
            maxBatchSize: 1,
          },
          global: [],
        }, mockFetch);

        const res = await chaosFetch('https://api.test/users');
        expect(res.status).toBe(200);

        // Wait for telemetry export
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(exportFetch).toHaveBeenCalled();
        const payload = JSON.parse(((exportFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? '') as string);
        const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

        expect(span.name).toContain('GET');
        const keyValues = span.attributes as Array<{ key: string }>;
        expect(keyValues.some((kv) => kv.key === 'http.status_code')).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('propagates W3C trace context to downstream requests', async () => {
      const capturedRequests: Request[] = [];
      const mockFetch = vi.fn(async (req: RequestInfo | URL): Promise<Response> => {
        if (req instanceof Request) {
          capturedRequests.push(req);
        }
        return new Response('ok', { status: 200 });
      });

      const exportFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response(null, { status: 204 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: RequestInfo | URL, options?: RequestInit) => {
        const rawUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (rawUrl.includes('/v1/traces')) {
          return exportFetch(url, options);
        }
        return mockFetch(url);
      }) as typeof fetch;

      try {
        const chaosFetch = createClient({
          otel: {
            serviceName: 'test-client',
            endpoint: 'http://localhost:4318',
          },
          global: [],
        }, mockFetch);

        await chaosFetch('https://api.test/users');

        // Check that traceparent header was injected
        const req = capturedRequests[capturedRequests.length - 1];
        const traceparent = req.headers.get('traceparent');

        expect(traceparent).toBeDefined();
        expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('captures error spans', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response('Server error', { status: 500 });
      });

      const exportFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response(null, { status: 204 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: RequestInfo | URL, options?: RequestInit) => {
        const rawUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (rawUrl.includes('/v1/traces')) {
          return exportFetch(url, options);
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      try {
        const chaosFetch = createClient({
          otel: {
            serviceName: 'test-client',
            endpoint: 'http://localhost:4318',
            maxBatchSize: 1,
          },
          global: [],
        }, mockFetch);

        const res = await chaosFetch('https://api.test/users');
        expect(res.status).toBe(500);

        await new Promise(resolve => setTimeout(resolve, 50));

        const payload = JSON.parse(((exportFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? '') as string);
        const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

        expect(span.status.code).toBe('STATUS_CODE_ERROR');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('captures thrown downstream middleware errors into span error fields', async () => {
      registerMiddleware('throwError', () => async () => {
        throw new Error('downstream boom');
      });

      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response('ok', { status: 200 });
      });

      const exportFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response(null, { status: 204 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: RequestInfo | URL, options?: RequestInit) => {
        const rawUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (rawUrl.includes('/v1/traces')) {
          return exportFetch(url, options);
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      try {
        const chaosFetch = createClient({
          otel: {
            serviceName: 'test-client',
            endpoint: 'http://localhost:4318',
            maxBatchSize: 1,
          },
          global: [{ throwError: {} }],
        }, mockFetch);

        await expect(chaosFetch('https://api.test/users')).rejects.toThrow('No response from chaos client');

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(exportFetch).toHaveBeenCalled();
        const payload = JSON.parse(((exportFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? '') as string);
        const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

        expect(span.status.code).toBe('STATUS_CODE_ERROR');
        expect(span.status.message).toContain('downstream boom');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('middleware configuration', () => {
    it('requires endpoint and serviceName', () => {
      expect(() => {
        createClient({
          otel: { endpoint: 'http://localhost:4318' },
        } as unknown as Parameters<typeof createClient>[0]);
      }).toThrow('serviceName');

      expect(() => {
        createClient({
          otel: { serviceName: 'test' },
        } as unknown as Parameters<typeof createClient>[0]);
      }).toThrow('endpoint');
    });

    it('accepts optional configuration options', async () => {
      const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response('ok', { status: 200 });
      });

      const exportFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return new Response(null, { status: 204 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: RequestInfo | URL, options?: RequestInit) => {
        const rawUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (rawUrl.includes('/v1/traces')) {
          return exportFetch(url, options);
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      try {
        const chaosFetch = createClient({
          otel: {
            serviceName: 'test',
            endpoint: 'http://localhost:4318',
            flushIntervalMs: 100,
            maxBatchSize: 50,
            maxQueueSize: 500,
            headers: { 'X-Test': 'value' },
          },
          global: [],
        }, mockFetch);

        await chaosFetch('https://api.test/path1');

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(exportFetch).not.toHaveBeenCalled(); // Should not flush yet (no batch size reached, timer not fired)
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
