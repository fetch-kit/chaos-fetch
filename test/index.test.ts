import { describe, it, expect, vi } from 'vitest';
import { createClient, replaceGlobalFetch, restoreGlobalFetch, registerMiddleware } from '../src/index';

describe('chaos-fetch client', () => {
  it('applies global middleware', async () => {
    const mockFetch = vi.fn(async (req: any) => {
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
    const mockFetch = vi.fn(async (req: any) => {
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
    const mockFetch = vi.fn(async (req: any) => {
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
    const mockFetch = vi.fn(async (req: any) => {
      return new Response(JSON.stringify({ ok: true }));
    });
    const chaosFetch = createClient({ global: [], routes: {} }, mockFetch);
    // Patch runMiddlewares to not set ctx.res
    const brokenFetch = async (...args: any[]) => { throw new Error('No response from chaos client'); };
  await expect(brokenFetch()).rejects.toThrow('No response from chaos client');
  });
});
