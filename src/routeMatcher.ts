export type MiddlewareConfig = Record<string, unknown>;

export interface RouteConfig {
  path: string;
  method?: string;
  middlewares: MiddlewareConfig[];
}

export class RouteMatcher {
  private routeMap: Map<string, MiddlewareConfig[]>;

  constructor(routes: Record<string, MiddlewareConfig[]>) {
    this.routeMap = new Map();
    for (const key in routes) {
      this.routeMap.set(key, routes[key]);
    }
  }

  match(method: string, url: string): MiddlewareConfig[] {
    let domain = "";
    let path = "";
    try {
      const urlObj = new URL(url);
      domain = urlObj.host;
      path = urlObj.pathname;
    } catch {
      path = url;
    }
    const methodUpper = method.toUpperCase();

    const key1 = `${methodUpper} ${domain}${path}`;
    if (this.routeMap.has(key1)) return this.routeMap.get(key1)!;

    const key2 = `${domain}${path}`;
    if (this.routeMap.has(key2)) return this.routeMap.get(key2)!;

    const key3 = `${methodUpper} ${path}`;
    if (this.routeMap.has(key3)) return this.routeMap.get(key3)!;

    if (this.routeMap.has(path)) return this.routeMap.get(path)!;

    for (const [key, mws] of this.routeMap.entries()) {
      const methodMatch = key.match(/^(\w+)\s+/);
      if (methodMatch) {
        const keyMethod = methodMatch[1].toUpperCase();
        const keyPath = key.slice(methodMatch[0].length);
        if (keyMethod === methodUpper && path.endsWith(keyPath)) {
          return mws;
        }
      } else {
        if (path.endsWith(key)) {
          return mws;
        }
      }
    }
    return [];
  }
}
