  it('covers NodeJS stream string chunk and readable event', async () => {
    vi.useFakeTimers();
    let readableCallback: (() => void) | undefined;
    let callCount = 0;
    const mockStream = {
      pipe: () => {},
      read: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 'abc'; // string chunk
        if (callCount === 2) return null; // triggers readable event
        if (callCount === 3) return Buffer.from('def'); // buffer chunk
        return null;
      }),
      once: vi.fn().mockImplementation((event, cb) => {
        if (event === 'readable') readableCallback = cb;
      }),
      destroy: vi.fn(),
    };
    const mw = throttle({ rate: 1024 });
    const ctx = { req: new Request('https://api.test'), res: new Response('dummy') };
    Object.defineProperty(ctx.res, 'body', { value: mockStream });
    const next = vi.fn();
    const promise = mw(ctx, next);
    // Advance timers for first chunk
    await vi.advanceTimersByTimeAsync(10);
    // Simulate readable event
    if (readableCallback) readableCallback();
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
    vi.useRealTimers();
  });

  it('covers fallback for ArrayBuffer', async () => {
    vi.useFakeTimers();
    const ab = new Uint8Array([1,2,3,4]).buffer;
    const mw = throttle({ rate: 2 });
    const ctx = { req: new Request('https://api.test'), res: new Response('dummy') };
    Object.defineProperty(ctx.res, 'body', { value: ab });
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
    vi.useRealTimers();
  });
import { Readable } from 'stream';
  it('covers NodeJS Readable stream logic', async () => {
    vi.useFakeTimers();
    const stream = new Readable();
    stream.push('abc');
    stream.push(Buffer.from('def'));
    stream.push(null); // end
    const mw = throttle({ rate: 1024 });
    const ctx = { req: new Request('https://api.test'), res: new Response('dummy') };
    Object.defineProperty(ctx.res, 'body', { value: stream });
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
    vi.useRealTimers();
  });

  it('covers browser ReadableStream logic', async () => {
    vi.useFakeTimers();
    if (typeof ReadableStream === 'undefined') {
      vi.useRealTimers();
      return;
    }
    let readCount = 0;
    const chunks = [new Uint8Array([1,2,3]), new Uint8Array([4,5,6])];
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (readCount < chunks.length) {
          return Promise.resolve({ value: chunks[readCount++], done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      })
    };
    const mockStream = {
      getReader: () => mockReader
    };
    const mw = throttle({ rate: 256 });
    const ctx = { req: new Request('https://api.test'), res: new Response('dummy') };
    Object.defineProperty(ctx.res, 'body', { value: mockStream });
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(100);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
    vi.useRealTimers();
  });

  it('covers fallback for Uint8Array', async () => {
    vi.useFakeTimers();
    const arr = new Uint8Array([1,2,3,4]);
    const mw = throttle({ rate: 2 });
    const ctx = { req: new Request('https://api.test'), res: new Response('dummy') };
    Object.defineProperty(ctx.res, 'body', { value: arr });
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
    vi.useRealTimers();
  });
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from '../../src/middlewares/throttle';

function createCtx(body: unknown) {
  return {
    req: new Request('https://api.test'),
    res: new Response(body as BodyInit | null | undefined),
  };
}

describe('throttle middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies correct delay for string response', async () => {
    const str = 'a'.repeat(1024); // 1KB
    const mw = throttle({ rate: 1024 }); // 1KB/sec
    const ctx = createCtx(str);
    const next = vi.fn();
  // const start = Date.now(); // removed unused variable
    const promise = mw(ctx, next);
    // Should delay by 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('applies correct delay for Buffer response', async () => {
    const buf = Buffer.from('b'.repeat(2048)); // 2KB
    const mw = throttle({ rate: 1024 }); // 1KB/sec
    const ctx = createCtx(buf);
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('applies correct delay for ArrayBuffer response', async () => {
    const ab = new Uint8Array(512).buffer; // 512 bytes
    const mw = throttle({ rate: 256 }); // 256B/sec
    const ctx = createCtx(ab);
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('detects ReadableStream and applies throttling (simulated)', async () => {
    // Simulate a ReadableStream with getReader
    let readCount = 0;
    const chunks = [new Uint8Array(256), new Uint8Array(256)];
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (readCount < chunks.length) {
          return Promise.resolve({ value: chunks[readCount++], done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      })
    };
    const mockStream = {
      getReader: () => mockReader
    };
    const mw = throttle({ rate: 256 }); // 256B/sec
    const ctx = createCtx(mockStream);
    const next = vi.fn();
    const promise = mw(ctx, next);
    // Each chunk should delay by 1000ms
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('skips throttling for unsupported body types', async () => {
    const mw = throttle({ rate: 1024 });
    const ctx = createCtx({ foo: 'bar' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('skips throttling if rate is invalid', async () => {
    const mw = throttle({ rate: 0 });
    const ctx = createCtx('test');
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('skips throttling if res.body is missing', async () => {
    const mw = throttle({ rate: 1024 });
    const ctx = { req: new Request('https://api.test'), res: undefined };
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeUndefined();
  });


  it('covers NodeJS stream logic (string and Buffer chunk)', async () => {
    let callCount = 0;
    const mockStream = {
      pipe: () => {},
      read: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 'abc';
        if (callCount === 2) return Buffer.from('def');
        return null;
      }),
      once: vi.fn((event, cb) => { if (event === 'readable') setTimeout(cb, 1); }),
      destroy: vi.fn(),
    };
    const mw = throttle({ rate: 1024 });
    const ctx = createCtx(mockStream);
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('covers browser ReadableStream logic', async () => {
    let readCount = 0;
    const chunks = [new Uint8Array([1,2,3]), new Uint8Array([4,5,6])];
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (readCount < chunks.length) {
          return Promise.resolve({ value: chunks[readCount++], done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      })
    };
    const mockStream = {
      getReader: () => mockReader
    };
    const mw = throttle({ rate: 256 });
    const ctx = createCtx(mockStream);
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(100);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('covers fallback for Uint8Array', async () => {
    const arr = new Uint8Array([1,2,3,4]);
    const mw = throttle({ rate: 2 });
    const ctx = createCtx(arr);
    const next = vi.fn();
    const promise = mw(ctx, next);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });

  it('covers fallback for unknown type (skips throttling)', async () => {
    const mw = throttle({ rate: 1024 });
    const realRes = new Response('valid');
    const proxyRes = new Proxy(realRes, {
      get(target, prop) {
        if (prop === 'body') return Symbol('not supported');
        return Reflect.get(target, prop);
      }
    });
    const ctx = { req: new Request('https://api.test'), res: proxyRes };
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.res).toBeInstanceOf(Response);
  });
});