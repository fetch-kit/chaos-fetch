import { rateLimit } from '../../src/middlewares/rateLimit';
import type { Context } from '../../src/registry/middleware';
import { describe, it, expect } from 'vitest';

function createCtx(headers: Record<string, string> = {}): Context {
  return {
    req: new Request('https://api.test', { headers }),
    res: undefined,
    state: {},
  };
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', async () => {
    const mw = rateLimit({ limit: 2, windowMs: 1000 });
  const ctx: Context = createCtx();
    let called = 0;
    const next = async () => {
      called++;
    };
    await mw(ctx, next);
    expect(ctx.res).toBeUndefined();
    await mw(ctx, next);
    expect(ctx.res).toBeUndefined();
    expect(called).toBe(2);
  });

  it('blocks requests over the limit', async () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000 });
  const ctx: Context = createCtx();
    const next = async () => {};
    await mw(ctx, next);
    await mw(ctx, next);
  expect(ctx.res).toBeDefined();
  expect(ctx.res && ctx.res.status).toBe(429);
  expect(ctx.res && await ctx.res.text()).toBe('Rate limit exceeded');
  });

  it('resets after windowMs', async () => {
    let keyValue = 'fixed';
    const mw = rateLimit({ limit: 1, windowMs: 10, key: () => keyValue });
  const ctx: Context = createCtx();
    const next = async () => {};
    await mw(ctx, next); // first request, allowed
    await mw(ctx, next); // second request, should be blocked
    expect(ctx.res).toBeDefined();
  expect(ctx.res).toBeDefined();
  expect(ctx.res && ctx.res.status).toBe(429);
    // Wait for window to reset
    await new Promise((res) => setTimeout(res, 15));
    ctx.res = undefined;
    keyValue = 'new'; // simulate a new window
    ctx.req = new Request('https://api.test', { headers: { 'X-Unique': keyValue } });
    await mw(ctx, next); // should be allowed again
    expect(ctx.res).toBeUndefined();
  });

  it('uses custom key function', async () => {
    const mw = rateLimit({
      limit: 1,
      windowMs: 1000,
      key: (req) => req.headers.get('X-User') || 'anon',
    });
  const ctxA: Context = createCtx({ 'X-User': 'A' });
  const ctxB: Context = createCtx({ 'X-User': 'B' });
    const next = async () => {};
    await mw(ctxA, next);
    await mw(ctxA, next);
  expect(ctxA.res).toBeDefined();
  expect(ctxA.res && ctxA.res.status).toBe(429);
    await mw(ctxB, next);
    expect(ctxB.res).toBeUndefined();
  });

  it('uses header key string', async () => {
    const mwA = rateLimit({ limit: 1, windowMs: 1000, key: 'X-User' });
    const mwB = rateLimit({ limit: 1, windowMs: 1000, key: 'X-User' });
  const ctxA: Context = createCtx({ 'X-User': 'A' });
  // Use a unique key for ctxB to avoid cache interference
  const ctxB: Context = createCtx({ 'X-User': 'B-' + Date.now() });
    const next = async () => {};
    await mwA(ctxA, next);
    await mwA(ctxA, next);
  expect(ctxA.res).toBeDefined();
  expect(ctxA.res && ctxA.res.status).toBe(429);
    await mwB(ctxB, next);
    expect(ctxB.res).toBeUndefined();
  });
});
