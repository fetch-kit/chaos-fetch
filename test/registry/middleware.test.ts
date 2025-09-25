import { describe, it, expect } from 'vitest';
import { registerMiddleware, resolveMiddleware } from '../../src/registry/middleware';

describe('middleware registry', () => {
  it('registers and resolves a middleware', () => {
    registerMiddleware('test', (opts) => (ctx, next) => {
      ctx.test = opts.value;
      return next();
    });
    const mw = resolveMiddleware({ test: { value: 42 } });
    const ctx: any = {};
    let called = false;
    mw(ctx, async () => { called = true; });
    expect(ctx.test).toBe(42);
    expect(called).toBe(true);
  });

  it('throws for unknown middleware', () => {
    expect(() => resolveMiddleware({ unknown: {} })).toThrow('Unknown middleware: unknown');
  });

  it('throws for invalid node', () => {
    expect(() => resolveMiddleware(null as any)).toThrow('Invalid middleware node');
    expect(() => resolveMiddleware(123 as any)).toThrow('Invalid middleware node');
    expect(() => resolveMiddleware({})).toThrow('Middleware node must have exactly one key');
    expect(() => resolveMiddleware({ a: 1, b: 2 })).toThrow('Middleware node must have exactly one key');
  });
});
