import { describe, it, expect } from 'vitest';
import { mock } from '../../src/middlewares/mock';
import type { Context } from '../../src/registry/middleware';

describe('mock middleware', () => {
  it('sets response with default status and body', async () => {
    const mw = mock({});
    const ctx: Context = { req: {} as Request };
    await mw(ctx, async () => {});
    expect(ctx.res).toBeDefined();
    expect(ctx.res!.status).toBe(200);
    const text = await ctx.res!.text();
    expect(text).toBe('');
  });

  it('sets response with custom status and body', async () => {
    const mw = mock({ status: 404, body: '{"error": "not found"}' });
    const ctx: Context = { req: {} as Request };
    await mw(ctx, async () => {});
    expect(ctx.res).toBeDefined();
    expect(ctx.res!.status).toBe(404);
    const text = await ctx.res!.text();
    expect(text).toBe('{"error": "not found"}');
  });
});
