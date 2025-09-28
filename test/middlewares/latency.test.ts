import { describe, it, expect, vi } from 'vitest';
import { latency } from '../../src/middlewares/latency';
import type { Context } from '../../src/registry/middleware';

describe('latency middleware', () => {
  it('delays by the specified ms (using fake timers)', async () => {
    vi.useFakeTimers();
    const mw = latency(50);
    const ctx: Context = { req: {} as Request };
    let called = false;
    const promise = mw(ctx, async () => { called = true; });
    vi.advanceTimersByTime(49);
    await Promise.resolve(); // allow any pending microtasks
    expect(called).toBe(false);
    vi.advanceTimersByTime(1);
    await promise;
    expect(called).toBe(true);
    vi.useRealTimers();
  });

  it('calls next after delay (using fake timers)', async () => {
    vi.useFakeTimers();
    const mw = latency(10);
    const ctx: Context = { req: {} as Request };
    const promise = mw(ctx, async () => { ctx.called = true; });
    vi.advanceTimersByTime(10);
    await promise;
    expect(ctx.called).toBe(true);
    vi.useRealTimers();
  });
});
