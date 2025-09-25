import { describe, it, expect } from 'vitest';
import { fail } from '../../src/middlewares/fail';

describe('fail middleware', () => {
  it('sets response with default status and body', async () => {
    const mw = fail({});
    const ctx: any = {};
    await mw(ctx, async () => {});
    expect(ctx.res).toBeDefined();
    expect(ctx.res.status).toBe(503);
    const text = await ctx.res.text();
    expect(text).toBe('Failed by chaos-fetch');
  });

  it('sets response with custom status and body', async () => {
    const mw = fail({ status: 404, body: 'not found' });
    const ctx: any = {};
    await mw(ctx, async () => {});
    expect(ctx.res).toBeDefined();
    expect(ctx.res.status).toBe(404);
    const text = await ctx.res.text();
    expect(text).toBe('not found');
  });
});
