import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createClient } from '../../src/index';
import { runMiddlewares } from '../../src/middlewareEngine';
import { registerMiddleware } from '../../src/registry/middleware';
import type { Context, Middleware } from '../../src/registry/middleware';
import { RouteMatcher } from '../../src/routeMatcher';

const segmentArbitrary = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
    minLength: 1,
    maxLength: 20,
  })
  .map((characters) => characters.join(''));

function context(): Context {
  return { req: new Request('https://example.test/resource'), state: {} };
}

describe('routing and composition fuzzing', () => {
  it('matches independently of origin, query, fragment, and method casing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
        segmentArbitrary,
        fc.webQueryParameters(),
        segmentArbitrary,
        (method, id, query, fragment) => {
          const middlewares = [{ selected: { id } }];
          const matcher = new RouteMatcher({
            [`${method} /resource/:id`]: middlewares,
          });
          const suffix = `${query ? `?${query}` : ''}#${fragment}`;

          expect(
            matcher.match(method.toLowerCase(), `https://one.test/resource/${id}${suffix}`),
          ).toBe(middlewares);
          expect(
            matcher.match(method, `https://two.test/resource/${id}${suffix}`),
          ).toBe(middlewares);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('does not leak method-specific routes across generated methods', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
        fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
        segmentArbitrary,
        (configuredMethod, requestedMethod, id) => {
          const middlewares = [{ selected: {} }];
          const matcher = new RouteMatcher({
            [`${configuredMethod} /resource/:id`]: middlewares,
          });

          expect(matcher.match(requestedMethod, `/resource/${id}`)).toEqual(
            requestedMethod === configuredMethod ? middlewares : [],
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('preserves onion order for arbitrary middleware depths', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 30 }), async (depth) => {
        const order: string[] = [];
        const middlewares: Middleware[] = Array.from({ length: depth }, (_, index) =>
          async (_ctx, next) => {
            order.push(`enter-${index}`);
            await next();
            order.push(`exit-${index}`);
          },
        );
        middlewares.push(async () => {
          order.push('transport');
        });

        await runMiddlewares(middlewares, context());

        expect(order).toEqual([
          ...Array.from({ length: depth }, (_, index) => `enter-${index}`),
          'transport',
          ...Array.from({ length: depth }, (_, index) => `exit-${depth - index - 1}`),
        ]);
      }),
      { numRuns: 500 },
    );
  });

  it('short-circuits exactly at the generated middleware', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }).chain((depth) =>
          fc.record({
            depth: fc.constant(depth),
            stopAt: fc.integer({ min: 0, max: depth - 1 }),
          }),
        ),
        async ({ depth, stopAt }) => {
          const order: string[] = [];
          let transportCalls = 0;
          const middlewares: Middleware[] = Array.from({ length: depth }, (_, index) =>
            async (ctx, next) => {
              order.push(`enter-${index}`);
              if (index === stopAt) {
                ctx.res = new Response('short');
                return;
              }
              await next();
              order.push(`exit-${index}`);
            },
          );
          middlewares.push(async () => {
            transportCalls++;
          });

          const ctx = context();
          await runMiddlewares(middlewares, ctx);

          expect(order).toEqual([
            ...Array.from({ length: stopAt + 1 }, (_, index) => `enter-${index}`),
            ...Array.from({ length: stopAt }, (_, index) => `exit-${stopAt - index - 1}`),
          ]);
          expect(transportCalls).toBe(0);
          expect(await ctx.res!.text()).toBe('short');
        },
      ),
      { numRuns: 500 },
    );
  });

  it('dispatches global middleware before only the matching route chain', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.boolean(),
        async (globalDepth, routeDepth, matches) => {
          const order: string[] = [];
          registerMiddleware('fuzzGlobal', (options) => async (_ctx, next) => {
            order.push(`global-${String(options.index)}`);
            await next();
          });
          registerMiddleware('fuzzRoute', (options) => async (_ctx, next) => {
            order.push(`route-${String(options.index)}`);
            await next();
          });
          const global = Array.from({ length: globalDepth }, (_, index) => ({
            fuzzGlobal: { index },
          }));
          const route = Array.from({ length: routeDepth }, (_, index) => ({
            fuzzRoute: { index },
          }));
          const client = createClient(
            { global, routes: { 'GET /matched': route } },
            async () => {
              order.push('transport');
              return new Response('ok');
            },
          );

          await client(`https://example.test/${matches ? 'matched' : 'other'}`);

          expect(order).toEqual([
            ...Array.from({ length: globalDepth }, (_, index) => `global-${index}`),
            ...(matches
              ? Array.from({ length: routeDepth }, (_, index) => `route-${index}`)
              : []),
            'transport',
          ]);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('preserves native Request plus init override semantics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
        fc.dictionary(segmentArbitrary, segmentArbitrary, { maxKeys: 12 }),
        async (method, headers) => {
          let captured: Request | undefined;
          const client = createClient({}, async (request) => {
            captured = request as Request;
            return new Response('ok');
          });
          const input = new Request('https://example.test/native', {
            method: 'OPTIONS',
            headers: { 'x-original': 'yes' },
          });

          await client(input, { method, headers });

          expect(captured?.method).toBe(method);
          expect(Object.fromEntries(captured?.headers ?? [])).toEqual(
            Object.fromEntries(new Headers(headers)),
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});
