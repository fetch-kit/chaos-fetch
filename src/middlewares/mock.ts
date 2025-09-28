import type { Middleware, Context } from '../registry/middleware';

export function mock(opts: { status?: number; body?: string }): Middleware {
  return async (ctx: Context) => {
    ctx.res = new Response(opts.body, {
      status: opts.status ?? 200,
    });
    // next is intentionally not called
  };
}
