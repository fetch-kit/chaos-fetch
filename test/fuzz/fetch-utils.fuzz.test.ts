import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceGlobalFetch, restoreGlobalFetch } from '../../src/fetchUtils';

const suiteFetch = globalThis.fetch;

afterEach(() => {
  restoreGlobalFetch();
  globalThis.fetch = suiteFetch;
});

describe('global fetch lifecycle fuzzing', () => {
  it('restores the fetch present at the start of every replacement cycle', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (cycleCount) => {
        for (let cycle = 0; cycle < cycleCount; cycle++) {
          const before = (async () => new Response(`before-${cycle}`)) as typeof fetch;
          const replacement = (async () => new Response(`replacement-${cycle}`)) as typeof fetch;
          globalThis.fetch = before;

          replaceGlobalFetch(replacement);
          expect(globalThis.fetch).toBe(replacement);
          restoreGlobalFetch();
          expect(globalThis.fetch).toBe(before);
        }
      }),
      { numRuns: 500 },
    );
  });
});
