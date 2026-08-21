/**
 * Unit tests for config.ts.
 *
 * Every other test file mocks this module, so nothing exercised the real one —
 * which is where all the environment defaults and the import-time validation
 * live. dotenv and tls-bootstrap are mocked out so the test never reads a real
 * .env or touches TLS; process.env is replaced wholesale per load so the
 * developer's own environment cannot leak into the expected defaults.
 */
export {};

jest.mock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));
const mockApplyExtraCaCerts = jest.fn();
jest.mock('./tls-bootstrap', () => ({ applyExtraCaCerts: mockApplyExtraCaCerts }));

type Config = (typeof import('./config'))['config'];

const ORIGINAL_ENV = process.env;

/** Loads a pristine copy of config.ts against exactly the given environment. */
function loadConfig(env: Record<string, string> = {}): Config {
  // ANTHROPIC_API_KEY is required by validateConfig, so it is part of the
  // minimum viable environment rather than something a caller opts into.
  process.env = { ANTHROPIC_API_KEY: 'sk-default', ...env } as NodeJS.ProcessEnv;
  let mod!: typeof import('./config');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./config');
  });
  return mod.config;
}

/** Loads config.ts against an environment that is missing something required. */
function loadInvalidConfig(env: Record<string, string> = {}): void {
  process.env = { ...env } as NodeJS.ProcessEnv;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./config');
  });
}

