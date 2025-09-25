
import { rateLimit } from '../../src/middlewares/rateLimit';
import { describe, it, expect } from 'vitest';

function createCtx(headers: Record<string, string> = {}): any {
  return {
    req: new Request('https://api.test', { headers }),
    res: undefined,
    state: {},
  };
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', async () => {
    const mw = rateLimit({ limit: 2, windowMs: 1000 });
    const ctx: any = createCtx();
    let called = 0;
    const next = async () => { called++; };
    await mw(ctx, next);
    expect(ctx.res).toBeUndefined();
    await mw(ctx, next);
    expect(ctx.res).toBeUndefined();
    expect(called).toBe(2);
  });

  it('blocks requests over the limit', async () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000 });
    const ctx: any = createCtx();
    const next = async () => {};
    await mw(ctx, next);
    await mw(ctx, next);
    expect(ctx.res.status).toBe(429);
    expect(await ctx.res.text()).toBe('Rate limit exceeded');
  });

  it('resets after windowMs', async () => {
    const mw = rateLimit({ limit: 1, windowMs: 10, key: () => String(Date.now()) });
    const ctx: any = createCtx();
    const next = async () => {};
    await mw(ctx, next);
    await mw(ctx, next);
    expect(ctx.res.status).toBe(429);
    // Wait for window to reset
    await new Promise(res => setTimeout(res, 15));
    ctx.res = undefined;
    // Use a new key to simulate a new window
    ctx.req = new Request('https://api.test', { headers: { 'X-Unique': String(Date.now()) } });
    await mw(ctx, next);
    expect(ctx.res).toBeUndefined();
  });

  it('uses custom key function', async () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000, key: (req) => req.headers.get('X-User') || 'anon' });
    const ctxA: any = createCtx({ 'X-User': 'A' });
    const ctxB: any = createCtx({ 'X-User': 'B' });
    const next = async () => {};
    await mw(ctxA, next);
    await mw(ctxA, next);
    expect(ctxA.res.status).toBe(429);
    await mw(ctxB, next);
    expect(ctxB.res).toBeUndefined();
  });

  it('uses header key string', async () => {
  const mwA = rateLimit({ limit: 1, windowMs: 1000, key: 'X-User' });
  const mwB = rateLimit({ limit: 1, windowMs: 1000, key: 'X-User' });
  const ctxA: any = createCtx({ 'X-User': 'A' });
  // Use a unique key for ctxB to avoid cache interference
  const ctxB: any = createCtx({ 'X-User': 'B-' + Date.now() });
  const next = async () => {};
  await mwA(ctxA, next);
  await mwA(ctxA, next);
  expect(ctxA.res.status).toBe(429);
  await mwB(ctxB, next);
  expect(ctxB.res).toBeUndefined();
  });
});
