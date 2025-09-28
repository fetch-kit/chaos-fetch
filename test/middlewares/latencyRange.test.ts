import { describe, it, expect, vi } from 'vitest';
import { latencyRange } from '../../src/middlewares/latencyRange';
import type { Context } from '../../src/registry/middleware';

describe('latencyRange middleware', () => {
  it('delays by a value within the specified range (using fake timers)', async () => {
    vi.useFakeTimers();
    const mw = latencyRange(10, 20);
    const ctx: Context = { req: {} as Request };
    // Run multiple times to check the range
    for (let i = 0; i < 5; i++) {
      let called = false;
      const promise = mw(ctx, async () => { called = true; });
      // Advance by less than minMs
      vi.advanceTimersByTime(9);
      await Promise.resolve();
      expect(called).toBe(false);
      // Advance by maxMs
      vi.advanceTimersByTime(20);
      await promise;
      expect(called).toBe(true);
    }
    vi.useRealTimers();
  });

  it('calls next after delay (using fake timers)', async () => {
    vi.useFakeTimers();
    const mw = latencyRange(5, 5);
    const ctx: Context = { req: {} as Request };
    const promise = mw(ctx, async () => { ctx.called = true; });
    vi.advanceTimersByTime(5);
    await promise;
    expect(ctx.called).toBe(true);
    vi.useRealTimers();
  });
});
