import type { Middleware } from '../registry/middleware';

export function failNth(opts: { n: number; status?: number; body?: string }): Middleware {
  let count = 0;
  return async (ctx, next) => {
    count++;
    if (count === opts.n) {
      ctx.res = new Response(opts.body ?? `Failed on request #${opts.n}`, {
        status: opts.status ?? 500,
      });
      count = 0;
      // next is intentionally not called
    } else {
      await next();
    }
  };
}
