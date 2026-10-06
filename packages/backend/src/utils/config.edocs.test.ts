describe('config.edocs and config.entra', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD };
    // Required for validateConfig() which runs on import
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.EDOCS_STUB_MODE;
    delete process.env.EDOCS_ALLOW_SERVICE_FALLBACK;
    delete process.env.EDOCS_ALLOWED_CLIENTS;
    delete process.env.DEPLOYMENT_ENV;
  });
  afterEach(() => {
    process.env = OLD;
  });

  it('defaults: no fallback, the three known clients, the entra-flevoland alias', async () => {
    const { config } = await import('./config.js');
    expect(config.edocs.allowServiceFallback).toBe(false);
    expect(config.edocs.allowedClients).toEqual([
      'edocs-mcp-client',
      'copilot-studio-edocs',
      'operaton-mcp-client',
    ]);
    expect(config.entra.idpAlias).toBe('entra-flevoland');
  });

  it('parses EDOCS_ALLOWED_CLIENTS and the ENTRA_* settings', async () => {
    process.env.EDOCS_ALLOWED_CLIENTS = 'a, b';
    process.env.ENTRA_TENANT_ID = 't';
    process.env.ENTRA_CLIENT_ID = 'c';
    process.env.ENTRA_CLIENT_SECRET = 's';
    const { config } = await import('./config.js');
    expect(config.edocs.allowedClients).toEqual(['a', 'b']);
    expect(config.entra).toMatchObject({ tenantId: 't', clientId: 'c', clientSecret: 's' });
  });

  it('refuses live eDOCS without the service credentials and the ENTRA_* settings', async () => {
    process.env.EDOCS_STUB_MODE = 'false';
    process.env.EDOCS_USER_ID = '';
    process.env.EDOCS_PASSWORD = '';
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    await expect(import('./config.js')).rejects.toThrow(
      /EDOCS_USER_ID[\s\S]*EDOCS_PASSWORD[\s\S]*ENTRA_TENANT_ID[\s\S]*ENTRA_CLIENT_ID[\s\S]*ENTRA_CLIENT_SECRET/
    );
  });

  it('starts live eDOCS when everything is present', async () => {
    process.env.EDOCS_STUB_MODE = 'false';
    process.env.EDOCS_USER_ID = 'testuser001';
    process.env.EDOCS_PASSWORD = 'pw';
    process.env.ENTRA_TENANT_ID = 't';
    process.env.ENTRA_CLIENT_ID = 'c';
    process.env.ENTRA_CLIENT_SECRET = 's';
    const { config } = await import('./config.js');
    expect(config.edocs.stubMode).toBe(false);
  });

  it('refuses the service fallback on production, whatever the stub mode', async () => {
    process.env.EDOCS_ALLOW_SERVICE_FALLBACK = 'true';
    process.env.DEPLOYMENT_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.OPERATON_BASE_URL = 'http://x';
    await expect(import('./config.js')).rejects.toThrow(/EDOCS_ALLOW_SERVICE_FALLBACK/);
  });

  it('allows the service fallback outside production', async () => {
    process.env.EDOCS_ALLOW_SERVICE_FALLBACK = 'true';
    process.env.DEPLOYMENT_ENV = 'acceptance';
    const { config } = await import('./config.js');
    expect(config.edocs.allowServiceFallback).toBe(true);
  });
});
