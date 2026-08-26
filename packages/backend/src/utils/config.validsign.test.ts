describe('config.validsign', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD };
    // Required for validateConfig() which runs on import
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env = OLD;
  });

  it('defaults to stub mode with no live tiers', async () => {
    delete process.env.VALIDSIGN_STUB_MODE;
    delete process.env.VALIDSIGN_LIVE_TIERS;
    const { config } = await import('./config');
    expect(config.validsign.stubMode).toBe(true);
    expect(config.validsign.liveTiers).toEqual([]);
    expect(config.validsign.baseUrl).toBe('https://my.validsign.eu/api');
    expect(config.validsign.pollIntervalMs).toBe(15000);
  });

  it('parses an explicit live-tier allowlist', async () => {
    process.env.VALIDSIGN_LIVE_TIERS = 'development, production';
    const { config } = await import('./config');
    expect(config.validsign.liveTiers).toEqual(['development', 'production']);
  });

  it('refuses to start live on a tier outside the allowlist', async () => {
    process.env.VALIDSIGN_STUB_MODE = 'false';
    process.env.VALIDSIGN_API_KEY = 'k';
    process.env.VALIDSIGN_CALLBACK_SECRET = 's';
    process.env.VALIDSIGN_LIVE_TIERS = 'production';
    process.env.DEPLOYMENT_ENV = 'acceptance';
    await expect(import('./config')).rejects.toThrow(/not in VALIDSIGN_LIVE_TIERS/);
  });

  it('starts live when the tier is allowlisted', async () => {
    process.env.VALIDSIGN_STUB_MODE = 'false';
    process.env.VALIDSIGN_API_KEY = 'k';
    process.env.VALIDSIGN_CALLBACK_SECRET = 's';
    process.env.VALIDSIGN_LIVE_TIERS = 'acceptance';
    process.env.DEPLOYMENT_ENV = 'acceptance';
    const { config } = await import('./config');
    expect(config.validsign.stubMode).toBe(false);
  });
});
