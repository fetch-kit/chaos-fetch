import type { Middleware, Context } from '../registry/middleware';

export function failRandomly(opts: { rate: number; status?: number; body?: string }): Middleware {
  return async (ctx, next) => {
    if (Math.random() < opts.rate) {
      ctx.res = new Response(opts.body ?? 'Random failure', {
        status: opts.status ?? 503,
      });
      // next is intentionally not called
    } else {
      await next();
    }
  };
}
