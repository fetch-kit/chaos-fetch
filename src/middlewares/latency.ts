import type { Middleware } from '../registry/middleware';

export function latency(ms: number): Middleware {
  return async (ctx, next) => {
    await new Promise(resolve => setTimeout(resolve, ms));
    await next();
  };
}
