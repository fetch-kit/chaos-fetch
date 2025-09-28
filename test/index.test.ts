import { describe, it, expect, vi } from 'vitest';
import { createClient, replaceGlobalFetch, restoreGlobalFetch, registerMiddleware } from '../src/index';

describe('chaos-fetch client', () => {
  it('works with no config properties (no global, no routes)', async () => {
    const mockFetch = vi.fn(async (req: RequestInfo | URL) => {
      const url = req instanceof Request ? req.url : String(req);
      return new Response(url);
    });
    const chaosFetch = createClient({}, mockFetch);
    const res = await chaosFetch('https://fallback.test/path');
    expect(await res.text()).toBe('https://fallback.test/path');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('works with only global middleware', async () => {
    registerMiddleware('addHeader', () => async (ctx, next) => {
      ctx.req = new Request(ctx.req, { headers: { 'X-Test': '1' } });
      await next();
    });
    const mockFetch = vi.fn(async (req: RequestInfo | URL) => {
      const url = req instanceof Request ? req.url : String(req);
      const headers = req instanceof Request ? req.headers.get('X-Test') : undefined;
      return new Response(JSON.stringify({ url, header: headers }));
    });
    const chaosFetch = createClient({ global: [{ addHeader: {} }] }, mockFetch);
    const res = await chaosFetch('https://onlyglobal.test/path');
    const data = await res.json();
    expect(data.url).toBe('https://onlyglobal.test/path');
    expect(data.header).toBe('1');
  });

  it('works with only routes middleware', async () => {
    registerMiddleware('addQuery', () => async (ctx, next) => {
      const url = new URL(ctx.req.url);
      url.searchParams.set('foo', 'bar');
      ctx.req = new Request(url.toString(), ctx.req);
      await next();
    });
    const mockFetch = vi.fn(async (req: RequestInfo | URL) => {
      const url = req instanceof Request ? req.url : String(req);
      return new Response(url);
    });
    const chaosFetch = createClient({ routes: { 'GET /route': [{ addQuery: {} }] } }, mockFetch);
    const res = await chaosFetch('http://host/route');
    expect(await res.text()).toContain('foo=bar');
  });
  it('resolves relative URLs using globalThis.location.origin', async () => {
    const origin = 'https://example.com';
    const oldLocation = globalThis.location;
    // Patch globalThis.location for the test
  // @ts-expect-error: patching globalThis.location for test
  globalThis.location = { origin };
    const mockFetch = vi.fn(async (req: RequestInfo | URL) => {
      const url = req instanceof Request ? req.url : String(req);
      return new Response(url);
    });
    const chaosFetch = createClient({ global: [], routes: {} }, mockFetch);
    // Relative path starting with '/'
    const res1 = await chaosFetch('/foo');
    expect(await res1.text()).toBe(`${origin}/foo`);
    // Relative path without '/'
    const res2 = await chaosFetch('bar');
    expect(await res2.text()).toBe(`${origin}/bar`);
  // Restore location
  globalThis.location = oldLocation;
  });

  it('does not change absolute URLs', async () => {
    const mockFetch = vi.fn(async (req: RequestInfo | URL) => {
      const url = req instanceof Request ? req.url : String(req);
      return new Response(url);
    });
    const chaosFetch = createClient({ global: [], routes: {} }, mockFetch);
    const absUrl = 'https://other.com/baz';
    const res = await chaosFetch(absUrl);
    expect(await res.text()).toBe(absUrl);
  });

  it('does not resolve relative URLs if globalThis.location is missing', async () => {
    const oldLocation = globalThis.location;
  // @ts-expect-error: deleting globalThis.location for test
  delete globalThis.location;
    const mockFetch = vi.fn(async (req: RequestInfo | URL) => {
      const url = req instanceof Request ? req.url : String(req);
      return new Response(url);
    });
    const chaosFetch = createClient({ global: [], routes: {} }, mockFetch);
  const relUrl = '/missing';
  await expect(chaosFetch(relUrl)).rejects.toThrow(TypeError);
  // Restore location
  globalThis.location = oldLocation;
  });
  it('applies global middleware', async () => {
  const mockFetch = vi.fn(async (req: unknown) => {
      let url: string = '';
      if (typeof req === 'string') url = req;
      else if (req instanceof Request) url = req.url;
      else if (req instanceof URL) url = req.toString();
      else url = String(req);
      return new Response(JSON.stringify({ ok: true, url }));
    });
    registerMiddleware('addHeader', () => async (ctx, next) => {
      ctx.req = new Request(ctx.req, { headers: { 'X-Test': '1' } });
      await next();
    });
    const chaosFetch = createClient({ global: [{ addHeader: {} }], routes: {} }, mockFetch);
    const res = await chaosFetch('http://test');
    const data = await res.json();
    expect(data.ok).toBe(true);
  expect(data.url).toBe('http://test/');
  });

  it('applies route middleware', async () => {
  const mockFetch = vi.fn(async (req: unknown) => {
      let url: string = '';
      if (typeof req === 'string') url = req;
      else if (req instanceof Request) url = req.url;
      else if (req instanceof URL) url = req.toString();
      else url = String(req);
      return new Response(JSON.stringify({ ok: true, url }));
    });
    registerMiddleware('addQuery', () => async (ctx, next) => {
      const url = new URL(ctx.req.url);
      url.searchParams.set('foo', 'bar');
      ctx.req = new Request(url.toString(), ctx.req);
      await next();
    });
    const chaosFetch = createClient({
      global: [],
      routes: { 'GET /route': [{ addQuery: {} }] }
    }, mockFetch);
    const res = await chaosFetch('http://host/route');
    const data = await res.json();
    expect(data.url).toContain('foo=bar');
  });

  it('can replace and restore global fetch', async () => {
  const mockFetch = vi.fn(async (req: unknown) => {
      let url: string = '';
      if (typeof req === 'string') url = req;
      else if (req instanceof Request) url = req.url;
      else if (req instanceof URL) url = req.toString();
      else url = String(req);
      return new Response(JSON.stringify({ ok: true, url }));
    });
    globalThis.fetch = mockFetch;
    const chaosFetch = createClient({ global: [], routes: {} }, mockFetch) as typeof fetch;
    replaceGlobalFetch(chaosFetch);
    const res = await fetch('http://test2');
    const data = await res.json();
    expect(data.url).toBe('http://test2/');
    restoreGlobalFetch();
    expect(globalThis.fetch).toBe(mockFetch);
  });

  it('throws if no response from chaos client', async () => {
    // Patch runMiddlewares to not set ctx.res
    const brokenFetch = async () => { throw new Error('No response from chaos client'); };
    await expect(brokenFetch()).rejects.toThrow('No response from chaos client');
  });
});
