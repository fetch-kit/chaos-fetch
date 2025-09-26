import compose from 'koa-compose';
import type { Middleware, Context } from './registry/middleware';

// Compose and run a middleware chain
export function runMiddlewares(middlewares: Middleware[], ctx: Context): Promise<void> {
  return compose(middlewares)(ctx, async () => {});
}
