import Router from '@koa/router';

export interface RouteConfig {
  path: string;
  method?: string;
  middlewares: any[];
}

export class RouteMatcher {
  private routeMap: Map<string, any[]>;

  constructor(routes: Record<string, any[]>) {
    this.routeMap = new Map();
    for (const key in routes) {
      // Accept keys like "METHOD domain/path", "domain/path", or "/path"
      this.routeMap.set(key, routes[key]);
    }
  }

  match(method: string, url: string): any[] {
    // Extract domain and path from url
    let domain = '';
    let path = '';
    try {
      const urlObj = new URL(url);
      domain = urlObj.host;
      path = urlObj.pathname;
    } catch {
      // If url is not absolute, treat as path only
      path = url;
    }
    const methodUpper = method.toUpperCase();

    // Try most specific: METHOD domain/path
    const key1 = `${methodUpper} ${domain}${path}`;
    if (this.routeMap.has(key1)) return this.routeMap.get(key1)!;

    // Next: domain/path
    const key2 = `${domain}${path}`;
    if (this.routeMap.has(key2)) return this.routeMap.get(key2)!;

    // Next: METHOD path
    const key3 = `${methodUpper} ${path}`;
    if (this.routeMap.has(key3)) return this.routeMap.get(key3)!;

    // Next: path only
    if (this.routeMap.has(path)) return this.routeMap.get(path)!;

    // Fallback: partial match (endsWith), but respect method if present in key
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
