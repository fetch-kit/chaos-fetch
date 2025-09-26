import { describe, it, expect } from 'vitest';
import { runMiddlewares } from '../src/middlewareEngine';

describe('runMiddlewares', () => {
  it('runs a single middleware', async () => {
  const ctx = { req: new Request('https://api.test') };
    const mw = async (ctx: Record<string, unknown>, next: () => Promise<void>) => { ctx.called = true; await next(); };
    await runMiddlewares([mw], ctx);
  expect((ctx as Record<string, unknown>).called).toBe(true);
  });

  it('runs multiple middlewares in order', async () => {
  const ctx = { req: new Request('https://api.test'), order: [] };
    const mw1 = async (ctx: Record<string, unknown>, next: () => Promise<void>) => {
      (ctx.order as number[]).push(1);
      await next();
      (ctx.order as number[]).push(4);
    };
    const mw2 = async (ctx: Record<string, unknown>, next: () => Promise<void>) => {
      (ctx.order as number[]).push(2);
      await next();
      (ctx.order as number[]).push(3);
    };
    await runMiddlewares([mw1, mw2], ctx);
    expect(ctx.order).toEqual([1, 2, 3, 4]);
  });

  it('short-circuits if next is not called', async () => {
  const ctx = { req: new Request('https://api.test'), called: false };
    const mw1 = async (ctx: Record<string, unknown>) => { ctx.called = true; /* no next() */ };
    const mw2 = async (ctx: Record<string, unknown>) => { ctx.called2 = true; };
    await runMiddlewares([mw1, mw2], ctx);
    expect(ctx.called).toBe(true);
  expect((ctx as Record<string, unknown>).called2).toBeUndefined();
  });

  it('propagates errors', async () => {
  const ctx = { req: new Request('https://api.test') };
    const mw = async () => { throw new Error('fail'); };
    await expect(runMiddlewares([mw], ctx)).rejects.toThrow('fail');
  });
});
