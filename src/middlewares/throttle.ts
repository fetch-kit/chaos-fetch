export interface ThrottleOptions {
  rate: number; // bytes per second
  chunkSize?: number; // bytes per chunk
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function isNodeStream(body: unknown): body is NodeJS.ReadableStream {
  return !!body && typeof (body as NodeJS.ReadableStream).pipe === 'function';
}

function isReadableStream(body: unknown): body is { getReader: () => ReadableStreamDefaultReader<Uint8Array> } {
  return typeof body === 'object' && body !== null && typeof (body as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }).getReader === 'function';
}

export function throttle(opts: ThrottleOptions) {
  const chunkSize = opts.chunkSize || 16384;
  return async function throttleMiddleware(ctx: { req: Request; res?: Response }, next: () => Promise<void>) {
    await next();
    const rate = opts.rate;
    if (!ctx.res || !ctx.res.body) return;
    const body = ctx.res.body;

    // Node.js stream: wrap in web-compatible ReadableStream
    if (isNodeStream(body)) {
      const nodeStream = body;
      const throttledStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          function handleChunk() {
            const chunk = nodeStream.read(chunkSize);
            if (chunk === null) {
              nodeStream.once('readable', handleChunk);
              return;
            }
            let data: Uint8Array;
            if (typeof chunk === 'string') {
              data = new TextEncoder().encode(chunk);
            } else if (Buffer.isBuffer(chunk)) {
              data = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            } else {
              // Unknown chunk type, skip
              return;
            }
            controller.enqueue(data);
            const delay = (data.length / rate) * 1000;
            sleep(delay).then(() => handleChunk());
          }
          handleChunk();
        },
        cancel() {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ('destroy' in nodeStream && typeof (nodeStream as any).destroy === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (nodeStream as any).destroy();
          }
        }
      });
      ctx.res = new Response(throttledStream, ctx.res);
      return;
    }

    // Browser/edge ReadableStream
    if (isReadableStream(body)) {
      const reader = body.getReader();
      const throttledStream = new ReadableStream<Uint8Array>({
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
    let raw: Uint8Array | undefined;
    if (typeof body === 'string') {
      raw = new TextEncoder().encode(body);
    } else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
      raw = new Uint8Array(body as ArrayBuffer);
    } else if (Object.prototype.toString.call(body) === '[object Uint8Array]') {
      raw = body as Uint8Array;
    } else {
      // Unknown type, skip throttling
      return;
    }
    if (raw) {
      const totalDelay = (raw.length / rate) * 1000;
      await sleep(totalDelay);
      ctx.res = new Response(raw.buffer as ArrayBuffer, ctx.res);
    }
  };
}