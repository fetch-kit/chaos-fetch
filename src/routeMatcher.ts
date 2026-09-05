import { pathToRegexp } from 'path-to-regexp';
import type { MiddlewareConfig } from './config';

type CompiledRoute = {
  methods: string[];
  origin?: string;
  regexp: RegExp;
  middlewares: MiddlewareConfig[];
};

type RequestTarget = {
  origin?: string;
  pathname: string;
};

const ABSOLUTE_ROUTE_PATTERN = /^(https?:\/\/[^/]+)(\/.*)?$/i;

function parseRoutePattern(pattern: string): { origin?: string; pathname: string } {
  const absoluteMatch = pattern.match(ABSOLUTE_ROUTE_PATTERN);
  if (!absoluteMatch) return { pathname: pattern };

  const originUrl = new URL(absoluteMatch[1]);
  return {
    origin: originUrl.origin,
    pathname: absoluteMatch[2] || '/',
  };
}

function parseRequestTarget(url: string): RequestTarget {
  try {
    const parsed = new URL(url);
    return { origin: parsed.origin, pathname: parsed.pathname };
  } catch {
    return { pathname: url };
  }
}

export class RouteMatcher {
  private routes: CompiledRoute[];

  constructor(routes: Record<string, MiddlewareConfig[]>) {
    this.routes = [];

    for (const key in routes) {
      // Route keys use either "METHOD pattern" or just "pattern".
      const parts = key.split(' ');
      let method = '';
      let pattern = '';
      if (parts.length === 2) {
        method = parts[0];
        pattern = parts[1];
      } else {
        pattern = parts[0];
      }

      const methods = method ? [method.toUpperCase()] : [];
      // GET routes also match HEAD requests.
      if (methods.includes('GET')) methods.unshift('HEAD');

      const { origin, pathname } = parseRoutePattern(pattern);
      this.routes.push({
        methods,
        origin,
        regexp: pathToRegexp(pathname).regexp,
        middlewares: routes[key],
      });
    }
  }

  match(method: string, url: string): MiddlewareConfig[] {
    const target = parseRequestTarget(url);
    const methodUpper = method.toUpperCase();

    for (const route of this.routes) {
      if (
        (route.origin === undefined || route.origin === target.origin) &&
        route.regexp.test(target.pathname) &&
        (route.methods.length === 0 || route.methods.includes(methodUpper))
      ) {
        return route.middlewares;
      }
    }

    return [];
  }
}
