/**
 * Shared API Response Types
 */

export interface ApiError {
  code: string;
  message: string;
  details?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface HealthResponse {
  name: string;
  version: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp?: string;
  uptime?: number;
  environment?: string;
  duration?: number;
  dependencies?: {
    keycloak: DependencyHealth;
    operaton: DependencyHealth;
  };
}

export interface DependencyHealth {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}
