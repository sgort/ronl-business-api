describe('config.llmStub', () => {
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

  it('is off unless switched on', async () => {
    delete process.env.LLM_STUB_ENABLED;
    const { config } = await import('./config.js');
    expect(config.llmStub.enabled).toBe(false);
  });

  it('can be switched on outside production', async () => {
    process.env.LLM_STUB_ENABLED = 'true';
    process.env.DEPLOYMENT_ENV = 'acceptance';
    const { config } = await import('./config.js');
    expect(config.llmStub.enabled).toBe(true);
  });

  it('refuses to start with the stub model switched on in production', async () => {
    process.env.LLM_STUB_ENABLED = 'true';
    process.env.DEPLOYMENT_ENV = 'production';
    await expect(import('./config.js')).rejects.toThrow(/LLM_STUB_ENABLED/);
  });
});
