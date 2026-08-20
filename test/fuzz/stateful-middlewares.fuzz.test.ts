import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { failFirstN } from '../../src/middlewares/failFirstN';
import { failNth } from '../../src/middlewares/failNth';
import type { Context } from '../../src/registry/middleware';

function createContext(): Context {
  return { req: new Request('https://example.test/resource'), state: {} };
}

describe('stateful middleware fuzzing', () => {
  it('failFirstN fails exactly the generated prefix', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 60 }),
        async (n, requestCount) => {
          const middleware = failFirstN({ n, status: 503, body: 'failed' });
          const statuses: number[] = [];
          let downstreamCalls = 0;

          for (let index = 0; index < requestCount; index++) {
            const ctx = createContext();
            await middleware(ctx, async () => {
              downstreamCalls++;
              ctx.res = new Response('ok', { status: 200 });
            });
            statuses.push(ctx.res!.status);
          }

          const failed = Math.min(n, requestCount);
          expect(statuses).toEqual([
            ...Array(failed).fill(503),
            ...Array(requestCount - failed).fill(200),
          ]);
          expect(downstreamCalls).toBe(requestCount - failed);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('failNth repeats with the generated period', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 100 }),
        async (n, requestCount) => {
          const middleware = failNth({ n, status: 500, body: 'failed' });
          const statuses: number[] = [];
          let downstreamCalls = 0;

          for (let index = 0; index < requestCount; index++) {
            const ctx = createContext();
            await middleware(ctx, async () => {
              downstreamCalls++;
              ctx.res = new Response('ok', { status: 200 });
            });
            statuses.push(ctx.res!.status);
          }

          const expected = Array.from({ length: requestCount }, (_, index) =>
            (index + 1) % n === 0 ? 500 : 200,
          );
          expect(statuses).toEqual(expected);
          expect(downstreamCalls).toBe(requestCount - Math.floor(requestCount / n));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps arbitrary failNth instances isolated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 15 }),
        fc.array(fc.constantFrom(0, 1), { minLength: 1, maxLength: 80 }),
        async (firstN, secondN, schedule) => {
          const middlewares = [failNth({ n: firstN }), failNth({ n: secondN })];
          const periods = [firstN, secondN];
          const counts = [0, 0];

          for (const selected of schedule) {
            counts[selected]++;
            const ctx = createContext();
            let delegated = false;
            await middlewares[selected](ctx, async () => {
              delegated = true;
              ctx.res = new Response('ok');
            });

            expect(ctx.res!.status).toBe(counts[selected] % periods[selected] === 0 ? 500 : 200);
            expect(delegated).toBe(counts[selected] % periods[selected] !== 0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
