import { describe, it, expect } from 'vitest';
import { registerBuiltins } from '../../src/registry/builtin';
import { resolveMiddleware } from '../../src/registry/middleware';

describe('registerBuiltins', () => {
  it('registers all built-in middlewares', () => {
    registerBuiltins();

    const builtinNodes: Array<Record<string, unknown>> = [
      { latency: { ms: 100 } },
      { latencyRange: { minMs: 10, maxMs: 20 } },
      { failRandomly: { rate: 0.1 } },
      { failNth: { n: 3, status: 500 } },
      { failFirstN: { n: 5, status: 503 } },
      { fail: { status: 500 } },
      { rateLimit: { limit: 10, windowMs: 60000 } },
      { throttle: { rate: 1024 } },
      { mock: { status: 200, body: 'mocked' } },
    ];

    for (const node of builtinNodes) {
      expect(typeof resolveMiddleware(node)).toBe('function');
    }
  });
});
