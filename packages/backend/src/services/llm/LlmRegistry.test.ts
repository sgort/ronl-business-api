/**
 * Unit tests for LlmRegistry — provider registration, model→provider indexing,
 * and available-model listing. Pure in-memory logic; providers are stubbed.
 */

import { LlmRegistry } from './LlmRegistry';
import type { LlmProvider } from './LlmProvider';

const makeProvider = (
  id: string,
  models: Array<{ id: string; displayName: string }>,
  available = true
): LlmProvider =>
  ({
    meta: { id, displayName: `${id} name`, models },
    isAvailable: () => available,
    streamTurn: jest.fn(),
  }) as unknown as LlmProvider;

let registry: LlmRegistry;
beforeEach(() => {
  registry = new LlmRegistry();
});

describe('register / getProvider', () => {
  it('indexes every model id to its provider', () => {
    const p = makeProvider('anthropic', [
      { id: 'claude-a', displayName: 'A' },
      { id: 'claude-b', displayName: 'B' },
    ]);
    registry.register(p);

    expect(registry.getProvider('claude-a')).toBe(p);
    expect(registry.getProvider('claude-b')).toBe(p);
  });

  it('returns undefined for an unknown model', () => {
    expect(registry.getProvider('nope')).toBeUndefined();
  });
});

describe('getAvailableModels', () => {
  it('flattens models across available providers with provider metadata', () => {
    registry.register(makeProvider('anthropic', [{ id: 'claude-a', displayName: 'A' }]));
    registry.register(makeProvider('openai', [{ id: 'gpt', displayName: 'G' }]));

    const models = registry.getAvailableModels();

    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'claude-a',
          providerId: 'anthropic',
          providerDisplayName: 'anthropic name',
        }),
        expect.objectContaining({
          id: 'gpt',
          providerId: 'openai',
          providerDisplayName: 'openai name',
        }),
      ])
    );
    expect(models).toHaveLength(2);
  });

  it('excludes providers that are not available', () => {
    registry.register(makeProvider('anthropic', [{ id: 'claude-a', displayName: 'A' }], true));
    registry.register(makeProvider('openai', [{ id: 'gpt', displayName: 'G' }], false));

    const models = registry.getAvailableModels();

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('claude-a');
  });
});
