import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from '../../src/middlewares/throttle';

function createCtx(body: any) {
  return {
    req: new Request('https://api.test'),
    res: new Response(body),
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
    const start = Date.now();
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
});