import { describe, it, expect } from 'vitest';
import { failFirstN } from '../../src/middlewares/failFirstN';
import type { Context } from '../../src/registry/middleware';

describe('failFirstN middleware', () => {
  it('fails the first N requests and then passes through', async () => {
    const mw = failFirstN({ n: 2, status: 429, body: 'too early' });

    const ctx1: Context = { req: {} as Request };
    await mw(ctx1, async () => {
      ctx1.res = new Response('ok');
    });
    expect(ctx1.res).toBeDefined();
    expect(ctx1.res!.status).toBe(429);
    expect(await ctx1.res!.text()).toBe('too early');

    const ctx2: Context = { req: {} as Request };
    await mw(ctx2, async () => {
      ctx2.res = new Response('ok');
    });
    expect(ctx2.res).toBeDefined();
    expect(ctx2.res!.status).toBe(429);
    expect(await ctx2.res!.text()).toBe('too early');

    const ctx3: Context = { req: {} as Request };
    await mw(ctx3, async () => {
      ctx3.res = new Response('ok');
    });
    expect(ctx3.res).toBeDefined();
    expect(ctx3.res!.status).toBe(200);
    expect(await ctx3.res!.text()).toBe('ok');

    const ctx4: Context = { req: {} as Request };
    await mw(ctx4, async () => {
      ctx4.res = new Response('ok');
    });
    expect(ctx4.res).toBeDefined();
    expect(ctx4.res!.status).toBe(200);
    expect(await ctx4.res!.text()).toBe('ok');
  });

  it('uses fail defaults when status/body are omitted', async () => {
    const mw = failFirstN({ n: 1 });
    const ctx: Context = { req: {} as Request };
    await mw(ctx, async () => {
      ctx.res = new Response('ok');
    });
    expect(ctx.res).toBeDefined();
    expect(ctx.res!.status).toBe(503);
    expect(await ctx.res!.text()).toBe('Failed by chaos-fetch');
  });

  it('does not call next while failing', async () => {
    const mw = failFirstN({ n: 1 });
    let nextCalled = false;
    const ctx: Context = { req: {} as Request };

    await mw(ctx, async () => {
      nextCalled = true;
      ctx.res = new Response('ok');
    });

    expect(nextCalled).toBe(false);
    expect(ctx.res).toBeDefined();
    expect(ctx.res!.status).toBe(503);
  });

  it('keeps counters isolated between middleware instances', async () => {
    const mwA = failFirstN({ n: 1, status: 418, body: 'a' });
    const mwB = failFirstN({ n: 1, status: 409, body: 'b' });

    const ctxA1: Context = { req: {} as Request };
    await mwA(ctxA1, async () => {
      ctxA1.res = new Response('ok');
    });
    expect(ctxA1.res!.status).toBe(418);

    const ctxB1: Context = { req: {} as Request };
    await mwB(ctxB1, async () => {
      ctxB1.res = new Response('ok');
    });
    expect(ctxB1.res!.status).toBe(409);

    const ctxA2: Context = { req: {} as Request };
    await mwA(ctxA2, async () => {
      ctxA2.res = new Response('ok');
    });
    expect(ctxA2.res!.status).toBe(200);
  });
});
