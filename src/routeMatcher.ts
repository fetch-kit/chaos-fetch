import Router from '@koa/router';

interface LayerWithChaos extends Router.Layer {
  chaosMiddlewares?: MiddlewareConfig[];
}
export type MiddlewareConfig = Record<string, unknown>;

export class RouteMatcher {
  private router: Router;

  constructor(routes: Record<string, MiddlewareConfig[]>) {
    this.router = new Router();
    for (const key in routes) {
      // Parse key: "METHOD /path" or "/path"
      const parts = key.split(' ');
      let method = '';
      let path = '';
      if (parts.length === 2) {
        method = parts[0];
        path = parts[1];
      } else {
        path = parts[0];
      }
      const mws = routes[key];
      const layer = this.router.register(path, method ? [method.toUpperCase()] : [], () => {}) as LayerWithChaos;
      layer.chaosMiddlewares = mws;
    }
  }

  match(method: string, url: string): MiddlewareConfig[] {
    let path = '';
    try {
      const urlObj = new URL(url);
      path = urlObj.pathname;
    } catch {
      path = url;
    }
    const methodUpper = method.toUpperCase();
    // Match by method and path only
    const matchMethod = this.router.match(path, methodUpper);
    if (matchMethod && matchMethod.pathAndMethod.length > 0) {
      const layer = matchMethod.pathAndMethod[0];
      const chaosLayer = layer as LayerWithChaos;
      if (Array.isArray(chaosLayer.chaosMiddlewares)) {
        return chaosLayer.chaosMiddlewares;
      }
    }
    // ...existing code...
    return [];
  }
}
