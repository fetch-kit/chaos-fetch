import type { Middleware, Context } from '../registry/middleware';

export function failFirstN(opts: { n: number; status?: number; body?: string }): Middleware {
  let count = 0;
  return async (ctx: Context, next) => {
    if (count < opts.n) {
      count++;
      ctx.res = new Response(opts.body ?? 'Failed by chaos-fetch', {
        status: opts.status ?? 503,
      });
      // next is intentionally not called
    } else {
      await next();
    }
  };
}
