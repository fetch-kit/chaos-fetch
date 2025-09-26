import { registerBuiltins } from './registry/builtin';
import { resolveMiddleware, Middleware, Context } from './registry/middleware';
import { runMiddlewares } from './middlewareEngine';
import { RouteMatcher } from './routeMatcher';

export { replaceGlobalFetch, restoreGlobalFetch } from './fetchUtils';
export { registerMiddleware } from './registry/middleware';

const nativeFetch = typeof fetch === 'function' ? fetch : undefined;

type MiddlewareConfig = Record<string, unknown>;

interface ChaosConfig {
  global: MiddlewareConfig[];
  routes: Record<string, MiddlewareConfig[]>;
}

export function createClient(
  config: ChaosConfig,
  baseFetch?: typeof fetch
): typeof fetch {
  registerBuiltins();
  const globalChain = config.global?.map?.(resolveMiddleware) ?? [];
  const routeMatcher = new RouteMatcher(config.routes ?? {});
  const realFetch = baseFetch || nativeFetch;

  const fetchWithChaos: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const method = req.method || 'GET';
    const routeMiddlewares = routeMatcher.match(method, req.url).map(resolveMiddleware);
    const chain: Middleware[] = [
      ...globalChain,
      ...routeMiddlewares,
      async (ctx: Context) => {
        if (!realFetch) throw new Error('No fetch implementation available');
        ctx.res = await realFetch(ctx.req);
      }
    ];
    const ctx: Context = { req, res: undefined, err: undefined, state: {} };
    await runMiddlewares(chain, ctx);
    if (ctx.res) return ctx.res;
    throw ctx.err || new Error('No response from chaos client');
  };

  return fetchWithChaos;
}