/** Every variable config.ts reads, set to a value distinguishable from its default. */
const ALL_OVERRIDES: Record<string, string> = {
  NODE_ENV: 'acceptance',
  DEPLOYMENT_ENV: 'acc',
  PORT: '4000',
  HOST: '127.0.0.1',
  CORS_ORIGIN: 'https://a.test, https://b.test',
  KEYCLOAK_URL: 'https://kc.test',
  KEYCLOAK_REALM: 'other-realm',
  KEYCLOAK_CLIENT_ID: 'other-client',
  KEYCLOAK_CLIENT_SECRET: 'shh',
  JWT_ISSUER: 'https://kc.test/realms/other',
  JWT_AUDIENCE: 'other-audience',
  TOKEN_CACHE_TTL: '60',
  OPERATON_BASE_URL: 'https://op.test/engine-rest',
  OPERATON_M2M_BASE_URL: 'https://op-m2m.test/engine-rest',
  OPERATON_TIMEOUT: '5000',
  OPERATON_USERNAME: 'op-user',
  OPERATON_PASSWORD: 'op-pass',
  OPERATON_M2M_USERNAME: 'm2m-user',
  OPERATON_M2M_PASSWORD: 'm2m-pass',
  DATABASE_URL: 'postgresql://u:p@db.test:5432/audit',
  DATABASE_POOL_MIN: '3',
  DATABASE_POOL_MAX: '20',
  REDIS_URL: 'redis://redis.test:6379',
  REDIS_TTL: '120',
  RATE_LIMIT_WINDOW_MS: '1000',
  RATE_LIMIT_MAX_REQUESTS: '5',
  RATE_LIMIT_PER_TENANT: 'false',
  LOG_LEVEL: 'debug',
  LOG_FORMAT: 'pretty',
  LOG_FILE_ENABLED: 'false',
  LOG_FILE_PATH: '/var/log/ronl',
  LOG_FILE_MAX_SIZE: '50m',
  LOG_FILE_MAX_FILES: '14',
  AUDIT_LOG_ENABLED: 'false',
  AUDIT_LOG_INCLUDE_IP: 'false',
  AUDIT_LOG_RETENTION_DAYS: '30',
  HELMET_ENABLED: 'false',
  SECURE_COOKIES: 'true',
  TRUST_PROXY: 'true',
  ENABLE_SWAGGER: 'false',
  ENABLE_METRICS: 'false',
  ENABLE_HEALTH_CHECKS: 'false',
  DEFAULT_MAX_PROCESS_INSTANCES: '25',
  ENABLE_TENANT_ISOLATION: 'false',
  EDOCS_BASE_URL: 'https://edocs.test',
  EDOCS_LIBRARY: 'OTHERLIB',
  EDOCS_USER_ID: 'edocs-user',
  EDOCS_PASSWORD: 'edocs-pass',
  EDOCS_STUB_MODE: 'false',
  EDOCS_MCP_ENABLED: 'true',
  EDOCS_MCP_CLIENT_ID: 'other-mcp-client',
  EDOCS_MCP_CLIENT_SECRET: 'mcp-secret',
  DOCCLE_BASE_URL: 'https://doccle.test',
  DOCCLE_API_ACC: 'https://doccle-acc.test',
  DOCCLE_USERNAME: 'doccle-user',
  DOCCLE_PASSWORD: 'doccle-pass',
  DOCCLE_STUB_MODE: 'false',
  MCP_ENABLED: 'true',
  MCP_SKIP_HEALTH_CHECK: 'true',
  TRIPLYDB_MCP_ENABLED: 'true',
  TRIPLYDB_ENDPOINT: 'https://triply.test/sparql',
  TRIPLYDB_TOKEN: 'triply-token',
  CPRMV_MCP_ENABLED: 'true',
  CPRMV_URL: 'https://cprmv.test/mcp',
  LDE_MCP_ENABLED: 'true',
  LDE_DATABASE_URL: 'postgresql://u:p@lde.test:5432/lde',
  LDE_API_URL: 'https://lde.test/v1',
  ANTHROPIC_API_KEY: 'sk-anthropic',
  OPENAI_API_KEY: 'sk-openai',
  GITLAB_TOKEN: 'glpat-x',
  GITLAB_BASE_URL: 'https://gitlab.test',
  GITLAB_PROJECT_PATH: 'group%2Fproject',
  GITLAB_UC_LABEL: 'uc::other',
  ALTCHA_HMAC_KEY: 'hmac-key',
  PUBLIC_SHOW_WIP_PROCESSES: 'true',
  TK_API_BASE: 'https://tk.test/OData/v5',
  EU_API_BASE: 'https://eu.test/api/v2',
  EU_SOURCE_ENABLED: 'false',
  EP_TEXTS_SUBMITTED_ENABLED: 'false',
  MEDIA_SOURCE_ENABLED: 'true',
  MEDIA_AGGREGATOR_BASE: 'https://media.test',
  MEDIA_AGGREGATOR_API_KEY: 'media-key',
  CACHE_TTL_TK: '60',
  CACHE_TTL_AGENDA: '120',
  CACHE_TTL_STATIC: '180',
  PA_USE_MOCK: 'true',
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('config defaults (empty environment)', () => {
  let config: Config;
  beforeAll(() => {
    config = loadConfig();
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('falls back to the development runtime defaults', () => {
    expect(config.nodeEnv).toBe('development');
    expect(config.deploymentEnv).toBe('development');
    expect(config.port).toBe(3002);
    expect(config.host).toBe('0.0.0.0');
    expect(config.corsOrigin).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5175',
      'http://localhost:3002',
    ]);
  });

  it('defaults the identity and engine sections to the local stack', () => {
    expect(config.keycloak).toEqual({
      url: 'http://localhost:8080',
      realm: 'ronl',
      clientId: 'ronl-business-api',
      clientSecret: '',
    });
    expect(config.jwt).toEqual({
      issuer: 'http://localhost:8080/realms/ronl',
      audience: 'ronl-business-api',
      cacheTtl: 300,
    });
    expect(config.operaton).toEqual({
      baseUrl: 'https://operaton.open-regels.nl/engine-rest',
      m2mBaseUrl: 'https://operaton-doc.open-regels.nl/engine-rest',
      timeout: 30000,
      username: undefined,
      password: undefined,
      m2mUsername: undefined,
      m2mPassword: undefined,
    });
  });

  it('defaults the storage sections', () => {
    expect(config.database).toEqual({
      url: 'postgresql://audit_user:audit_password@localhost:5432/audit_logs',
      poolMin: 2,
      poolMax: 10,
    });
    expect(config.redis).toEqual({ url: 'redis://localhost:6379', ttl: 3600 });
  });

  it('defaults the operational toggles to their safe values', () => {
    expect(config.rateLimit).toEqual({ windowMs: 60000, maxRequests: 100, perTenant: true });
    expect(config.logging).toEqual({
      level: 'info',
      format: 'json',
      fileEnabled: true,
      filePath: './logs',
      fileMaxSize: '10m',
      fileMaxFiles: 7,
    });
    expect(config.audit).toEqual({ enabled: true, includeIp: true, retentionDays: 2555 });
    expect(config.security).toEqual({
      helmetEnabled: true,
      secureCookies: false,
      trustProxy: false,
    });
    expect(config.features).toEqual({ swagger: true, metrics: true, healthChecks: true });
    expect(config.tenant).toEqual({ defaultMaxProcessInstances: 1000, enableIsolation: true });
  });

  it('defaults the document integrations to stub mode', () => {
    expect(config.edocs).toEqual({
      baseUrl: '',
      library: 'DOCUVITT',
      userId: '',
      password: '',
      stubMode: true,
    });
    expect(config.edocsMcp).toEqual({
      enabled: false,
      clientId: 'edocs-mcp-client',
      clientSecret: '',
    });
    expect(config.doccle).toEqual({
      apiBaseUrl: '',
      username: '',
      password: '',
      stubMode: true,
    });
  });

  it('defaults every MCP provider to disabled', () => {
    expect(config.mcp).toEqual({ enabled: false, skipHealthCheck: false });
    expect(config.triplydb).toEqual({ enabled: false, endpoint: '', token: '' });
    expect(config.cprmv).toEqual({ enabled: false, url: 'https://acc.cprmv.open-regels.nl/mcp' });
    expect(config.lde).toEqual({
      enabled: false,
      databaseUrl: '',
      apiUrl: 'https://acc.backend.linkeddata.open-regels.nl/v1',
    });
  });

  it('defaults the remaining integrations', () => {
    expect(config.openai).toEqual({ apiKey: '' });
    expect(config.gitlab).toEqual({
      token: '',
      baseUrl: 'https://git.open-regels.nl',
      projectPath: 'showcases%2Fiou-architectuur',
      ucLabel: 'uc::submitted',
    });
    expect(config.altcha).toEqual({ hmacKey: '' });
    expect(config.public).toEqual({ showWipProcesses: false });
    expect(config.pa).toEqual({
      tkApiBase: 'https://gegevensmagazijn.tweedekamer.nl/OData/v5',
      euApiBase: 'https://data.europarl.europa.eu/api/v2',
      euSourceEnabled: true,
      epTextsSubmittedEnabled: true,
      mediaSourceEnabled: false,
      mediaAggregatorBase: '',
      mediaAggregatorApiKey: '',
      cacheTtlTk: 900,
      cacheTtlAgenda: 1800,
      cacheTtlStatic: 3600,
      useMock: false,
    });
  });
});

describe('config overrides (every variable set)', () => {
  let config: Config;
  beforeAll(() => {
    config = loadConfig(ALL_OVERRIDES);
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('takes the runtime, identity and engine values from the environment', () => {
    expect(config.nodeEnv).toBe('acceptance');
    expect(config.deploymentEnv).toBe('acceptance');
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    // A comma-separated list is split and each entry trimmed.
    expect(config.corsOrigin).toEqual(['https://a.test', 'https://b.test']);
    expect(config.keycloak).toEqual({
      url: 'https://kc.test',
      realm: 'other-realm',
      clientId: 'other-client',
      clientSecret: 'shh',
    });
    expect(config.jwt).toEqual({
      issuer: 'https://kc.test/realms/other',
      audience: 'other-audience',
      cacheTtl: 60,
    });
    expect(config.operaton).toEqual({
      baseUrl: 'https://op.test/engine-rest',
      m2mBaseUrl: 'https://op-m2m.test/engine-rest',
      timeout: 5000,
      username: 'op-user',
      password: 'op-pass',
      m2mUsername: 'm2m-user',
      m2mPassword: 'm2m-pass',
    });
  });

  it('takes the storage and operational values from the environment', () => {
    expect(config.database).toEqual({
      url: 'postgresql://u:p@db.test:5432/audit',
      poolMin: 3,
      poolMax: 20,
    });
    expect(config.redis).toEqual({ url: 'redis://redis.test:6379', ttl: 120 });
    expect(config.rateLimit).toEqual({ windowMs: 1000, maxRequests: 5, perTenant: false });
    expect(config.logging).toEqual({
      level: 'debug',
      format: 'pretty',
      fileEnabled: false,
      filePath: '/var/log/ronl',
      fileMaxSize: '50m',
      fileMaxFiles: 14,
    });
    expect(config.audit).toEqual({ enabled: false, includeIp: false, retentionDays: 30 });
    expect(config.security).toEqual({
      helmetEnabled: false,
      secureCookies: true,
      trustProxy: true,
    });
    expect(config.features).toEqual({ swagger: false, metrics: false, healthChecks: false });
    expect(config.tenant).toEqual({ defaultMaxProcessInstances: 25, enableIsolation: false });
  });

  it('takes the integration values from the environment', () => {
    expect(config.edocs).toEqual({
      baseUrl: 'https://edocs.test',
      library: 'OTHERLIB',
      userId: 'edocs-user',
      password: 'edocs-pass',
      stubMode: false,
    });
    expect(config.edocsMcp).toEqual({
      enabled: true,
      clientId: 'other-mcp-client',
      clientSecret: 'mcp-secret',
    });
    // DOCCLE_BASE_URL wins over the environment-specific DOCCLE_API_ACC.
    expect(config.doccle).toEqual({
      apiBaseUrl: 'https://doccle.test',
      username: 'doccle-user',
      password: 'doccle-pass',
      stubMode: false,
    });
    expect(config.mcp).toEqual({ enabled: true, skipHealthCheck: true });
    expect(config.triplydb).toEqual({
      enabled: true,
      endpoint: 'https://triply.test/sparql',
      token: 'triply-token',
    });
    expect(config.cprmv).toEqual({ enabled: true, url: 'https://cprmv.test/mcp' });
    expect(config.lde).toEqual({
      enabled: true,
      databaseUrl: 'postgresql://u:p@lde.test:5432/lde',
      apiUrl: 'https://lde.test/v1',
    });
    expect(config.anthropic).toEqual({ apiKey: 'sk-anthropic' });
    expect(config.openai).toEqual({ apiKey: 'sk-openai' });
    expect(config.gitlab).toEqual({
      token: 'glpat-x',
      baseUrl: 'https://gitlab.test',
      projectPath: 'group%2Fproject',
      ucLabel: 'uc::other',
    });
    expect(config.altcha).toEqual({ hmacKey: 'hmac-key' });
    expect(config.public).toEqual({ showWipProcesses: true });
    expect(config.pa).toEqual({
      tkApiBase: 'https://tk.test/OData/v5',
      euApiBase: 'https://eu.test/api/v2',
      euSourceEnabled: false,
      epTextsSubmittedEnabled: false,
      mediaSourceEnabled: true,
      mediaAggregatorBase: 'https://media.test',
      mediaAggregatorApiKey: 'media-key',
      cacheTtlTk: 60,
      cacheTtlAgenda: 120,
      cacheTtlStatic: 180,
      useMock: true,
    });
  });
});

describe('doccle.apiBaseUrl fallback chain', () => {
  it('falls back to DOCCLE_API_ACC when the generic DOCCLE_BASE_URL is unset', () => {
    const config = loadConfig({ DOCCLE_API_ACC: 'https://doccle-acc.test' });
    expect(config.doccle.apiBaseUrl).toBe('https://doccle-acc.test');
  });
});

describe('import-time side effects', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv').default as { config: jest.Mock };

  it('applies NODE_EXTRA_CA_CERTS after dotenv has populated the environment', () => {
    loadConfig();
    expect(mockApplyExtraCaCerts).toHaveBeenCalledTimes(1);
  });

  it('loads the environment-specific .env before the generic one', () => {
    loadConfig({ NODE_ENV: 'acceptance' });
    expect(dotenv.config).toHaveBeenCalledTimes(2);
    expect(dotenv.config).toHaveBeenNthCalledWith(1, {
      path: expect.stringContaining('.env.acceptance'),
    });
    expect(dotenv.config).toHaveBeenNthCalledWith(2);
  });

  it('falls back to .env.development when NODE_ENV is unset', () => {
    loadConfig();
    expect(dotenv.config).toHaveBeenNthCalledWith(1, {
      path: expect.stringContaining('.env.development'),
    });
  });
});

/** The settings a production start must supply for validateConfig to pass. */
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  KEYCLOAK_CLIENT_SECRET: 'shh',
  DATABASE_URL: 'postgresql://u:p@db.test:5432/audit',
  OPERATON_BASE_URL: 'https://op.test/engine-rest',
};

describe('validateConfig', () => {
  it('accepts a production start once every required setting is present', () => {
    const config = loadConfig(PRODUCTION_ENV);
    expect(config.nodeEnv).toBe('production');
  });

  it('rejects a production start without a Keycloak client secret', () => {
    const { KEYCLOAK_CLIENT_SECRET: _omitted, ...rest } = PRODUCTION_ENV;
    expect(() => loadConfig(rest)).toThrow(/KEYCLOAK_CLIENT_SECRET is required in production/);
  });

  it('rejects a production start without a database URL', () => {
    // The resolved config always has a URL — the localhost default sees to that
    // — so the check has to look at the environment, or production silently
    // writes its audit log to localhost.
    const { DATABASE_URL: _omitted, ...rest } = PRODUCTION_ENV;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL is required in production/);
  });

  it('rejects a production start without an Operaton base URL', () => {
    const { OPERATON_BASE_URL: _omitted, ...rest } = PRODUCTION_ENV;
    expect(() => loadConfig(rest)).toThrow(/OPERATON_BASE_URL is required in production/);
  });

  it('rejects any environment without an Anthropic API key', () => {
    expect(() => loadInvalidConfig()).toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it('lets development start on the built-in defaults, with no .env at all', () => {
    // Only the API key is genuinely mandatory outside production; requiring the
    // rest would mean a checkout could not be run without provisioning first.
    const config = loadConfig();
    expect(config.nodeEnv).toBe('development');
    expect(config.database.url).toContain('localhost');
    expect(config.operaton.baseUrl).toBe('https://operaton.open-regels.nl/engine-rest');
  });

  it('reports every problem at once rather than the first', () => {
    const message = (() => {
      try {
        loadInvalidConfig({ NODE_ENV: 'production' });
        return '';
      } catch (err) {
        return (err as Error).message;
      }
    })();

    expect(message).toContain('KEYCLOAK_CLIENT_SECRET is required in production');
    expect(message).toContain('DATABASE_URL is required in production');
    expect(message).toContain('OPERATON_BASE_URL is required in production');
    expect(message).toContain('ANTHROPIC_API_KEY is required');
  });
});

describe('deploymentEnv', () => {
  it('names the tier from DEPLOYMENT_ENV, independently of the runtime mode', () => {
    // This is the whole point: ACC runs NODE_ENV=production so it behaves like
    // production, and still has to be able to say it is ACC.
    const config = loadConfig({ ...PRODUCTION_ENV, DEPLOYMENT_ENV: 'acceptance' });
    expect(config.nodeEnv).toBe('production');
    expect(config.deploymentEnv).toBe('acceptance');
  });

  it.each([
    ['acc', 'acceptance'],
    ['ACC', 'acceptance'],
    ['  Acceptance  ', 'acceptance'],
    ['staging', 'acceptance'],
    ['prod', 'production'],
    ['production', 'production'],
    ['dev', 'development'],
    ['development', 'development'],
    ['test', 'test'],
  ])('normalises %s to %s', (raw, expected) => {
    expect(loadConfig({ DEPLOYMENT_ENV: raw }).deploymentEnv).toBe(expected);
  });

  it('passes an unrecognised label through rather than swallowing it', () => {
    // A typo in App Settings should be visible in /v1/health, not silently
    // reported as development.
    expect(loadConfig({ DEPLOYMENT_ENV: 'acceptence' }).deploymentEnv).toBe('acceptence');
  });

  it('falls back to NODE_ENV when DEPLOYMENT_ENV is unset', () => {
    expect(loadConfig(PRODUCTION_ENV).deploymentEnv).toBe('production');
  });

  it('falls back to development when neither is set', () => {
    expect(loadConfig().deploymentEnv).toBe('development');
  });
});
