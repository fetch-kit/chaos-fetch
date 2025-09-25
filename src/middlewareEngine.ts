import compose from 'koa-compose';
import type { Middleware } from './registry/middleware';

// Compose and run a middleware chain
export function runMiddlewares(middlewares: Middleware[], ctx: any): Promise<void> {
  return compose(middlewares)(ctx, async () => {});
}
