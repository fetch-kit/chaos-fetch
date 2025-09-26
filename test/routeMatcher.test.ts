import { describe, it, expect } from 'vitest';
import { RouteMatcher } from '../src/routeMatcher';

describe('RouteMatcher', () => {
  it('matches METHOD path', () => {
    const matcher = new RouteMatcher({
      'POST /baz': [{ mw3: {} }],
    });
    expect(matcher.match('POST', 'https://foo.com/baz')).toEqual([{ mw3: {} }]);
    expect(matcher.match('GET', 'https://foo.com/baz')).toEqual([]);
  });

  it('matches path only', () => {
    const matcher = new RouteMatcher({
      '/qux': [{ mw4: {} }],
    });
    expect(matcher.match('GET', 'https://bar.com/qux')).toEqual([{ mw4: {} }]);
    expect(matcher.match('POST', 'https://bar.com/qux')).toEqual([{ mw4: {} }]);
  });

  it('returns [] if no match', () => {
    const matcher = new RouteMatcher({
      'GET /foo': [{ mw6: {} }],
    });
    expect(matcher.match('POST', 'https://baz.com/bar')).toEqual([]);
  });

  it('handles non-absolute URLs as path', () => {
    const matcher = new RouteMatcher({
      '/abc': [{ mw7: {} }],
    });
    expect(matcher.match('GET', '/abc')).toEqual([{ mw7: {} }]);
  });

  it('matches wildcard route', () => {
    const matcher = new RouteMatcher({
      '/wild/:param': [{ mwWild: {} }],
    });
    expect(matcher.match('GET', '/wild/anything')).toEqual([{ mwWild: {} }]);
    expect(matcher.match('GET', '/wild/else')).toEqual([{ mwWild: {} }]);
  });

  it('matches parameterized route', () => {
    const matcher = new RouteMatcher({
      '/user/:id': [{ mwParam: {} }],
    });
    expect(matcher.match('GET', '/user/123')).toEqual([{ mwParam: {} }]);
    expect(matcher.match('GET', '/user/abc')).toEqual([{ mwParam: {} }]);
  });

  it('matches regex route', () => {
    const matcher = new RouteMatcher({
      '/regex/:num': [{ mwRegex: {} }],
    });
    expect(matcher.match('GET', '/regex/42')).toEqual([{ mwRegex: {} }]);
    expect(matcher.match('GET', '/regex/123')).toEqual([{ mwRegex: {} }]);
  });
});
