import { describe, it, expect } from 'vitest';
import { failNth } from '../../src/middlewares/failNth';

describe('failNth middleware', () => {
  it('fails on the Nth call', async () => {
    const mw = failNth({ n: 3, status: 400, body: 'fail' });
    const ctx: any = {};
    // First two calls should not fail
    for (let i = 0; i < 2; i++) {
      ctx.res = undefined;
      await mw(ctx, async () => { ctx.res = 'ok'; });
      expect(ctx.res).toBe('ok');
    }
    // Third call should fail
    ctx.res = undefined;
    await mw(ctx, async () => { ctx.res = 'ok'; });
    expect(ctx.res).toBeDefined();
    expect(ctx.res.status).toBe(400);
    const text = await ctx.res.text();
    expect(text).toBe('fail');
  });
});
