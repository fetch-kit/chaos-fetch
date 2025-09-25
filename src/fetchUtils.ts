let originalFetch: typeof fetch | undefined;

export function replaceGlobalFetch(clientFetch: typeof fetch) {
  if (!originalFetch) originalFetch = globalThis.fetch;
  globalThis.fetch = clientFetch;
}

export function restoreGlobalFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
}
