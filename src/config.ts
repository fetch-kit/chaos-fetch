import type { OtelConfig } from './telemetry/middleware';

export type MiddlewareConfig = Record<string, unknown>;

export interface ChaosConfig {
  otel?: OtelConfig;
  global?: MiddlewareConfig[];
  routes?: Record<string, MiddlewareConfig[]>;
}
