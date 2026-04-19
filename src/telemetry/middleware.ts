/**
 * Telemetry middleware for chaos-fetch
 * Captures HTTP request tracing data and exports to OTEL endpoint
 * Integrates via chaos-fetch middleware registry (registered as 'otel' middleware)
 *
 * Usage:
 *   createClient({
 *     otel: {
 *       serviceName: 'my-service',
 *       endpoint: 'http://localhost:4318',
 *       flushIntervalMs: 5000,
 *       maxBatchSize: 100,
 *     },
 *     global: [{ latency: { ms: 100 } }],
 *   })
 */

import type { Middleware, Context } from '../registry/middleware';
import type { ExporterConfig } from './exporter';
import { OtlpExporter } from './exporter';
import { createSpan, generateTraceId } from './span';
import {
  extractTraceContext,
  injectTraceContext,
  setTraceContextInCtx,
  type TraceContext,
} from './context';

/**
 * Configuration for the otel middleware
 * Combines export config with middleware behavior flags
 */
export interface OtelConfig extends ExporterConfig {
  // ExporterConfig includes:
  // - endpoint: string
  // - serviceName: string
  // - flushIntervalMs?: number
  // - maxBatchSize?: number
  // - maxQueueSize?: number
  // - headers?: Record<string, string>
}

/**
 * Global exporter instance (singleton per service)
 * Shared across all requests to the same OTLP endpoint/service
 * Map keyed by endpoint+serviceName to support multiple services
 */
const exporterCache = new Map<string, OtlpExporter>();

/**
 * Get or create exporter for the given config
 */
function getOrCreateExporter(config: ExporterConfig): OtlpExporter {
  const cacheKey = `${config.endpoint}:${config.serviceName}`;

  let exporter = exporterCache.get(cacheKey);
  if (!exporter) {
    exporter = new OtlpExporter(config);
    exporterCache.set(cacheKey, exporter);
  }

  return exporter;
}

/**
 * Telemetry middleware factory
 * Creates middleware that captures request tracing and exports to OTEL
 *
 * This middleware:
 * 1. Extracts or generates trace context (W3C Trace Context)
 * 2. Injects trace context headers into request
 * 3. Captures request method, path, timing
 * 4. Captures response status and any errors
 * 5. Enqueues span for export to OTEL endpoint
 *
 * Middleware order: Should run early (after context-id if present)
 * so it captures real methods/paths before other middleware modifies them
 */
export function createTelemetryMiddleware(
  config: OtelConfig
): Middleware {
  const exporter = getOrCreateExporter(config);

  return async (ctx: Context, next: () => Promise<void>) => {
    const startTime = Date.now();
    const req = ctx.req;

    // Extract or generate trace context
    let traceContext: TraceContext | null = extractTraceContext(req);
    if (!traceContext) {
      // Generate new trace ID if not present in request headers
      traceContext = {
        traceId: generateTraceId(),
        spanId: '0'.repeat(16), // Placeholder; will be set in span
        traceFlags: '01', // Sampled
      };
    }

    // Store trace context in middleware chain for access by other middleware
    setTraceContextInCtx(ctx, traceContext);

    // Inject trace context into request headers for propagation downstream
    ctx.req = injectTraceContext(req, traceContext);

    // Create span to track this request
    const span = createSpan(
      traceContext.traceId,
      ctx.req.method,
      ctx.req.url,
      config.serviceName
    );

    try {
      // Call next middleware in chain
      await next();

      // Capture response status if present
      if (ctx.res) {
        span.status = ctx.res.status;
        span.error = ctx.res.status >= 400;
      }
    } catch (error) {
      // Capture error information
      span.error = true;
      span.errorMessage =
        error instanceof Error ? error.message : String(error);
    } finally {
      // Record end time and duration
      span.endTimeMs = Date.now();
      span.durationMs = span.endTimeMs - startTime;

      // Enqueue span for export
      exporter.addSpan(span);
    }
  };
}

/**
 * Middleware factory wrapper for chaos-fetch registry
 * Takes raw config from ChaosConfig and returns middleware
 *
 * Called by chaos-fetch when resolving { otel: {...} } config block
 */
export function telemetryMiddlewareFactory(
  opts: Record<string, unknown>
): Middleware {
  const config = opts as unknown as OtelConfig;

  if (!config.endpoint || !config.serviceName) {
    throw new Error(
      'otel middleware requires "endpoint" and "serviceName" in config'
    );
  }

  return createTelemetryMiddleware(config);
}
