// @vitest-environment jsdom
/**
 * Unit tests for the persisted mock demo store.
 *
 * The store exists so curating in mock mode changes what the next read returns;
 * these cover the persistence contract itself — seeding, round-tripping, the
 * version stamp that lets a new deployment win over a cached copy, reset, and
 * tolerance of unavailable storage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Signal } from '@ronl/shared';

const KEY = 'paV2.mock.demo';

function makeSignal(over: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    tab: 'politiek',
    dossierId: null,
    title: 'Een signaal',
    src: 'TK',
    bron: 'tk',
    ref: null,
    rel: 5,
    impact: null,
    impactLabel: null,
    duiding: null,
    status: 'candidate',
    ...over,
  } as Signal;
}

/** Fresh module instance, so the in-memory cache does not leak between tests. */
async function freshStore() {
  vi.resetModules();
  return import('./mock-demo.store');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mockSignals', () => {
  it('seeds from the fixtures on first use', async () => {
    const store = await freshStore();
    const seed = vi.fn(() => [makeSignal()]);

    expect(store.mockSignals(seed)).toHaveLength(1);
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it('does not re-seed once seeded', async () => {
    const store = await freshStore();
    const seed = vi.fn(() => [makeSignal()]);

    store.mockSignals(seed);
    store.mockSignals(seed);

    expect(seed).toHaveBeenCalledTimes(1);
  });

  it('reads a persisted set back instead of re-seeding', async () => {
    const first = await freshStore();
    first.saveMockSignals([makeSignal({ id: 'kept', status: 'confirmed' })]);

    // A fresh module is what a page reload amounts to.
    const second = await freshStore();
    const seed = vi.fn(() => [makeSignal({ id: 'fixture' })]);

    expect(second.mockSignals(seed).map((s) => s.id)).toEqual(['kept']);
    expect(seed).not.toHaveBeenCalled();
  });
});

describe('version stamp', () => {
  it('discards state stamped by a different build', async () => {
    // Reset means "back to the defaults of the deployed version", so a
    // deployment carrying new fixtures has to beat a browser's cached copy.
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: '1900.01.0', signals: [makeSignal({ id: 'stale' })] })
    );
    const store = await freshStore();
    const seed = vi.fn(() => [makeSignal({ id: 'current' })]);

    expect(store.mockSignals(seed).map((s) => s.id)).toEqual(['current']);
    expect(seed).toHaveBeenCalled();
  });

  it('discards a corrupt entry rather than throwing', async () => {
    window.localStorage.setItem(KEY, 'not json');
    const store = await freshStore();

    expect(store.mockSignals(() => [makeSignal({ id: 'current' })])).toHaveLength(1);
  });

  it('discards an entry whose signals are not an array', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 'dev', signals: 'nonsense' }));
    const store = await freshStore();

    expect(store.mockSignals(() => [makeSignal({ id: 'current' })]).map((s) => s.id)).toEqual([
      'current',
    ]);
  });
});

describe('mockSearches', () => {
  it('seeds, round-trips and resets alongside the signals', async () => {
    const store = await freshStore();
    const seedSearches = vi.fn(() => [{ id: 'seed-1' } as never]);
    store.mockSignals(() => [makeSignal()]);
    store.mockSearches(seedSearches);

    store.saveMockSearches([{ id: 'edited' } as never]);

    const reloaded = await freshStore();
    expect(reloaded.mockSearches(seedSearches).map((x) => x.id)).toEqual(['edited']);
    // The signals slice must survive a searches-only write, and vice versa.
    expect(reloaded.mockSignals(() => []).map((s) => s.id)).toEqual(['sig-1']);
  });

  it('does not persist an unseeded slice as empty', async () => {
    // Writing [] would read back as "the demo has no searches" instead of
    // "seed them from the fixtures".
    const store = await freshStore();
    store.saveMockSignals([makeSignal({ id: 'only-signals' })]);

    const reloaded = await freshStore();
    const seed = vi.fn(() => [{ id: 'from-fixture' } as never]);
    expect(reloaded.mockSearches(seed).map((x) => x.id)).toEqual(['from-fixture']);
    expect(seed).toHaveBeenCalled();
  });
});

describe('resetMockDemoData', () => {
  it('drops the persisted state so the fixtures seed again', async () => {
    const store = await freshStore();
    store.saveMockSignals([makeSignal({ id: 'curated', status: 'confirmed' })]);

    store.resetMockDemoData();

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(store.mockSignals(() => [makeSignal({ id: 'fixture' })]).map((s) => s.id)).toEqual([
      'fixture',
    ]);
  });
});

describe('storage unavailable', () => {
  it('still serves the session when writes throw', async () => {
    // Private windows and blocked site data make setItem throw; a demo should
    // degrade to in-memory rather than break.
    const store = await freshStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    store.saveMockSignals([makeSignal({ id: 'in-memory' })]);

    expect(store.mockSignals(() => []).map((s) => s.id)).toEqual(['in-memory']);
  });

  it('falls back to the fixtures when reads throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const store = await freshStore();

    expect(store.mockSignals(() => [makeSignal({ id: 'fixture' })])).toHaveLength(1);
  });
});
