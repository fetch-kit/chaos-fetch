import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '../../src/middlewares/rateLimit';
import type { Context } from '../../src/registry/middleware';

type ModelEntry = { count: number; reset: number };
type Event = { advance: number; key: string };

const eventArbitrary: fc.Arbitrary<Event> = fc.record({
  advance: fc.integer({ min: 0, max: 25 }),
  key: fc.constantFrom('alpha', 'beta', 'gamma'),
});

function createContext(key: string): Context {
  return {
    req: new Request('https://example.test/resource', {
      headers: { 'x-fuzz-key': key },
    }),
    state: {},
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('rate limit fuzzing', () => {
  it('agrees with a per-key fixed-window reference model', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 25 }),
        fc.array(eventArbitrary, { minLength: 1, maxLength: 100 }),
        async (limit, windowMs, events) => {
          vi.useFakeTimers();
          let now = 1_000;
          vi.setSystemTime(now);
          const middleware = rateLimit({ limit, windowMs, key: 'x-fuzz-key' });
          const model = new Map<string, ModelEntry>();

          for (const event of events) {
            now += event.advance;
            vi.setSystemTime(now);
            let entry = model.get(event.key);
            if (!entry || now >= entry.reset) {
              entry = { count: 1, reset: now + windowMs };
            } else {
              entry = { ...entry, count: entry.count + 1 };
            }
            model.set(event.key, entry);

            const ctx = createContext(event.key);
            let delegated = false;
            await middleware(ctx, async () => {
              delegated = true;
              ctx.res = new Response('ok', { status: 200 });
            });

            const expectedAllowed = entry.count <= limit;
            expect(delegated).toBe(expectedAllowed);
            expect(ctx.res!.status).toBe(expectedAllowed ? 200 : 429);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('treats equivalent header and function key selectors identically', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 25 }),
        fc.array(eventArbitrary, { minLength: 1, maxLength: 80 }),
        async (limit, windowMs, events) => {
          vi.useFakeTimers();
          let now = 5_000;
          vi.setSystemTime(now);
          const byHeader = rateLimit({ limit, windowMs, key: 'x-fuzz-key' });
          const byFunction = rateLimit({
            limit,
            windowMs,
            key: (request) => request.headers.get('x-fuzz-key') ?? 'unknown',
          });

          for (const event of events) {
            now += event.advance;
            vi.setSystemTime(now);
            const headerCtx = createContext(event.key);
            const functionCtx = createContext(event.key);
            await byHeader(headerCtx, async () => {
              headerCtx.res = new Response('ok');
            });
            await byFunction(functionCtx, async () => {
              functionCtx.res = new Response('ok');
            });

            expect(headerCtx.res!.status).toBe(functionCtx.res!.status);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
