import { describe, it, expect } from 'vitest';
import { runMiddlewares } from '../src/middlewareEngine';

describe('runMiddlewares', () => {
  it('runs a single middleware', async () => {
    const ctx: any = {};
  const mw = async (ctx: any, next: any) => { ctx.called = true; await next(); };
    await runMiddlewares([mw], ctx);
    expect(ctx.called).toBe(true);
  });

  it('runs multiple middlewares in order', async () => {
    const ctx: any = { order: [] };
  const mw1 = async (ctx: any, next: any) => { ctx.order.push(1); await next(); ctx.order.push(4); };
  const mw2 = async (ctx: any, next: any) => { ctx.order.push(2); await next(); ctx.order.push(3); };
    await runMiddlewares([mw1, mw2], ctx);
    expect(ctx.order).toEqual([1, 2, 3, 4]);
  });

  it('short-circuits if next is not called', async () => {
    const ctx: any = { called: false };
  const mw1 = async (ctx: any, next: any) => { ctx.called = true; /* no next() */ };
  const mw2 = async (ctx: any, next: any) => { ctx.called2 = true; };
    await runMiddlewares([mw1, mw2], ctx);
    expect(ctx.called).toBe(true);
    expect(ctx.called2).toBeUndefined();
  });

  it('propagates errors', async () => {
    const ctx: any = {};
  const mw = async () => { throw new Error('fail'); };
    await expect(runMiddlewares([mw], ctx)).rejects.toThrow('fail');
  });
});
