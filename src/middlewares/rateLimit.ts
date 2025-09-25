import { LRUCache } from 'lru-cache';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  key?: string | ((req: Request) => string);
}

const db = new LRUCache<string, { count: number; reset: number }>({ max: 10000 });

export function rateLimit(opts: RateLimitOptions) {
  let getKey: (req: Request) => string;
  if (typeof opts.key === 'function') {
    getKey = opts.key;
  } else if (typeof opts.key === 'string') {
    getKey = (req: Request) => req.headers.get(opts.key as string) || 'unknown';
  } else {
    getKey = (req: Request) => 'unknown';
  }

  return async (ctx: any, next: () => Promise<void>) => {
    const key = getKey(ctx.req);
    const now = Date.now();
    let entry = db.get(key);

    if (!entry || now > entry.reset) {
      entry = { count: 1, reset: now + opts.windowMs };
      db.set(key, entry);
    } else {
      entry.count += 1;
      db.set(key, entry);
    }

    if (entry.count > opts.limit) {
      ctx.res = new Response('Rate limit exceeded', { status: 429 });
      return;
    }

    await next();
  };
}
