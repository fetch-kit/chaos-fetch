import { LRUCache } from 'lru-cache';

export interface ThrottleOptions {
  rate: number; // bytes per second
  chunkSize?: number; // bytes per chunk
  key?: string | ((req: Request) => string);
}

// Helper: sleep for ms
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// Feature detection
function isNodeStream(body: any): boolean {
  return body && typeof body.pipe === 'function';
}

function isReadableStream(body: any): boolean {
  return typeof body === 'object' && body !== null && typeof body.getReader === 'function';
}

export function throttle(opts: ThrottleOptions) {
  const db = new LRUCache<string, any>({ max: 10000 });
  let getKey: (req: Request) => string;
  if (typeof opts.key === 'function') {
    getKey = opts.key;
  } else if (typeof opts.key === 'string') {
    getKey = (req: Request) => req.headers.get(opts.key as string) || 'unknown';
  } else {
    getKey = () => 'unknown';
  }

  const chunkSize = opts.chunkSize || 16384;

  return async (ctx: any, next: () => Promise<void>) => {
    await next();
    const key = getKey(ctx.req);
    const rate = opts.rate;
    if (!ctx.res || !ctx.res.body) return;
    const body = ctx.res.body;

    // Node.js stream
    if (isNodeStream(body)) {
      // Dynamically require stream.Transform to avoid browser bundling
      let Transform;
      try {
        Transform = require('stream').Transform;
      } catch {}
      if (Transform) {
        class ThrottleStream extends Transform {
          private chunkSize: number;
          private rate: number;
          constructor(chunkSize: number, rate: number) {
            super();
            this.chunkSize = chunkSize;
            this.rate = rate;
          }
          _transform(chunk: Buffer, encoding: BufferEncoding, callback: (err?: Error | null) => void) {
            let offset = 0;
            const sendChunk = () => {
              if (offset >= chunk.length) return callback();
              const toSend = Math.min(this.chunkSize, chunk.length - offset);
              this.push(chunk.slice(offset, offset + toSend));
              offset += toSend;
              const delay = (toSend / this.rate) * 1000;
              setTimeout(sendChunk, delay);
            };
            sendChunk();
          }
        }
        ctx.res.body = body.pipe(new ThrottleStream(chunkSize, rate));
        return;
      }
    }

    // Browser/edge ReadableStream
    if (isReadableStream(body)) {
      const reader = body.getReader();
      const throttledStream = new ReadableStream({
        async pull(controller) {
          const { value, done } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
          const delay = (value.length / rate) * 1000;
          await sleep(delay);
        }
      });
      ctx.res = new Response(throttledStream, ctx.res);
      return;
    }

    // Fallback: non-stream response (Buffer, string, etc.)
    let raw;
    if (typeof body === 'string') {
      raw = Buffer.from(body);
    } else if (body instanceof ArrayBuffer) {
      raw = Buffer.from(body);
    } else if (body instanceof Uint8Array) {
      raw = Buffer.from(body);
    } else if (body && typeof body === 'object' && typeof body.text === 'function') {
      raw = Buffer.from(await body.text());
    } else {
      // Unknown type, skip throttling
      return;
    }
    const totalDelay = (raw.length / rate) * 1000;
    await sleep(totalDelay);
    ctx.res = new Response(raw, ctx.res);
  };
}