import dotenv from 'dotenv';
import path from 'path';
import { parseEnvArray, parseEnvInt, parseEnvBool } from './env';
import { applyExtraCaCerts } from './tls-bootstrap';

// Load environment-specific .env file
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Fallback to .env if environment-specific file doesn't exist
dotenv.config();

// Node reads NODE_EXTRA_CA_CERTS only at startup, so a value from .env above is
// otherwise ignored. Apply it now, before any TLS connection is made.
applyExtraCaCerts();

/**
 * Deployment tier this instance represents — the answer to "which environment
 * am I looking at?".
 *
 * Deliberately separate from NODE_ENV. NODE_ENV is a runtime-mode contract that
 * Node, Express and several libraries branch on, and this codebase branches on
 * it too: error-message disclosure (index.ts), console log format (logger.ts),
 * whether the MCP servers are spawned from dist/ or via tsx from src/, the
 * external-task long-poll window, and the required-settings check below. ACC
 * therefore runs with NODE_ENV=production so it behaves exactly like production
 * — which is the point of an acceptance environment — and cannot use NODE_ENV
 * to say which tier it is.
 *
 * DEPLOYMENT_ENV carries the tier label instead, set per Azure App Service:
 *   az webapp config appsettings set -g rg-ronl-acc  -n ronl-business-api-acc  --settings DEPLOYMENT_ENV=acceptance
 *   az webapp config appsettings set -g rg-ronl-prod -n ronl-business-api-prod --settings DEPLOYMENT_ENV=production
 * Falls back to NODE_ENV when unset, so local development stays zero-config and
 * nothing changes for an environment that has not set it yet.
 */
const DEPLOYMENT_ENV_ALIASES: Record<string, string> = {
  dev: 'development',
  development: 'development',
  acc: 'acceptance',
  acceptance: 'acceptance',
  staging: 'acceptance',
  prod: 'production',
  production: 'production',
  test: 'test',
};

function resolveDeploymentEnv(): string {
  const raw = (process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'development')
    .toLowerCase()
    .trim();
  // An unrecognised label is passed through rather than swallowed, so a typo in
  // App Settings shows up in /v1/health instead of silently reading as 'development'.
  return DEPLOYMENT_ENV_ALIASES[raw] ?? raw;
}

