/**
 * Unit tests for runCurationCycle — pipeline orchestration.
 * Tests source routing, deduplication, rel threshold filtering, and feed error resilience.
 * scoreItem is mocked so scoring logic is tested separately in rules.test.ts.
 */

jest.mock('@utils/config', () => ({
  config: { pa: { euSourceEnabled: true } },
}));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockDb = { any: jest.fn(), none: jest.fn() };
jest.mock('@services/audit.service', () => ({ db: mockDb }));

const mockFetchTkFeed = jest.fn();
const mockFetchObFeed = jest.fn();
const mockFetchEuFeed = jest.fn();
jest.mock('./sources/tk.client', () => ({ fetchTkFeed: mockFetchTkFeed }));
jest.mock('./sources/ob.client', () => ({ fetchObFeed: mockFetchObFeed }));
jest.mock('./sources/eu.client', () => ({ fetchEuFeed: mockFetchEuFeed }));

const mockScoreItem = jest.fn();
jest.mock('./rules', () => ({ scoreItem: mockScoreItem }));

import { runCurationCycle, promoteToInbox } from './curation.service';
import type { FeedItem } from '@ronl/shared';

// Default score: above threshold, no dossier
const PASS = { rel: 5, tab: 'politiek' as const, dossierId: null };
// Below threshold score
const FAIL = { rel: 3, tab: 'politiek' as const, dossierId: null };

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'item-1',
    source: 'tk',
    title: 'Test item',
    type: null,
    number: null,
    date: null,
    url: null,
    ...overrides,
  };
}

function savedSearch(overrides: {
  id?: string;
  q: string;
  sources: string[];
  dossierId?: string | null;
}) {
  return {
    id: overrides.id ?? 'srch-1',
    tenantId: 'flevoland',
    dossierId: overrides.dossierId ?? null,
    query: { q: overrides.q, types: [], source: overrides.sources },
    tags: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScoreItem.mockReturnValue(PASS);
  mockFetchTkFeed.mockResolvedValue({ items: [], total: 0 });
  mockFetchObFeed.mockResolvedValue({ items: [], total: 0 });
  mockFetchEuFeed.mockResolvedValue({ items: [], total: 0 });
  mockDb.none.mockResolvedValue(undefined);
});

describe('runCurationCycle — no searches', () => {
  it('returns early without fetching any feed', async () => {
    mockDb.any.mockResolvedValue([]);
    await runCurationCycle();
    expect(mockFetchTkFeed).not.toHaveBeenCalled();
    expect(mockFetchObFeed).not.toHaveBeenCalled();
    expect(mockFetchEuFeed).not.toHaveBeenCalled();
  });
});

describe('runCurationCycle — source routing', () => {
  it('TK-only search fetches TK, not OB or EU', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    await runCurationCycle();
    expect(mockFetchTkFeed).toHaveBeenCalledWith('stikstof', [], 0, 20);
    expect(mockFetchObFeed).not.toHaveBeenCalled();
    expect(mockFetchEuFeed).not.toHaveBeenCalled();
  });

  it('OB-only search fetches OB, not TK or EU', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'omgevingsvisie', sources: ['ob'] })]);
    await runCurationCycle();
    expect(mockFetchObFeed).toHaveBeenCalledWith('omgevingsvisie', [], 0, 20);
    expect(mockFetchTkFeed).not.toHaveBeenCalled();
    expect(mockFetchEuFeed).not.toHaveBeenCalled();
  });

  it('EU-only search fetches EU, not TK or OB', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT OR MOTION', sources: ['eu'] })]);
    await runCurationCycle();
    expect(mockFetchEuFeed).toHaveBeenCalledTimes(1);
    expect(mockFetchTkFeed).not.toHaveBeenCalled();
    expect(mockFetchObFeed).not.toHaveBeenCalled();
  });

  it('TK+OB search fetches both, not EU', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'energie', sources: ['tk', 'ob'] })]);
    await runCurationCycle();
    expect(mockFetchTkFeed).toHaveBeenCalledWith('energie', [], 0, 20);
    expect(mockFetchObFeed).toHaveBeenCalledWith('energie', [], 0, 20);
    expect(mockFetchEuFeed).not.toHaveBeenCalled();
  });

  it('searches without explicit source default to TK+OB, not EU', async () => {
    // source array missing entirely (fallback: ['tk', 'ob'])
    const search = {
      id: 'srch-1',
      tenantId: 'flevoland',
      dossierId: null,
      query: { q: 'stikstof', types: [] }, // no source key
      tags: [],
    };
    mockDb.any.mockResolvedValue([search]);
    await runCurationCycle();
    expect(mockFetchTkFeed).toHaveBeenCalled();
    expect(mockFetchObFeed).toHaveBeenCalled();
    expect(mockFetchEuFeed).not.toHaveBeenCalled();
  });
});

describe('runCurationCycle — EU fetched once', () => {
  it('multiple EU searches trigger exactly one EU fetch', async () => {
    mockDb.any.mockResolvedValue([
      savedSearch({ id: 's1', q: 'REPORT OR MOTION', sources: ['eu'] }),
      savedSearch({ id: 's2', q: 'climate OR emissions', sources: ['eu'] }),
      savedSearch({ id: 's3', q: 'agriculture OR farming', sources: ['eu'] }),
    ]);
    await runCurationCycle();
    expect(mockFetchEuFeed).toHaveBeenCalledTimes(1);
  });

  it('EU disabled in config → EU not fetched even with EU searches', async () => {
    const { config } = jest.requireMock('@utils/config');
    config.pa.euSourceEnabled = false;
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT', sources: ['eu'] })]);
    await runCurationCycle();
    expect(mockFetchEuFeed).not.toHaveBeenCalled();
    config.pa.euSourceEnabled = true; // restore
  });
});

