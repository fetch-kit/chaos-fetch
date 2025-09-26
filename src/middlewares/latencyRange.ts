import type { Middleware } from '../registry/middleware';

export function latencyRange(minMs: number, maxMs: number): Middleware {
  return async (ctx, next) => {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    await next();
  };
}