interface Config {
  nodeEnv: string;
  /** Deployment tier for display/reporting only — never branch on this. */
  deploymentEnv: string;
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
    m2mBaseUrl: string;
    timeout: number;
    username?: string;
    password?: string;
    m2mUsername?: string;
    m2mPassword?: string;
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
  edocs: {
    baseUrl: string;
    library: string;
    userId: string;
    password: string;
    stubMode: boolean;
  };
  edocsMcp: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
  };
  doccle: {
    apiBaseUrl: string;
    username: string;
    password: string;
    stubMode: boolean;
  };
  mcp: {
    enabled: boolean;
    skipHealthCheck: boolean;
  };
  triplydb: {
    enabled: boolean;
    endpoint: string;
    token: string;
  };
  anthropic: {
    apiKey: string;
  };
  openai: {
    apiKey: string;
  };
  gitlab: {
    token: string;
    baseUrl: string;
    projectPath: string;
    ucLabel: string;
  };
  cprmv: {
    enabled: boolean;
    url: string;
  };
  lde: {
    enabled: boolean;
    databaseUrl: string;
    apiUrl: string;
  };
  altcha: {
    hmacKey: string;
  };
  public: {
    /** ACC-only escape hatch: also expose 'wip' process bundles on the
     * public site's process library, not just 'active' ones, so ACC can
     * be used to preview in-progress processes before they go live. Must
     * stay false/unset in production. */
    showWipProcesses: boolean;
  };
  pa: {
    tkApiBase: string;
    euApiBase: string;
    euSourceEnabled: boolean;
    epTextsSubmittedEnabled: boolean;
    mediaSourceEnabled: boolean;
    mediaAggregatorBase: string;
    mediaAggregatorApiKey: string;
    cacheTtlTk: number;
    cacheTtlAgenda: number;
    cacheTtlStatic: number;
    seedDemoData: boolean;
  };
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  deploymentEnv: resolveDeploymentEnv(),
  port: parseEnvInt(process.env.PORT, 3002),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: parseEnvArray(process.env.CORS_ORIGIN, [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5175', // public-site dev server
    'http://localhost:3002',
  ]),
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
    m2mBaseUrl:
      process.env.OPERATON_M2M_BASE_URL || 'https://operaton-doc.open-regels.nl/engine-rest',
    timeout: parseEnvInt(process.env.OPERATON_TIMEOUT, 30000),
    username: process.env.OPERATON_USERNAME,
    password: process.env.OPERATON_PASSWORD,
    m2mUsername: process.env.OPERATON_M2M_USERNAME,
    m2mPassword: process.env.OPERATON_M2M_PASSWORD,
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
    // 100/min was below what the PA cockpit costs to use: one short authoring
    // journey measured 21 requests to /v1/pa/*, so a minute of ordinary
    // clicking exhausted the budget and every fetch came back 429. The surface
    // renders that as "Kon dossiers niet laden", which reads as a backend fault
    // rather than a throttle, and it cost an afternoon of misdiagnosis once.
    //
    // This is the default that ships: tiers configured purely through App
    // Settings inherit it, so it has to be a number a real user cannot reach by
    // working normally. Note the budget is per key from keyGenerator below,
    // which is IP-based — see TRUST_PROXY, without which every user behind the
    // same proxy shares one bucket.
    maxRequests: parseEnvInt(process.env.RATE_LIMIT_MAX_REQUESTS, 1000),
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

  edocs: {
    baseUrl: process.env.EDOCS_BASE_URL ?? '',
    library: process.env.EDOCS_LIBRARY ?? 'DOCUVITT',
    userId: process.env.EDOCS_USER_ID ?? '',
    password: process.env.EDOCS_PASSWORD ?? '',
    stubMode: parseEnvBool(process.env.EDOCS_STUB_MODE, true),
  },

  edocsMcp: {
    enabled: parseEnvBool(process.env.EDOCS_MCP_ENABLED, false),
    clientId: process.env.EDOCS_MCP_CLIENT_ID ?? 'edocs-mcp-client',
    clientSecret: process.env.EDOCS_MCP_CLIENT_SECRET ?? '',
  },

  doccle: {
    // DOCCLE_API_ACC is the name already configured for the staging (acceptance)
    // environment; DOCCLE_BASE_URL is the generic name used once other environments
    // (e.g. production) are configured.
    apiBaseUrl: process.env.DOCCLE_BASE_URL ?? process.env.DOCCLE_API_ACC ?? '',
    username: process.env.DOCCLE_USERNAME ?? '',
    password: process.env.DOCCLE_PASSWORD ?? '',
    stubMode: parseEnvBool(process.env.DOCCLE_STUB_MODE, true),
  },

  mcp: {
    enabled: parseEnvBool(process.env.MCP_ENABLED, false),
    skipHealthCheck: parseEnvBool(process.env.MCP_SKIP_HEALTH_CHECK, false),
  },

  triplydb: {
    enabled: parseEnvBool(process.env.TRIPLYDB_MCP_ENABLED, false),
    endpoint: process.env.TRIPLYDB_ENDPOINT ?? '',
    token: process.env.TRIPLYDB_TOKEN ?? '',
  },

  cprmv: {
    enabled: parseEnvBool(process.env.CPRMV_MCP_ENABLED, false),
    url: process.env.CPRMV_URL ?? 'https://acc.cprmv.open-regels.nl/mcp',
  },

  lde: {
    enabled: parseEnvBool(process.env.LDE_MCP_ENABLED, false),
    databaseUrl: process.env.LDE_DATABASE_URL ?? '',
    apiUrl: process.env.LDE_API_URL || 'https://acc.backend.linkeddata.open-regels.nl/v1',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
  },

  gitlab: {
    token: process.env.GITLAB_TOKEN || '',
    baseUrl: process.env.GITLAB_BASE_URL || 'https://git.open-regels.nl',
    projectPath: process.env.GITLAB_PROJECT_PATH || 'showcases%2Fiou-architectuur',
    ucLabel: process.env.GITLAB_UC_LABEL || 'uc::submitted',
  },

  altcha: {
    hmacKey: process.env.ALTCHA_HMAC_KEY || '',
  },

  public: {
    showWipProcesses: parseEnvBool(process.env.PUBLIC_SHOW_WIP_PROCESSES, false),
  },

  pa: {
    tkApiBase: process.env.TK_API_BASE || 'https://gegevensmagazijn.tweedekamer.nl/OData/v5',
    euApiBase: process.env.EU_API_BASE || 'https://data.europarl.europa.eu/api/v2',
    euSourceEnabled: parseEnvBool(process.env.EU_SOURCE_ENABLED, true),
    epTextsSubmittedEnabled: parseEnvBool(process.env.EP_TEXTS_SUBMITTED_ENABLED, true),
    mediaSourceEnabled: parseEnvBool(process.env.MEDIA_SOURCE_ENABLED, false),
    mediaAggregatorBase: process.env.MEDIA_AGGREGATOR_BASE || '',
    mediaAggregatorApiKey: process.env.MEDIA_AGGREGATOR_API_KEY || '',
    cacheTtlTk: parseEnvInt(process.env.CACHE_TTL_TK, 900),
    cacheTtlAgenda: parseEnvInt(process.env.CACHE_TTL_AGENDA, 1800),
    cacheTtlStatic: parseEnvInt(process.env.CACHE_TTL_STATIC, 3600),
    // Off by default: a live database holds only dossiers someone actually
    // authored. Turn on to populate a fresh demo/ACC environment with the
    // SEED_DOSSIERS examples. See pa-dossiers.db.ts.
    seedDemoData: parseEnvBool(process.env.PA_SEED_DEMO_DATA, false),
  },
};

// Validate required configuration
function validateConfig() {
  const errors: string[] = [];

  if (!config.keycloak.clientSecret && config.nodeEnv === 'production') {
    errors.push('KEYCLOAK_CLIENT_SECRET is required in production');
  }

  // These two check process.env rather than the resolved config on purpose.
  // Both settings fall back to a local/shared default above, so the resolved
  // value is never empty and `!config.database.url` could never be true — the
  // check read like a safety net while catching nothing, and a production
  // deployment with no DATABASE_URL would silently write its audit log to
  // localhost. The defaults stay, so development still needs no .env.
  if (!process.env.DATABASE_URL && config.nodeEnv === 'production') {
    errors.push('DATABASE_URL is required in production');
  }

  if (!process.env.OPERATON_BASE_URL && config.nodeEnv === 'production') {
    errors.push('OPERATON_BASE_URL is required in production');
  }

  if (!config.anthropic.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Run validation on import
validateConfig();

export default config;
