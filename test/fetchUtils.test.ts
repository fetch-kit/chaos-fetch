import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { replaceGlobalFetch, restoreGlobalFetch } from '../src/fetchUtils';

// Save the original fetch for restoration
const originalFetch = globalThis.fetch;

describe('fetchUtils', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });
  afterEach(() => {
    restoreGlobalFetch();
  });

  it('replaces global fetch with a custom function', async () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response('ok')));
    replaceGlobalFetch(mockFetch);
    expect(globalThis.fetch).toBe(mockFetch);
    await globalThis.fetch('http://test');
    expect(mockFetch).toHaveBeenCalledWith('http://test');
  });

  it('restores the original fetch', () => {
    const mockFetch = vi.fn();
    replaceGlobalFetch(mockFetch);
    restoreGlobalFetch();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('does not throw if restoreGlobalFetch is called multiple times', () => {
    restoreGlobalFetch();
    restoreGlobalFetch();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
