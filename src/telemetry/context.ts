/**
 * Telemetry context management and W3C Trace Context support
 * Manages trace context propagation via W3C Trace Context headers (traceparent/tracestate)
 * Enables correlation with upstream services and external distributed tracing systems
 */

import type { Context } from '../registry/middleware';

/**
 * W3C Trace Context format: version-traceId-spanId-traceFlags
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 *
 * Reference: https://www.w3.org/TR/trace-context/
 */
export interface TraceContext {
  traceId: string; // 128-bit hex (32 chars)
  spanId: string; // 64-bit hex (16 chars)
  traceFlags: string; // 8-bit flags (usually "01" for sampled, "00" for not sampled)
}

/**
 * Parse W3C traceparent header into TraceContext
 * Returns null if header is missing or malformed
 */
export function parseTraceparent(traceparent?: string): TraceContext | null {
  if (!traceparent) {
    return null;
  }

  const parts = traceparent.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, traceFlags] = parts;

  // Validate version (must be 00 for now)
  if (version !== '00') {
    return null;
  }

  // Validate trace ID (32 hex chars, non-zero)
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === '0'.repeat(32)) {
    return null;
  }

  // Validate span ID (16 hex chars, non-zero)
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === '0'.repeat(16)) {
    return null;
  }

  // Validate trace flags (8 bits = 2 hex chars)
  if (!/^[0-9a-f]{2}$/.test(traceFlags)) {
    return null;
  }

  return { traceId, spanId, traceFlags };
}

/**
 * Format TraceContext into W3C traceparent header
 */
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
}

/**
 * Extract trace context from Request headers (W3C Trace Context)
 * If traceparent header exists, returns the trace ID from it (for upstream correlation)
 * If not present, returns null
 */
export function extractTraceContext(req: Request): TraceContext | null {
  const traceparent = req.headers.get('traceparent');
  if (!traceparent) {
    return null;
  }

  return parseTraceparent(traceparent);
}

/**
 * Inject trace context into Request headers (W3C Trace Context format)
 * Creates a new Request with traceparent header added
 */
export function injectTraceContext(
  req: Request,
  context: TraceContext
): Request {
  const headers = new Headers(req.headers);
  headers.set('traceparent', formatTraceparent(context));
  // Optionally add tracestate (vendor-specific trace state, empty for now)
  headers.set('tracestate', '');

  return new Request(req, { headers });
}

/**
 * Store trace context in middleware context for access across chain
 * Use a stable key to avoid collisions with other middleware state
 */
const TRACE_CONTEXT_KEY = '__chaos_fetch_trace_context__';

export function setTraceContextInCtx(
  ctx: Context,
  context: TraceContext
): void {
  ctx[TRACE_CONTEXT_KEY] = context;
}

export function getTraceContextFromCtx(ctx: Context): TraceContext | null {
  return (ctx[TRACE_CONTEXT_KEY] as TraceContext | undefined) ?? null;
}

/**
 * Extract trace ID from a Request or Context
 * 1. Check stored context in middleware chain
 * 2. Check W3C traceparent header in request
 * 3. Return trace ID if found, else null
 */
export function getTraceIdFromContext(
  ctx: Context,
  req?: Request
): string | null {
  // First check middleware context (set by earlier middleware or this one)
  const stored = getTraceContextFromCtx(ctx);
  if (stored) {
    return stored.traceId;
  }

  // Then check W3C header in request
  if (req) {
    const w3c = extractTraceContext(req);
    if (w3c) {
      return w3c.traceId;
    }
  }

  return null;
}
