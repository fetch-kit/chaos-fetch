Define Types and Interfaces

Create types for middleware nodes, route config, and the middleware context (ctx).
Implement Middleware System




Build a Koa-style middleware engine using koa-compose.
Each middleware receives ctx and next.
Route Matching

Integrate @koa/router to match routes and methods for per-route middleware.
Client Creation

Implement createChaosClient(config) to set up global and route middlewares.
Store the config and prepare middleware chains.
Fetch Wrapper

Implement client.fetch(url, options):
Build the middleware chain (global + matched route).
Run the chain, with the last middleware performing the actual fetch.
Pass ctx through all middlewares.
Built-in Middlewares

Implement chaos middlewares: latency, latencyRange, fail, failRandomly, failNth, dropConnection, rateLimit.
Custom Middleware Support

Allow users to pass custom middleware functions in config.
Testing

Write unit tests for client creation, middleware execution, and fetch behavior using Vitest.
Linting and Formatting

Ensure code quality with ESLint and Prettier.
Documentation

Document API, configuration, and middleware usage in README.md.