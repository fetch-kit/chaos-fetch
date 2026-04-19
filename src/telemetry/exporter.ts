/**
 * OTLP HTTP trace exporter with batching
 * Lightweight custom implementation without OpenTelemetry SDK dependency
 * Batches spans and sends them to OTLP HTTP endpoint (default port 4318)
 */

import type { Span } from './span';
import { spanToOtlpJson } from './span';

export interface ExporterConfig {
  endpoint: string; // OTLP HTTP endpoint, e.g., http://localhost:4318
  serviceName: string;
  flushIntervalMs?: number; // Auto-flush interval (default 5000ms)
  maxBatchSize?: number; // Max spans before auto-flush (default 100)
  maxQueueSize?: number; // Max pending spans before dropping (default 1000)
  headers?: Record<string, string>; // Optional HTTP headers (auth, tracing, etc)
}

export class OtlpExporter {
  private config: Required<ExporterConfig>;
  private spans: Span[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private isShuttingDown = false;

  constructor(config: ExporterConfig) {
    this.config = {
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      maxBatchSize: config.maxBatchSize ?? 100,
      maxQueueSize: config.maxQueueSize ?? 1000,
      headers: config.headers ?? {},
      ...config,
    };

    this.setupShutdownHooks();
    this.startFlushTimer();
  }

  /**
   * Add a span to the export queue
   * If queue is full, oldest spans are dropped
   * If batch size reached, triggers immediate flush
   */
  addSpan(span: Span): void {
    if (this.isShuttingDown) {
      return; // Ignore new spans during shutdown
    }

    this.spans.push(span);

    // Drop oldest spans if queue is too large
    while (this.spans.length > this.config.maxQueueSize) {
      this.spans.shift();
    }

    // Auto-flush if batch size reached
    if (this.spans.length >= this.config.maxBatchSize) {
      this.flush().catch(err => {
        this.logError('Failed to flush on batch size reached', err);
      });
    }
  }

  /**
   * Flush all pending spans to the OTLP endpoint
   */
  async flush(): Promise<void> {
    if (this.spans.length === 0) {
      return;
    }

    const spansToExport = this.spans.splice(0, this.config.maxBatchSize);

    try {
      await this.exportSpans(spansToExport);
    } catch (err) {
      this.logError(`Failed to export ${spansToExport.length} spans`, err);
      // Don't re-queue on export failure (avoid infinite loops)
    }
  }

  /**
   * Export spans to OTLP HTTP endpoint
   * Converts spans to OTLP JSON format and POSTs to /v1/traces endpoint
   */
  private async exportSpans(spansToExport: Span[]): Promise<void> {
    const otlpSpans = spansToExport.map(span => spanToOtlpJson(span));

    // Build OTLP Traces JSON payload (ResourceSpans > ScopeSpans > Span)
    const payload = JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.config.serviceName },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'chaos-fetch',
                version: '0.1.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    });

    const url = new URL('/v1/traces', this.config.endpoint).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(
        `OTLP export failed: ${response.status} ${response.statusText}`
      );
    }
  }

  /**
   * Shutdown the exporter gracefully:
   * - Stop accepting new spans
   * - Flush all pending spans
   * - Clean up timers
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush();
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => {
          this.logError('Failed to flush on timer', err);
        });
      }, this.config.flushIntervalMs);

      // Don't block Node.js from exiting if this is the only active timer
      if (
        typeof globalThis !== 'undefined' &&
        'unref' in this.flushTimer &&
        typeof (this.flushTimer as NodeJS.Timeout).unref === 'function'
      ) {
        (this.flushTimer as NodeJS.Timeout).unref();
      }
    }
  }

  /**
   * Setup shutdown hooks for graceful shutdown
   * - Node.js: process SIGTERM/SIGINT handlers
   * - Browser: window beforeunload/pagehide handlers
   */
  private setupShutdownHooks(): void {
    // Node.js environment
    if (typeof process !== 'undefined' && process.on) {
      const shutdownHandler = async () => {
        await this.shutdown();
      };

      process.on('SIGTERM', shutdownHandler);
      process.on('SIGINT', shutdownHandler);
    }

    // Browser environment
    if (typeof globalThis !== 'undefined' && globalThis.window) {
      const shutdownHandler = async () => {
        await this.shutdown();
      };

      if (typeof globalThis.window.addEventListener === 'function') {
        globalThis.window.addEventListener('beforeunload', shutdownHandler);
        globalThis.window.addEventListener('pagehide', shutdownHandler);
      }
    }
  }

  /**
   * Log error messages (non-fatal)
   */
  private logError(message: string, error?: unknown): void {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[chaos-fetch telemetry] ${message}${errorMsg ? ': ' + errorMsg : ''}`
    );
  }
}
