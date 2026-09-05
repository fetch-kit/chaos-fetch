import { pathToRegexp } from 'path-to-regexp';

export type MiddlewareConfig = Record<string, unknown>;

type CompiledRoute = {
  methods: string[];
  regexp: RegExp;
  middlewares: MiddlewareConfig[];
};

export class RouteMatcher {
  private routes: CompiledRoute[];

  constructor(routes: Record<string, MiddlewareConfig[]>) {
    this.routes = [];

    for (const key in routes) {
      // Preserve the existing route-key parsing: "METHOD /path" or "/path".
      const parts = key.split(' ');
      let method = '';
      let path = '';
      if (parts.length === 2) {
        method = parts[0];
        path = parts[1];
      } else {
        path = parts[0];
      }

      const methods = method ? [method.toUpperCase()] : [];
      // GET routes also match HEAD requests.
      if (methods.includes('GET')) methods.unshift('HEAD');

      this.routes.push({
        methods,
        regexp: pathToRegexp(path).regexp,
        middlewares: routes[key],
      });
    }
  }

  match(method: string, url: string): MiddlewareConfig[] {
    let path = '';
    try {
      path = new URL(url).pathname;
    } catch {
      path = url;
    }

    const methodUpper = method.toUpperCase();
    for (const route of this.routes) {
      if (
        route.regexp.test(path) &&
        (route.methods.length === 0 || route.methods.includes(methodUpper))
      ) {
        return route.middlewares;
      }
    }

    return [];
  }
}
