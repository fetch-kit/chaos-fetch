/**
 * OTEL span data model and OTLP serialization
 * Generates trace/span IDs per OTEL spec (128-bit/64-bit hex)
 * Serializes spans to OTLP Request.Span JSON format for HTTP export
 */

/**
 * Span represents a single traced request with timing, method, path, status, and optional error info
 */
export interface Span {
  traceId: string; // 128-bit hex (32 chars)
  spanId: string; // 64-bit hex (16 chars)
  parentSpanId?: string; // Optional parent span for call chains
  name: string; // Operation name (usually method + path, e.g. "GET /api/users")
  startTimeMs: number; // Timestamp in milliseconds (Date.now())
  endTimeMs: number; // Timestamp in milliseconds
  durationMs: number; // Computed as endTimeMs - startTimeMs
  method: string; // HTTP method (GET, POST, etc)
  url: string; // Full URL of request
  path: string; // URL path component (extracted from url)
  status?: number; // HTTP status code (200, 500, etc) or undefined if error before response
  error?: boolean; // True if request failed
  errorMessage?: string; // Error description if error=true
  serviceName: string; // Which service generated this span
}

/**
 * Generate a random 128-bit trace ID in hex format (32 chars)
 * Matches OTEL spec: Trace IDs must be a non-zero value
 */
export function generateTraceId(): string {
  // Generate 16 random bytes and convert to 32-char hex
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(16);
    globalThis.crypto.getRandomValues(buf);
    return Array.from(buf)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for non-crypto environments
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Generate a random 64-bit span ID in hex format (16 chars)
 * Matches OTEL spec: Span IDs must be a non-zero value
 */
export function generateSpanId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(8);
    globalThis.crypto.getRandomValues(buf);
    return Array.from(buf)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for non-crypto environments
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Convert a Unix timestamp in milliseconds to OTLP nanoseconds format (required by OTEL spec)
 */
export function msToNanos(ms: number): string {
  return (Math.floor(ms) * 1_000_000).toString();
}

/**
 * Serialize a Span to OTLP Span JSON format (protobuf-compatible JSON)
 * This format is used in OTEL Protocol v1 for HTTP export (application/json)
 *
 * Reference: https://opentelemetry.io/docs/specs/otlp/#history
 */
export function spanToOtlpJson(span: Span): Record<string, unknown> {
  const statusCode = span.error
    ? 'STATUS_CODE_ERROR'
    : span.status
      ? 'STATUS_CODE_OK'
      : 'STATUS_CODE_UNSET';

  const otlpSpan: Record<string, unknown> = {
    traceId: span.traceId,
    spanId: span.spanId,
    name: span.name,
    kind: 'SPAN_KIND_CLIENT',
    startTimeUnixNano: msToNanos(span.startTimeMs),
    endTimeUnixNano: msToNanos(span.endTimeMs),
    attributes: [
      { key: 'http.method', value: { stringValue: span.method } },
      { key: 'http.url', value: { stringValue: span.url } },
      { key: 'http.target', value: { stringValue: span.path } },
      ...(span.status
        ? [{ key: 'http.status_code', value: { intValue: span.status } }]
        : []),
      { key: 'service.name', value: { stringValue: span.serviceName } },
    ],
    status: {
      code: statusCode,
      message: span.errorMessage || '',
    },
  };

  if (span.parentSpanId) {
    otlpSpan.parentSpanId = span.parentSpanId;
  }

  return otlpSpan;
}

/**
 * Create a span from request details
 */
export function createSpan(
  traceId: string,
  method: string,
  url: string,
  serviceName: string,
  parentSpanId?: string
): Span {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    return {
      traceId,
      spanId: generateSpanId(),
      parentSpanId,
      name: `${method} ${path}`,
      startTimeMs: Date.now(),
      endTimeMs: 0, // Will be set on completion
      durationMs: 0,
      method,
      url,
      path,
      serviceName,
    };
  } catch (e) {
    // If URL parsing fails, use the full URL as path
    return {
      traceId,
      spanId: generateSpanId(),
      parentSpanId,
      name: `${method} ${url}`,
      startTimeMs: Date.now(),
      endTimeMs: 0,
      durationMs: 0,
      method,
      url,
      path: url,
      serviceName,
    };
  }
}
