import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific .env file
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Fallback to .env if environment-specific file doesn't exist
dotenv.config();

interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  corsOrigin: string[];
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
    clientSecret: string;
  };
  jwt: {
    issuer: string;
    audience: string;
    cacheTtl: number;
  };
  operaton: {
    baseUrl: string;
    timeout: number;
    username?: string;
    password?: string;
  };
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    url: string;
    ttl: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    perTenant: boolean;
  };
  logging: {
    level: string;
    format: string;
    fileEnabled: boolean;
    filePath: string;
    fileMaxSize: string;
    fileMaxFiles: number;
  };
  audit: {
    enabled: boolean;
    includeIp: boolean;
    retentionDays: number;
  };
  security: {
    helmetEnabled: boolean;
    secureCookies: boolean;
    trustProxy: boolean;
  };
  features: {
    swagger: boolean;
    metrics: boolean;
    healthChecks: boolean;
  };
  tenant: {
    defaultMaxProcessInstances: number;
    enableIsolation: boolean;
  };
}

function parseEnvArray(value: string | undefined, defaultValue: string[]): string[] {
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim());
}

function parseEnvInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseEnvInt(process.env.PORT, 3002),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: parseEnvArray(process.env.CORS_ORIGIN, ['http://localhost:3000']),

  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'ronl',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'ronl-business-api',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  },

  jwt: {
    issuer: process.env.JWT_ISSUER || 'http://localhost:8080/realms/ronl',
    audience: process.env.JWT_AUDIENCE || 'ronl-business-api',
    cacheTtl: parseEnvInt(process.env.TOKEN_CACHE_TTL, 300),
  },

  operaton: {
    baseUrl: process.env.OPERATON_BASE_URL || 'https://operaton.open-regels.nl/engine-rest',
    timeout: parseEnvInt(process.env.OPERATON_TIMEOUT, 30000),
    username: process.env.OPERATON_USERNAME,
    password: process.env.OPERATON_PASSWORD,
  },

  database: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://audit_user:audit_password@localhost:5432/audit_logs',
    poolMin: parseEnvInt(process.env.DATABASE_POOL_MIN, 2),
    poolMax: parseEnvInt(process.env.DATABASE_POOL_MAX, 10),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseEnvInt(process.env.REDIS_TTL, 3600),
  },

  rateLimit: {
    windowMs: parseEnvInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxRequests: parseEnvInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    perTenant: parseEnvBool(process.env.RATE_LIMIT_PER_TENANT, true),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    fileEnabled: parseEnvBool(process.env.LOG_FILE_ENABLED, true),
    filePath: process.env.LOG_FILE_PATH || './logs',
    fileMaxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
    fileMaxFiles: parseEnvInt(process.env.LOG_FILE_MAX_FILES, 7),
  },

  audit: {
    enabled: parseEnvBool(process.env.AUDIT_LOG_ENABLED, true),
    includeIp: parseEnvBool(process.env.AUDIT_LOG_INCLUDE_IP, true),
    retentionDays: parseEnvInt(process.env.AUDIT_LOG_RETENTION_DAYS, 2555), // 7 years
  },

  security: {
    helmetEnabled: parseEnvBool(process.env.HELMET_ENABLED, true),
    secureCookies: parseEnvBool(process.env.SECURE_COOKIES, false),
    trustProxy: parseEnvBool(process.env.TRUST_PROXY, false),
  },

  features: {
    swagger: parseEnvBool(process.env.ENABLE_SWAGGER, true),
    metrics: parseEnvBool(process.env.ENABLE_METRICS, true),
    healthChecks: parseEnvBool(process.env.ENABLE_HEALTH_CHECKS, true),
  },

  tenant: {
    defaultMaxProcessInstances: parseEnvInt(process.env.DEFAULT_MAX_PROCESS_INSTANCES, 1000),
    enableIsolation: parseEnvBool(process.env.ENABLE_TENANT_ISOLATION, true),
  },
};

// Validate required configuration
function validateConfig() {
  const errors: string[] = [];

  if (!config.keycloak.clientSecret && config.nodeEnv === 'production') {
    errors.push('KEYCLOAK_CLIENT_SECRET is required in production');
  }

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (!config.operaton.baseUrl) {
    errors.push('OPERATON_BASE_URL is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Run validation on import
validateConfig();

export default config;
