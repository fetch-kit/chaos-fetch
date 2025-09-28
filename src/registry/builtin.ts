import { registerMiddleware } from './middleware';
import { latency } from '../middlewares/latency';
import { latencyRange } from '../middlewares/latencyRange';
import { failRandomly } from '../middlewares/failRandomly';
import { failNth } from '../middlewares/failNth';
import { fail } from '../middlewares/fail';
import { rateLimit, RateLimitOptions } from '../middlewares/rateLimit';
import { throttle, ThrottleOptions } from '../middlewares/throttle';
import { mock } from '../middlewares/mock';

export function registerBuiltins() {
  // Register built-in middleware primitives
  registerMiddleware('latency', (opts) => latency(opts.ms as number));
  registerMiddleware('latencyRange', (opts) =>
    latencyRange(opts.minMs as number, opts.maxMs as number)
  );
  registerMiddleware('failRandomly', (opts) =>
    failRandomly(opts as { rate: number; status?: number; body?: string })
  );
  registerMiddleware('failNth', (opts) =>
    failNth(opts as { n: number; status?: number; body?: string })
  );
  registerMiddleware('fail', (opts) => fail(opts as { status?: number; body?: string }));
  registerMiddleware('rateLimit', (opts) => rateLimit(opts as unknown as RateLimitOptions));
  registerMiddleware('throttle', (opts) => throttle(opts as unknown as ThrottleOptions));
  registerMiddleware('mock', (opts) => mock(opts as { status?: number; body?: string }));
}
