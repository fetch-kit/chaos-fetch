import type { Middleware, Context } from '../registry/middleware';

export function fail(opts: { status?: number; body?: string }): Middleware {
  return async (ctx: Context) => {
    ctx.res = new Response(opts.body ?? 'Failed by chaos-fetch', {
      status: opts.status ?? 503,
    });
    // next is intentionally not called
  };
}