describe('runCurationCycle — TK/OB query deduplication', () => {
  it('identical query in two searches fetches TK only once', async () => {
    mockDb.any.mockResolvedValue([
      savedSearch({ id: 's1', q: 'stikstof', sources: ['tk'] }),
      savedSearch({ id: 's2', q: 'stikstof', sources: ['tk'] }),
    ]);
    await runCurationCycle();
    expect(mockFetchTkFeed).toHaveBeenCalledTimes(1);
  });

  it('two different queries fetch TK twice', async () => {
    mockDb.any.mockResolvedValue([
      savedSearch({ id: 's1', q: 'stikstof', sources: ['tk'] }),
      savedSearch({ id: 's2', q: 'energie', sources: ['tk'] }),
    ]);
    await runCurationCycle();
    expect(mockFetchTkFeed).toHaveBeenCalledTimes(2);
  });
});

describe('runCurationCycle — rel threshold', () => {
  it('item scoring below 4 is not persisted', async () => {
    mockScoreItem.mockReturnValue(FAIL); // rel=3
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({ items: [feedItem()], total: 1 });
    await runCurationCycle();
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('item scoring 4 or above is persisted', async () => {
    mockScoreItem.mockReturnValue({ ...PASS, rel: 4 });
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({ items: [feedItem()], total: 1 });
    await runCurationCycle();
    expect(mockDb.none).toHaveBeenCalledTimes(1);
  });

  it('boundary: rel exactly 4 is persisted', async () => {
    mockScoreItem.mockReturnValue({ ...PASS, rel: 4 });
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({ items: [feedItem()], total: 1 });
    await runCurationCycle();
    expect(mockDb.none).toHaveBeenCalled();
  });
});

describe('runCurationCycle — deduplication', () => {
  it('two items with the same source+id are persisted only once', async () => {
    const dup = feedItem({ id: 'dup', source: 'tk' });
    mockDb.any.mockResolvedValue([
      savedSearch({ id: 's1', q: 'stikstof', sources: ['tk'] }),
      savedSearch({ id: 's2', q: 'natuur', sources: ['tk'] }),
    ]);
    // Both TK fetches return the same item
    mockFetchTkFeed.mockResolvedValue({ items: [dup], total: 1 });
    await runCurationCycle();
    expect(mockDb.none).toHaveBeenCalledTimes(1);
  });

  it('items from different sources with the same id are treated as distinct', async () => {
    const tkItem = feedItem({ id: 'shared-id', source: 'tk' });
    const obItem = feedItem({ id: 'shared-id', source: 'ob' });
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk', 'ob'] })]);
    mockFetchTkFeed.mockResolvedValue({ items: [tkItem], total: 1 });
    mockFetchObFeed.mockResolvedValue({ items: [obItem], total: 1 });
    await runCurationCycle();
    expect(mockDb.none).toHaveBeenCalledTimes(2);
  });
});

describe('runCurationCycle — feed error resilience', () => {
  it('TK fetch failure does not abort the cycle — OB still fetched', async () => {
    mockFetchTkFeed.mockRejectedValue(new Error('TK timeout'));
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk', 'ob'] })]);
    await expect(runCurationCycle()).resolves.toBeUndefined();
    expect(mockFetchObFeed).toHaveBeenCalled();
  });

  it('EU fetch failure does not abort the cycle', async () => {
    mockFetchEuFeed.mockRejectedValue(new Error('RSS unreachable'));
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT', sources: ['eu'] })]);
    await expect(runCurationCycle()).resolves.toBeUndefined();
  });
});

describe('promoteToInbox — human override', () => {
  // persistCandidate's db.none values array: [id, tab, dossierId, title, src, bron, subbron, commissie, ref, rel, sourceKey]
  const REL_IDX = 9;

  it('floors rel to 5 when the rule score is below 5', async () => {
    mockScoreItem.mockReturnValue({ rel: 3, tab: 'regionaal', dossierId: null });
    mockDb.any.mockResolvedValue([]);
    const id = await promoteToInbox('flevoland', feedItem({ id: 'x1', source: 'ob' }));
    expect(id).toBe('sig-ob-x1');
    expect(mockDb.none).toHaveBeenCalledTimes(1);
    const values = mockDb.none.mock.calls[0][1] as unknown[];
    expect(values[REL_IDX]).toBe(5);
    expect(values[0]).toBe('sig-ob-x1');
  });

  it('keeps a rule score above the floor and preserves the matched dossier', async () => {
    mockScoreItem.mockReturnValue({ rel: 8, tab: 'politiek', dossierId: 'energie' });
    mockDb.any.mockResolvedValue([]);
    await promoteToInbox('flevoland', feedItem({ id: 'x2', source: 'tk' }));
    const values = mockDb.none.mock.calls[0][1] as unknown[];
    expect(values[REL_IDX]).toBe(8);
    expect(values[2]).toBe('energie');
  });

  it('loads the tenant saved searches before scoring', async () => {
    mockDb.any.mockResolvedValue([]);
    await promoteToInbox('flevoland', feedItem());
    expect(mockDb.any).toHaveBeenCalledTimes(1);
    expect(mockScoreItem).toHaveBeenCalledTimes(1);
  });
});
