import { describe, it, expect } from 'vitest';
import { RouteMatcher } from '../src/routeMatcher';

describe('RouteMatcher', () => {
  it('matches METHOD domain/path', () => {
    const matcher = new RouteMatcher({
      'GET example.com/foo': ['mw1'],
    });
    expect(matcher.match('GET', 'https://example.com/foo')).toEqual(['mw1']);
    expect(matcher.match('POST', 'https://example.com/foo')).toEqual([]);
  });

  it('matches domain/path', () => {
    const matcher = new RouteMatcher({
      'example.com/bar': ['mw2'],
    });
    expect(matcher.match('GET', 'https://example.com/bar')).toEqual(['mw2']);
    expect(matcher.match('POST', 'https://example.com/bar')).toEqual(['mw2']);
  });

  it('matches METHOD path', () => {
    const matcher = new RouteMatcher({
      'POST /baz': ['mw3'],
    });
    expect(matcher.match('POST', 'https://foo.com/baz')).toEqual(['mw3']);
    expect(matcher.match('GET', 'https://foo.com/baz')).toEqual([]);
  });

  it('matches path only', () => {
    const matcher = new RouteMatcher({
      '/qux': ['mw4'],
    });
    expect(matcher.match('GET', 'https://bar.com/qux')).toEqual(['mw4']);
    expect(matcher.match('POST', 'https://bar.com/qux')).toEqual(['mw4']);
  });

  it('falls back to partial match (endsWith)', () => {
    const matcher = new RouteMatcher({
      'GET /partial': ['mw5'],
    });
    expect(matcher.match('GET', 'https://baz.com/foo/partial')).toEqual(['mw5']);
  });

  it('returns [] if no match', () => {
    const matcher = new RouteMatcher({
      'GET /foo': ['mw6'],
    });
    expect(matcher.match('POST', 'https://baz.com/bar')).toEqual([]);
  });

  it('handles non-absolute URLs as path', () => {
    const matcher = new RouteMatcher({
      '/abc': ['mw7'],
    });
    expect(matcher.match('GET', '/abc')).toEqual(['mw7']);
  });
});
