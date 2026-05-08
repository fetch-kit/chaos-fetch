
[![npm version](https://img.shields.io/npm/v/@fetchkit/chaos-fetch.svg?style=flat-square)](https://www.npmjs.com/package/@fetchkit/chaos-fetch)
[![npm downloads](https://img.shields.io/npm/dm/@fetchkit/chaos-fetch.svg?style=flat-square)](https://www.npmjs.com/package/@fetchkit/chaos-fetch)
[![GitHub stars](https://img.shields.io/github/stars/fetch-kit/chaos-fetch?style=flat-square)](https://github.com/fetch-kit/chaos-fetch/stargazers)
[![CI](https://github.com/fetch-kit/chaos-fetch/actions/workflows/ci.yaml/badge.svg)](https://github.com/fetch-kit/chaos-fetch/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/fetch-kit/chaos-fetch/branch/main/graph/badge.svg)](https://codecov.io/gh/fetch-kit/chaos-fetch)

# chaos-fetch

A TypeScript/ESM client library for injecting network chaos (latency, failures, throttling, etc.) into fetch requests. Inspired by [chaos-proxy](https://github.com/gkoos/chaos-proxy), but designed for programmatic use and composable middleware.

## Features

- Simple configuration via JavaScript/TypeScript
- Programmatic API for fetch interception
- Built-in middleware primitives: `latency`, `latencyRange`, `fail`, `failRandomly`, `failNth`, `rateLimit`, `throttle`, `mock`
- Extensible registry for custom middleware
- Route matching by method and path
- Built on Koa components (`@koa/router` and `koa-compose`), it supports both request and response interception/modification
- Robust short-circuiting: middleware can halt further processing

## Installation

```sh
npm install @fetchkit/chaos-fetch
```

## Usage

```ts
import {
	createClient,
	registerMiddleware,
	replaceGlobalFetch,
	restoreGlobalFetch,
} from '@fetchkit/chaos-fetch';

// Register a custom middleware (optional)
registerMiddleware('customDelay', (opts) => async (ctx, next) => {
	await new Promise(res => setTimeout(res, opts.ms));
	await next();
});

const chaosFetch = createClient({
	global: [                                        // Global rules
		{ customDelay: { ms: 50 } },                   // Use custom middleware
		{ failRandomly: { rate: 0.1, status: 503 } },  // 10% random failures
	],
	routes: {
		// Route keys are method + path only (no domain)
		'GET /users/:id': [                            // Specific route rules
			{ failNth: { n: 3, status: 500 } },          // Fail every 3rd request with status 500
		],
	},
});

// Use as a drop-in replacement for fetch
const res = await chaosFetch('https://api.example.com/users/123');
// Same route rule also matches other domains with the same path
await chaosFetch('https://staging.example.net/users/123');

// Or replace global fetch
replaceGlobalFetch(chaosFetch);
fetch('https://api.example.com/users/123'); // now goes through chaosFetch
restoreGlobalFetch(); // to restore original fetch
```

## Configuration

- `global`: Ordered array of middleware nodes applied to every request
- `routes`: Map of method+path to ordered array of middleware nodes
- Both `global` and `routes` are optional. If omitted, no global or route-specific middleware will be applied.
- Middleware node: `{ latency: 100 }`, `{ failRandomly: { rate: 0.1, status: 503 } }`, etc.

### Routing

`chaos-fetch` uses `@koa/router` for path matching, supporting named parameters (e.g., `/users/:id`), wildcards (e.g., `*`), and regex routes.

- Example: `"GET /api/*"` matches any GET request under `/api/`.
- Example: `"GET /users/:id"` matches GET requests like `/users/123`.

**Supported Route Patterns:**
- **Named parameters:** `/users/:id` — Matches any path like `/users/123`.
- **Wildcards:** `/api/*` — Matches any path under `/api/`.
- **Regex:** `/files/(.*)` — Matches any path under `/files/`.

Note: route parameters are used internally for matching; they are not currently exposed on `ctx` for middleware consumption.

**Rule inheritance:**
- Domains are not considered in route matching, only the method and path. This simplification is a tradeoff: it reduces configuration complexity but means you cannot target rules to specific domains. If you need domain-specific behavior, consider using separate clients or custom middleware.
- There is no inheritance between global and route-specific middleware.
- Global middlewares apply to every request.
- Route middlewares only apply to requests matching that route.
- If a request matches a route, only the middlewares for that route (plus global) are applied. Route rules do not inherit or merge from parent routes or wildcards.
- If multiple routes match, the first matching route configuration is used.
- If no route matches, only global middlewares are applied.
- Order of middleware execution: global middlewares run first, followed by route-specific middlewares in the order they are defined. Example: If you have a global latency of 100ms and a route-specific failNth, a request to that route will first incur the 100ms latency, then be subject to the failNth logic.
- Routes can be defined with or without HTTP methods. If a method is specified (e.g., `GET /path`), the rule only applies to that method. If no method is specified (e.g., `/path`), the rule applies to all methods for that path.

**Relative URLs:**
- If you use relative URLs (e.g., `/api/data`), the client will resolve them against `globalThis.location.origin` in browsers and JSDOM. In Node, Bun, or Deno, you have to provide a full absolute URL; otherwise, they will throw an error.

## Middleware Primitives

- `latency(ms)` - delay every request with `ms`
- `latencyRange({ minMs, maxMs })` - random delay between `minMs` and `maxMs` ms
- `fail({ status, body })` - always fail sending `status` and `body`
- `mock({ status, body })` - always send `status` and `body`. `status` defaults to 200, and `body` defaults to an empty string. Use this to mock responses without making actual network requests.
- `failRandomly({ rate, status, body })` - fail with probability sending `status` and `body`
- `failNth({ n, status, body })` - fail every nth request with `status` and `body`
- `rateLimit({ limit, windowMs, key })` - rate limit to `limit` requests per `windowMs` milliseconds. `key` can be a header name (string), a custom function `(req) => string`, or omitted (all requests share one bucket). Responds with 429 if limit exceeded
- `throttle({ rate, chunkSize })` - limit response bandwidth to `rate` bytes per second, chunking responses by `chunkSize` bytes.

### Rate Limiting

The `rateLimit` middleware restricts how many requests a client can make in a given time window. It uses an internal cache to track requests per key.

- `limit`: Maximum number of requests allowed per window (e.g., 100)
- `windowMs`: Time window in milliseconds (e.g., 60000 for 1 minute)
- `key`: How to bucket requests. Options:
  - **omitted** — all requests share one bucket (`'unknown'`)
  - **string** — treated as a header name; the header's value is the bucket key. If the header is absent the bucket key falls back to `'unknown'`
  - **function** `(req: Request) => string` — full control; return any string as the bucket key

How it works:
- Each incoming request is assigned a key via the `key` option.
- The middleware tracks how many requests each key has made in the current window (fixed window, resets from first request in that window).
- If the number of requests exceeds `limit`, further requests from that key receive a `429 Too Many Requests` response until the window resets.

### Throttling

The `throttle` middleware simulates slow network conditions by limiting the bandwidth of responses. It works by chunking the response body and introducing delays between chunks, based on the configured rate. If streaming is not supported in the runtime, it falls back to delaying the entire response.

- `rate` (required): Maximum bandwidth in bytes per second (e.g., `1024` for 1KB/sec).
- `chunkSize` (optional): Size of each chunk in bytes (default: `16384`).

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

Under the hood, `chaos-fetch` uses [Koa](https://koajs.com/) components (`@koa/router` and `koa-compose`), so your custom middleware can leverage the full Koa middleware pattern. Middleware functions are async and take `(ctx, next)` parameters. Read more in the [Koa docs](https://koajs.com/#middleware).

## Comparison with MSW

Both `chaos-fetch` and MSW help with API testing, but they optimize for different primary jobs.

- `chaos-fetch` focuses on programmable fetch-level chaos and middleware-driven behavior.
- MSW focuses on broad API mocking across browser and Node.js interception models.

Use the matrix below as a quick chooser:

| Capability | chaos-fetch | MSW | Recommended choice |
| --- | --- | --- | --- |
| Fetch-level chaos injection (latency, failNth, throttle, rate limits) | Native, first-class middleware primitives | Possible, but not the core focus | `chaos-fetch` |
| Basic REST-style response mocking | Supported via `mock` middleware | Supported via `http.*` handlers | Either |
| GraphQL-first mocking ergonomics | No first-class GraphQL API | First-class GraphQL APIs (`graphql.query`, `graphql.mutation`, etc.) | MSW |
| WebSocket mocking/interception | No first-class support | First-class WebSocket API (`ws`) | MSW |
| Browser network-level interception model | Fetch wrapper / global fetch replacement | Service Worker interception in browser | MSW |
| Runtime handler lifecycle controls | Config-driven middleware setup | Built-in runtime APIs (`use`, `resetHandlers`, `restoreHandlers`) | MSW |
| Observability-focused chaos workflows | Optional OTEL middleware and local observability stack included | No equivalent built-in observability stack | `chaos-fetch` |
| Minimal setup for fetch-centric chaos testing | Lightweight client setup in app/tests | Additional mocking setup flow | `chaos-fetch` |

### When to use chaos-fetch

`chaos-fetch` is usually the better default if your main goal is resilience-oriented API testing:

- Your app and tests are fetch-centric.
- You want deterministic and programmable chaos scenarios.
- You want one place to model latency, failures, rate limits, and throttling.
- You want optional trace/metrics visibility for chaos runs.

### When MSW may be a better fit

MSW may be a better fit if your primary need is broad protocol-focused mocking:

- You need GraphQL-first handler APIs.
- You need WebSocket interception/mocking.
- You want browser Service Worker interception behavior.
- You rely heavily on runtime handler lifecycle controls.

### Optional layered usage

Some teams use both tools for different concerns: MSW for API behavior mocking and `chaos-fetch` for fault injection. This is optional. Start with one tool unless you have a clear need to separate behavior-mocking and resilience-injection responsibilities.

### Quick decision checklist

- Need fetch-focused chaos and resilience testing first? Start with `chaos-fetch`.
- Need GraphQL or WebSocket-first mocking? Use MSW.
- Need broad browser network-level interception behavior? Use MSW.
- Need minimal setup for deterministic fault injection in fetch clients? Use `chaos-fetch`.
- Need both protocol-rich mocking and transport chaos? Consider layering intentionally.

## Observability

`chaos-fetch` includes an optional OpenTelemetry middleware and a local observability stack for development.

What is included:
- Request-level tracing middleware (`otel`) with W3C Trace Context propagation (`traceparent`)
- OTLP HTTP export to an OpenTelemetry Collector
- Jaeger for trace search and inspection
- Prometheus for spanmetrics
- Grafana with a pre-provisioned dashboard (`chaos-fetch-observability`)

**This is entirely optional**. If you do not configure `otel`, `chaos-fetch` runs without telemetry overhead.

### Quickstart

Prerequisites:
- Docker Desktop (or equivalent Docker Engine + Compose)
- Dependencies installed (`npm install`)

Start the local stack:

```sh
npm run obs:up
```

Other useful commands:
- Validate compose config: `npm run obs:validate`
- Follow logs: `npm run obs:logs`
- Stop stack: `npm run obs:down`
- Full reset (including volumes): `npm run obs:reset`

Local endpoints:
- Grafana: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Jaeger: `http://localhost:16686`
- OTLP ingest (collector): `http://localhost:4318` (HTTP), `localhost:4317` (gRPC)

### Telemetry Configuration

Enable telemetry by adding an `otel` block to `createClient`:

```ts
import { createClient } from '@fetchkit/chaos-fetch';

const chaosFetch = createClient({
	otel: {
		serviceName: 'checkout-web',
		endpoint: 'http://localhost:4318',
		flushIntervalMs: 1000,
		maxBatchSize: 20,
		maxQueueSize: 1000,
		headers: {
			'x-tenant-id': 'local-dev',
		},
	},
	global: [
		{ latencyRange: { minMs: 20, maxMs: 120 } },
		{ failRandomly: { rate: 0.1, status: 503 } },
	],
});

await chaosFetch('https://api.example.com/users/123');
```

`otel` options:
- `serviceName` (required): service label used in traces/metrics
- `endpoint` (required): OTLP base endpoint (for example `http://localhost:4318`)
- `flushIntervalMs` (optional): export timer interval; default `5000`
- `maxBatchSize` (optional): export batch size; default `100`
- `maxQueueSize` (optional): max queued spans before dropping oldest; default `1000`
- `headers` (optional): additional OTLP HTTP headers

Notes:
- The middleware marks spans as error when HTTP status is `>= 400` or if middleware throws.
- Trace context is extracted from inbound `traceparent` if present; otherwise a new trace is started.

### Grafana Dashboard

The provisioned dashboard is named **Chaos Fetch Observability** (UID: `chaos-fetch-observability`).

Panels included:
- **Latency Percentiles (ms)**: p50 / p90 / p95 (stat values)
- **Request Rate**: requests/sec from `calls_total`
- **Error Rate**: cumulative ratio of 5xx `calls_total` to total `calls_total` (since process start)
- **Calls by Route**: grouped by `http_method` + `http_target`

If traffic is sparse, percentile and rate panels may appear flat or delayed until enough samples are present.

### Troubleshooting

If Grafana shows no/empty data:
- Confirm containers are up: `npm run obs:ps`
- Confirm collector target is healthy in Prometheus: `http://localhost:9090/targets`
- Confirm traces appear in Jaeger (`http://localhost:16686`) for your `serviceName`
- Confirm Grafana datasource points to Prometheus at `http://prometheus:9090`
- Hard refresh Grafana after dashboard changes (`Ctrl+Shift+R`)

## Testing

- Run tests: `npm run test`
- Check coverage: `npm run test:ci`

## Security & Limitations

- Intended for local/dev/test only
- Not intended for stress testing
- Does not proxy or forward requests; wraps fetch only

## Join the Community

Have questions, want to discuss features, or share examples? Join the **Fetch-Kit Discord server**:

[![Discord](https://img.shields.io/badge/Discord-Join_Fetch--Kit-7289DA?logo=discord&logoColor=white)](https://discord.gg/sdyPBPCDUg)


## License

MIT
