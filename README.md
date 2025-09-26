
# chaos-fetch

A TypeScript/ESM client library for injecting network chaos (latency, failures, drops, etc.) into fetch requests. Inspired by [chaos-proxy](https://github.com/gkoos/chaos-proxy), but designed for programmatic use and composable middleware.

## Features

- Simple configuration via JavaScript/TypeScript
- Programmatic API for fetch interception
- Built-in middleware primitives: `latency`, `latencyRange`, `fail`, `failRandomly`, `failNth`
- Extensible registry for custom middleware
- Route matching by method, domain, and path
- Built on Koa components (`@koa/router` and `koa-compose`), it supports both request and response interception/modification
- Robust short-circuiting: middleware can halt further processing

## Installation

```sh
npm install @fetchkit/chaos-fetch
```

## Usage

```ts
import { createClient, registerMiddleware } from 'chaos-fetch';

// Register a custom middleware (optional)
registerMiddleware('customDelay', (opts) => async (ctx, next) => {
	await new Promise(res => setTimeout(res, opts.ms));
	await next();
});

const chaosFetch = createClient({
	global: [																					// Global rules
		{ customDelay: { ms: 50 } }, 										// Use custom middleware
		{ failRandomly: { rate: 0.1, status: 503 } },		// 10% random failures
	],
	routes: {
		'GET https://api.example.com/users/:id': [			// Specific route rules
			{ failNth: { n: 3, status: 500 } },						// Fail every 3rd request with status 500
		],
	},
});

// Use as a drop-in replacement for fetch
const res = await chaosFetch('https://api.example.com/users/123');

// Or replace global fetch
replaceGlobalFetch(chaosFetch);
fetch('https://api.example.com/users/123'); // now goes through chaosFetch
restoreGlobalFetch(); // to restore original fetch
```

## Configuration

- `global`: Ordered array of middleware nodes applied to every request
- `routes`: Map of method+domain+path to ordered array of middleware nodes
- Middleware node: `{ latency: 100 }`, `{ failRandomly: { rate: 0.1, status: 503 } }`, etc.

### Routing

Chaos Proxy uses Koa Router for path matching, supporting named parameters (e.g., `/users/:id`), wildcards (e.g., `*`), and regex routes.

- Example: `"GET /api/*"` matches any GET request under `/api/`.
- Example: `"GET /users/:id"` matches GET requests like `/users/123`.

**Rule inheritance:**
- There is no inheritance between global and route-specific middleware.
- Global middlewares apply to every request.
- Route middlewares only apply to requests matching that route.
- If a request matches a route, only the middlewares for that route (plus global) are applied. Route rules do not inherit or merge from parent routes or wildcards.
- If multiple routes match, the most specific one is chosen (e.g., `/users/:id` over `/users/*`).
- If no route matches, only global middlewares are applied.
- Order of middleware execution: global middlewares run first, followed by route-specific middlewares in the order they are defined. Example: If you have a global latency of 100ms and a route-specific failNth, a request to that route will first incur the 100ms latency, then be subject to the failNth logic.
- Routes can be defined with or without HTTP methods. If a method is specified (e.g., `GET /path`), the rule only applies to that method. If no method is specified (e.g., `/path`), the rule applies to all methods for that path.
- Domain can also be specified (e.g., `GET https://api.example.com/path`). If no domain is specified, the rule applies to all domains.

## Middleware Primitives

- `latency(ms)` — delay every request with `ms`
- `latencyRange({ min, max })` — random delay between `min` and `max` ms
- `fail({ status, body })` — always fail sending `status` and `body`
- `failRandomly({ rate, status, body })` — fail with probability sending `status` and `body`
- `failNth({ n, status, body })` — fail every nth request with `status` and `body`
- `rateLimit({ limit, windowMs, key })` — rate limit to `limit` requests per `windowMs` milliseconds for each unique `key` (e.g., header, user, IP). Responds with 429 if limit exceeded
- `throttle({ rate, chunkSize, key })` — limit response bandwidth to `rate` bytes per second, chunking responses by `chunkSize` bytes, for each unique `key` (e.g., header, user, IP).

### Rate Limiting

The `rateLimit` middleware restricts how many requests a client can make in a given time window. It uses an internal cache to track requests per key.

- `limit`: Maximum number of requests allowed per window (e.g., 100)
- `windowMs`: Time window in milliseconds (e.g., 60000 for 1 minute)
- `key`: How to identify clients (default is IP, but can be a header name or a custom function)

How it works:
- Each incoming request is assigned a key (usually the client's IP address).
- The proxy tracks how many requests each key has made in the current window.
- If the number of requests exceeds `limit`, further requests from that key receive a `429 Too Many Requests` response until the window resets.
- You can customize the keying strategy to rate-limit by IP, by a specific header (e.g., `Authorization`), or by any custom logic.

### Throttling

The `throttle` middleware simulates slow network conditions by limiting the bandwidth of responses. It works by chunking the response body and introducing delays between chunks, based on the configured rate. If streaming is not supported in the runtime, it falls back to delaying the entire response.

- `rate` (required): Maximum bandwidth in bytes per second (e.g., `1024` for 1KB/sec).
- `chunkSize` (optional): Size of each chunk in bytes (default: `16384`).
- `key` (optional): Used to throttle per client; can be a header name or a custom function.

How it works:
- If the response body is a stream (Node.js `Stream` or browser/edge `ReadableStream`), the middleware splits it into chunks and delays each chunk to match the specified rate.
- If the response body is not a stream (e.g., string, buffer), the middleware calculates the total delay needed to simulate the bandwidth and delays the response accordingly.
- The middleware uses feature detection to choose the best throttling strategy for the current runtime.

Limitations:
- True stream throttling is only available in runtimes that support streaming APIs (Node.js, browser, edge).
- In runtimes without streaming support, only total response delay is simulated, not progressive delivery.
- The accuracy of throttling may vary depending on the runtime and timer precision.
- Not intended for production use; designed for local development and testing.

## Extensibility

Register custom middleware:

```ts
registerMiddleware('myMiddleware', (opts) => async (ctx, next) => {
	// custom logic
	await next();
});
```

Under the hood, `chaos-proxy` uses [Koa](https://koajs.com/), so your custom middleware can leverage the full Koa context and ecosystem. Note that Koa middleware functions are async and take `(ctx, next)` parameters. Read more in the [Koa docs](https://koajs.com/#middleware). The reason for switching from Express to Koa is to enable async/await support which helps intercept both requests and responses more easily. In the /examples/middlewares folder, you can find a custom middleware implementation.

## Testing

- Run tests: `npm run test:ci`
- Check coverage: `npm run test:ci -- --coverage`

## Security & Limitations

- Intended for local/dev/test only
- Not intended for stress testing
- Does not proxy or forward requests; wraps fetch only

## License

MIT
