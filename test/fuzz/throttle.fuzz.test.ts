import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { throttle } from '../../src/middlewares/throttle';
import type { Context } from '../../src/registry/middleware';

const chunksArbitrary = fc.array(fc.uint8Array({ minLength: 1, maxLength: 40 }), {
  minLength: 1,
  maxLength: 10,
});

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function settleTimers<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('throttle fuzzing', () => {
  it('preserves arbitrary browser-stream chunk partitions byte for byte', async () => {
    await fc.assert(
      fc.asyncProperty(
        chunksArbitrary,
        fc.integer({ min: 1, max: 100_000 }),
        async (chunks, rate) => {
          vi.useFakeTimers();
          const source = new ReadableStream<Uint8Array>({
            start(controller) {
              chunks.forEach((chunk) => controller.enqueue(chunk));
              controller.close();
            },
          });
          const ctx: Context = {
            req: new Request('https://example.test/stream'),
            res: new Response(source),
            state: {},
          };

          await throttle({ rate })(ctx, async () => {});
          const bodyPromise = ctx.res!.arrayBuffer();
          const body = new Uint8Array(await settleTimers(bodyPromise));

          expect(body).toEqual(concatenate(chunks));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('propagates cancellation after an arbitrary consumed prefix', async () => {
    await fc.assert(
      fc.asyncProperty(
        chunksArbitrary,
        fc.integer({ min: 0, max: 20 }),
        async (chunks, requestedReads) => {
          vi.useFakeTimers();
          let sourceCancelled = false;
          let nextChunk = 0;
          const source = new ReadableStream<Uint8Array>({
            pull(controller) {
              if (nextChunk < chunks.length) {
                controller.enqueue(chunks[nextChunk++]);
              }
            },
            cancel() {
              sourceCancelled = true;
            },
          });
          const ctx: Context = {
            req: new Request('https://example.test/stream'),
            res: new Response(source),
            state: {},
          };

          await throttle({ rate: 10_000 })(ctx, async () => {});
          const reader = ctx.res!.body!.getReader();
          const reads = Math.min(requestedReads, chunks.length - 1);
          for (let index = 0; index < reads; index++) {
            await settleTimers(reader.read());
          }
          await reader.cancel('consumer stopped');

          expect(sourceCancelled).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
