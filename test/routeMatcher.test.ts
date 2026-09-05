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

  it('matches HEAD requests with GET routes', () => {
    const matcher = new RouteMatcher({
      'GET /resource/:id': [{ mwHead: {} }],
    });
    expect(matcher.match('HEAD', '/resource/123')).toEqual([{ mwHead: {} }]);
  });

  it('matches path-to-regexp wildcards across segments', () => {
    const matcher = new RouteMatcher({
      '/files/*path': [{ mwWildcard: {} }],
    });
    expect(matcher.match('GET', '/files/a/b/c')).toEqual([{ mwWildcard: {} }]);
  });

  it('allows a trailing slash and matches paths case-insensitively', () => {
    const matcher = new RouteMatcher({
      '/users/:id': [{ mwNormalized: {} }],
    });
    expect(matcher.match('GET', '/USERS/123/')).toEqual([{ mwNormalized: {} }]);
  });

  it('returns the first registered route when multiple routes match', () => {
    const matcher = new RouteMatcher({
      '/users/:id': [{ mwFirst: {} }],
      '/users/:userId': [{ mwSecond: {} }],
    });
    // Both routes match /users/123; first registered wins
    expect(matcher.match('GET', '/users/123')).toEqual([{ mwFirst: {} }]);
  });

  it('matches an absolute route only on its configured origin', () => {
    const matcher = new RouteMatcher({
      'GET https://api.example.com/users/:id': [{ absolute: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com/users/123')).toEqual([{ absolute: {} }]);
    expect(matcher.match('GET', 'https://other.example.com/users/123')).toEqual([]);
  });

  it('supports methodless absolute routes', () => {
    const matcher = new RouteMatcher({
      'https://api.example.com/health': [{ health: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com/health')).toEqual([{ health: {} }]);
    expect(matcher.match('POST', 'https://api.example.com/health')).toEqual([{ health: {} }]);
  });

  it('treats protocol and non-default ports as part of the origin', () => {
    const matcher = new RouteMatcher({
      'https://api.example.com:8443/resource': [{ secure: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com:8443/resource')).toEqual([{ secure: {} }]);
    expect(matcher.match('GET', 'https://api.example.com/resource')).toEqual([]);
    expect(matcher.match('GET', 'http://api.example.com:8443/resource')).toEqual([]);
  });

  it('normalizes host casing and default ports', () => {
    const matcher = new RouteMatcher({
      'GET https://API.EXAMPLE.COM:443/resource': [{ normalizedOrigin: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com/resource')).toEqual([
      { normalizedOrigin: {} },
    ]);
  });

  it('supports pathname patterns in absolute routes', () => {
    const matcher = new RouteMatcher({
      'https://api.example.com/files/*path': [{ wildcard: {} }],
      'https://optional.example.com/users{/:id}': [{ optional: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com/files/a/b')).toEqual([{ wildcard: {} }]);
    expect(matcher.match('GET', 'https://optional.example.com/users')).toEqual([{ optional: {} }]);
    expect(matcher.match('GET', 'https://optional.example.com/users/123')).toEqual([
      { optional: {} },
    ]);
  });

  it('ignores query strings and fragments for absolute routes', () => {
    const matcher = new RouteMatcher({
      'GET https://api.example.com/resource': [{ queryIndependent: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com/resource?view=full#details')).toEqual([
      { queryIndependent: {} },
    ]);
  });

  it('keeps path-only routes origin-independent', () => {
    const matcher = new RouteMatcher({
      'GET /resource': [{ anyOrigin: {} }],
    });

    expect(matcher.match('GET', 'https://one.example/resource')).toEqual([{ anyOrigin: {} }]);
    expect(matcher.match('GET', 'http://two.example:8080/resource')).toEqual([{ anyOrigin: {} }]);
  });

  it('preserves first-match ordering across path-only and absolute routes', () => {
    const matcher = new RouteMatcher({
      'GET /resource': [{ first: {} }],
      'GET https://api.example.com/resource': [{ second: {} }],
    });

    expect(matcher.match('GET', 'https://api.example.com/resource')).toEqual([{ first: {} }]);
  });

  it('does not match an absolute route against a relative request URL', () => {
    const matcher = new RouteMatcher({
      'GET https://api.example.com/resource': [{ absolute: {} }],
    });

    expect(matcher.match('GET', '/resource')).toEqual([]);
  });

  it('rejects malformed absolute route origins', () => {
    expect(
      () =>
        new RouteMatcher({
          'GET https://[invalid/resource': [{ invalid: {} }],
        }),
    ).toThrow();
  });
});
