/**
 * Unit tests for runCurationCycle — pipeline orchestration.
 * Tests source routing, deduplication, rel threshold filtering, and feed error resilience.
 * scoreItem is mocked so scoring logic is tested separately in rules.test.ts.
 */

jest.mock('@utils/config', () => ({
  config: {
    pa: { euSourceEnabled: true, epTextsSubmittedEnabled: true, mediaSourceEnabled: true },
  },
}));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockDb = { any: jest.fn(), none: jest.fn() };
jest.mock('@services/audit.service', () => ({ db: mockDb }));

const mockFetchTkFeed = jest.fn();
const mockFetchObFeed = jest.fn();
const mockFetchEuFeed = jest.fn();
// Spread the real modules first: a factory replaces the module wholesale, so an
// export added later is simply absent. That is how EU_DOCUMENT_TYPES went
// missing from pa.routes.test's mock and made GET /v1/pa/types answer 500 while
// every test still passed.
jest.mock('./sources/tk.client', () => ({
  ...jest.requireActual('./sources/tk.client'),
  fetchTkFeed: mockFetchTkFeed,
}));
jest.mock('./sources/ob.client', () => ({
  ...jest.requireActual('./sources/ob.client'),
  fetchObFeed: mockFetchObFeed,
}));
jest.mock('./sources/eu.client', () => ({
  ...jest.requireActual('./sources/eu.client'),
  fetchEuFeed: mockFetchEuFeed,
}));

const mockScoreItem = jest.fn();
jest.mock('./rules', () => ({
  ...jest.requireActual('./rules'),
  scoreItem: mockScoreItem,
}));

const mockFetchAllNewSubmittedTexts = jest.fn();
jest.mock('./sources/ep-texts-submitted.client', () => ({
  ...jest.requireActual('./sources/ep-texts-submitted.client'),
  fetchAllNewSubmittedTexts: mockFetchAllNewSubmittedTexts,
}));

const mockFetchFlevolandNews = jest.fn();
jest.mock('./sources/media.client', () => ({
  ...jest.requireActual('./sources/media.client'),
  fetchFlevolandNews: mockFetchFlevolandNews,
}));

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
  mockFetchAllNewSubmittedTexts.mockResolvedValue([]);
  mockFetchFlevolandNews.mockResolvedValue([]);
  mockDb.none.mockResolvedValue(undefined);
  // getSeenEpTekstenRefs calls db.any; default to empty seen-set
  mockDb.any.mockResolvedValue([]);
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

describe('runCurationCycle — persisted candidate label + ref formatting', () => {
  const persistedInsert = () =>
    mockDb.none.mock.calls.find((c) => String(c[0]).includes('INSERT INTO pa_signals'));

  it('item with no date → srcLabel ends in "onbekend"', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [feedItem({ source: 'tk', type: 'Motie', date: null })],
      total: 1,
    });
    await runCurationCycle();
    const srcLabel = persistedInsert()![1][4] as string;
    expect(srcLabel).toBe('Tweede Kamer · Motie · onbekend');
  });

  it('item dated seconds ago → srcLabel ends in "nu"', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [feedItem({ source: 'tk', type: 'Motie', date: new Date().toISOString() })],
      total: 1,
    });
    await runCurationCycle();
    const srcLabel = persistedInsert()![1][4] as string;
    expect(srcLabel).toBe('Tweede Kamer · Motie · nu');
  });

  it('item dated 5 hours ago → srcLabel shows "5 u geleden"', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [
        feedItem({
          source: 'tk',
          type: 'Motie',
          date: new Date(Date.now() - 5 * 3_600_000).toISOString(),
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const srcLabel = persistedInsert()![1][4] as string;
    expect(srcLabel).toBe('Tweede Kamer · Motie · 5 u geleden');
  });

  it('item dated exactly 1 day ago → srcLabel shows "gisteren"', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['ob'] })]);
    mockFetchObFeed.mockResolvedValue({
      items: [
        feedItem({
          id: 'ob-1',
          source: 'ob',
          type: 'Vergunning',
          date: new Date(Date.now() - 24 * 3_600_000).toISOString(),
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const srcLabel = persistedInsert()![1][4] as string;
    expect(srcLabel).toBe('Officiële Bekendmakingen · Vergunning · gisteren');
  });

  it('item dated exactly 2 days ago → srcLabel shows "eergisteren"', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['ob'] })]);
    mockFetchObFeed.mockResolvedValue({
      items: [
        feedItem({
          id: 'ob-1',
          source: 'ob',
          type: 'Vergunning',
          date: new Date(Date.now() - 48 * 3_600_000).toISOString(),
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const srcLabel = persistedInsert()![1][4] as string;
    expect(srcLabel).toBe('Officiële Bekendmakingen · Vergunning · eergisteren');
  });

  it('item dated 6 days ago → srcLabel shows "6 dgn"', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['ob'] })]);
    mockFetchObFeed.mockResolvedValue({
      items: [
        feedItem({
          id: 'ob-1',
          source: 'ob',
          type: 'Vergunning',
          date: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const srcLabel = persistedInsert()![1][4] as string;
    expect(srcLabel).toBe('Officiële Bekendmakingen · Vergunning · 6 dgn');
  });

  it('TK item whose url has a ?id= param → ref.nr is the decoded DocumentNummer, not item.id', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [
        feedItem({
          id: 'item-1',
          source: 'tk',
          url: 'https://zoek.officielebekendmakingen.nl/behandelddossier?id=2026D12345',
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const ref = JSON.parse(persistedInsert()![1][10] as string) as { nr: string };
    expect(ref.nr).toBe('2026D12345');
  });

  it('TK item whose url has no ?id= param → ref.nr falls back to item.id', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [
        feedItem({ id: 'item-1', source: 'tk', url: 'https://example.org/no-id-param-here' }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const ref = JSON.parse(persistedInsert()![1][10] as string) as { nr: string };
    expect(ref.nr).toBe('item-1');
  });

  it('OB item (non-tk source) → ref.nr is always item.id, regardless of url', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['ob'] })]);
    mockFetchObFeed.mockResolvedValue({
      items: [
        feedItem({
          id: 'stb-2026-123',
          source: 'ob',
          url: 'https://example.org/?id=should-be-ignored',
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    const ref = JSON.parse(persistedInsert()![1][10] as string) as { nr: string };
    expect(ref.nr).toBe('stb-2026-123');
  });

  it('item with no url → ref is null (no JSON built at all)', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [feedItem({ source: 'tk', url: null })],
      total: 1,
    });
    await runCurationCycle();
    expect(persistedInsert()![1][10]).toBeNull();
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

describe('runCurationCycle — EP Ingediende teksten routing', () => {
  it('fetches ep-teksten when there are EU searches and flag is enabled', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT OR MOTION', sources: ['eu'] })]);
    await runCurationCycle();
    expect(mockFetchAllNewSubmittedTexts).toHaveBeenCalledTimes(1);
  });

  it('does not fetch ep-teksten when there are no EU searches', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    await runCurationCycle();
    expect(mockFetchAllNewSubmittedTexts).not.toHaveBeenCalled();
  });

  it('does not fetch ep-teksten when the flag is disabled', async () => {
    const { config } = jest.requireMock('@utils/config');
    config.pa.epTextsSubmittedEnabled = false;
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT OR MOTION', sources: ['eu'] })]);
    await runCurationCycle();
    expect(mockFetchAllNewSubmittedTexts).not.toHaveBeenCalled();
    config.pa.epTextsSubmittedEnabled = true; // restore
  });

  it('ep-teksten items flow through scoring and are persisted', async () => {
    const epItem = feedItem({
      id: 'A-10-2026-0151',
      source: 'eu',
      subbron: 'ep-teksten',
      commissie: 'ITRE',
    });
    mockFetchAllNewSubmittedTexts.mockResolvedValue([epItem]);
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT OR MOTION', sources: ['eu'] })]);
    await runCurationCycle();
    expect(mockScoreItem).toHaveBeenCalledWith(epItem, expect.any(Array));
    expect(mockDb.none).toHaveBeenCalledTimes(1);
  });

  it('ep-teksten fetch failure does not abort the cycle', async () => {
    mockFetchAllNewSubmittedTexts.mockRejectedValue(new Error('EP listing unreachable'));
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT OR MOTION', sources: ['eu'] })]);
    await expect(runCurationCycle()).resolves.toBeUndefined();
  });

  it('ep-teksten items are deduplicated against eu-rss items with the same id', async () => {
    const sharedId = 'A-10-2026-0151';
    const rssItem = feedItem({ id: sharedId, source: 'eu', subbron: 'ep-rss' });
    const tekstenItem = feedItem({ id: sharedId, source: 'eu', subbron: 'ep-teksten' });
    mockFetchEuFeed.mockResolvedValue({ items: [rssItem], total: 1 });
    mockFetchAllNewSubmittedTexts.mockResolvedValue([tekstenItem]);
    mockDb.any.mockResolvedValue([savedSearch({ q: 'REPORT OR MOTION', sources: ['eu'] })]);
    await runCurationCycle();
    // Same source+id — only the first one (from RSS) should be persisted
    expect(mockDb.none).toHaveBeenCalledTimes(1);
  });
});

describe('runCurationCycle — media source routing', () => {
  it('fetches media when there are media searches and flag is enabled', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['media'] })]);
    await runCurationCycle();
    expect(mockFetchFlevolandNews).toHaveBeenCalledTimes(1);
    expect(mockFetchFlevolandNews).toHaveBeenCalledWith({ terms: ['stikstof'] });
  });

  it('does not fetch media when there are no media searches', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    await runCurationCycle();
    expect(mockFetchFlevolandNews).not.toHaveBeenCalled();
  });

  it('does not fetch media when the flag is disabled', async () => {
    const { config } = jest.requireMock('@utils/config');
    config.pa.mediaSourceEnabled = false;
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['media'] })]);
    await runCurationCycle();
    expect(mockFetchFlevolandNews).not.toHaveBeenCalled();
    config.pa.mediaSourceEnabled = true; // restore
  });

  it('multiple media searches pass all terms in one call', async () => {
    mockDb.any.mockResolvedValue([
      savedSearch({ id: 's1', q: 'stikstof', sources: ['media'] }),
      savedSearch({ id: 's2', q: 'lelystad airport', sources: ['media'] }),
    ]);
    await runCurationCycle();
    expect(mockFetchFlevolandNews).toHaveBeenCalledTimes(1);
    const { terms } = mockFetchFlevolandNews.mock.calls[0][0] as { terms: string[] };
    expect(terms).toContain('stikstof');
    expect(terms).toContain('lelystad airport');
  });

  it('media items flow through scoring and are persisted', async () => {
    const mediaItem = feedItem({
      id: 'art-abc123',
      source: 'media',
      regio: 'Flevoland · Almere',
      sentiment: 'neutraal',
    });
    mockFetchFlevolandNews.mockResolvedValue([mediaItem]);
    mockDb.any.mockResolvedValue([savedSearch({ q: 'netcongestie', sources: ['media'] })]);
    await runCurationCycle();
    expect(mockScoreItem).toHaveBeenCalledWith(mediaItem, expect.any(Array));
    expect(mockDb.none).toHaveBeenCalledTimes(1);
  });

  it('media fetch failure does not abort the cycle', async () => {
    mockFetchFlevolandNews.mockRejectedValue(new Error('aggregator unreachable'));
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['media'] })]);
    await expect(runCurationCycle()).resolves.toBeUndefined();
  });

  it('media items are deduplicated against each other by source:id', async () => {
    const sharedId = 'dup-cluster-1';
    const a = feedItem({ id: sharedId, source: 'media' });
    const b = feedItem({ id: sharedId, source: 'media' });
    mockFetchFlevolandNews.mockResolvedValue([a, b]);
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['media'] })]);
    await runCurationCycle();
    expect(mockDb.none).toHaveBeenCalledTimes(1);
  });
});

describe('promoteToInbox — human override', () => {
  // persistCandidate's db.none values array: [id, tab, dossierId, title, src, bron, subbron, commissie, regio, sentiment, ref, rel, sourceKey]
  const REL_IDX = 11;

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

describe('runCurationCycle — source label variants', () => {
  const persistedInsert = () =>
    mockDb.none.mock.calls.find((c) => String(c[0]).includes('INSERT INTO pa_signals'));

  it('tags an EP submitted-texts item with its sub-source', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['eu'] })]);
    mockFetchEuFeed.mockResolvedValue({
      items: [
        feedItem({ id: 'eu-1', source: 'eu', subbron: 'ep-teksten', type: 'Verslag', date: null }),
      ],
      total: 1,
    });
    await runCurationCycle();
    expect(persistedInsert()![1][4]).toBe(
      'Europees Parlement · Verslag · Ingediende teksten · onbekend'
    );
  });

  it('distinguishes regional from national news items', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['media'] })]);
    mockFetchFlevolandNews.mockResolvedValue([
      feedItem({
        id: 'md-1',
        source: 'media',
        subbron: 'nieuws-regionaal',
        number: 'Omroep Flevoland',
        date: null,
      }),
    ]);
    await runCurationCycle();
    expect(persistedInsert()![1][4]).toBe('Omroep Flevoland · Regionaal nieuws · onbekend');
  });

  it('falls back to the raw date string when it is not parseable', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({
      items: [feedItem({ source: 'tk', type: 'Motie', date: 'binnenkort' })],
      total: 1,
    });
    await runCurationCycle();
    expect(persistedInsert()![1][4]).toBe('Tweede Kamer · Motie · binnenkort');
  });
});

describe('runCurationCycle — saved searches without a query term', () => {
  it('skips a search that has no q, fetching nothing for it', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: '', sources: ['tk', 'ob'] })]);
    await runCurationCycle();
    expect(mockFetchTkFeed).not.toHaveBeenCalled();
    expect(mockFetchObFeed).not.toHaveBeenCalled();
  });
});

describe('runCurationCycle — failures that are not Error instances', () => {
  // Every step logs err instanceof Error ? err.message : String(err) and carries
  // on; a bare-string rejection must not take the cycle down.
  it('survives a persist that rejects with a string', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['tk'] })]);
    mockFetchTkFeed.mockResolvedValue({ items: [feedItem({ source: 'tk' })], total: 1 });
    mockDb.none.mockRejectedValue('connection terminated');
    await expect(runCurationCycle()).resolves.toBeUndefined();
  });

  it('survives a saved-search load that rejects with a string', async () => {
    mockDb.any.mockRejectedValue('connection terminated');
    await expect(runCurationCycle()).resolves.toBeUndefined();
  });

  it('survives every feed source rejecting with a string', async () => {
    mockDb.any.mockResolvedValue([
      savedSearch({ q: 'stikstof', sources: ['tk', 'ob', 'eu', 'media'] }),
    ]);
    mockFetchTkFeed.mockRejectedValue('socket hang up');
    mockFetchObFeed.mockRejectedValue('socket hang up');
    mockFetchEuFeed.mockRejectedValue('socket hang up');
    mockFetchAllNewSubmittedTexts.mockRejectedValue('socket hang up');
    mockFetchFlevolandNews.mockRejectedValue('socket hang up');
    await expect(runCurationCycle()).resolves.toBeUndefined();
  });
});

describe('runCurationCycle — press-release labelling', () => {
  const persistedInsert = () =>
    mockDb.none.mock.calls.find((c) => String(c[0]).includes('INSERT INTO pa_signals'));

  it('labels an EP press release distinctly from a plenary document', async () => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['eu'] })]);
    mockFetchEuFeed.mockResolvedValue({
      items: [
        feedItem({
          id: '20260716IPR46531',
          source: 'eu',
          subbron: 'ep-persbericht',
          type: 'Persbericht',
          date: null,
        }),
      ],
      total: 1,
    });
    await runCurationCycle();
    // The type already reads 'Persbericht', so the sub-source label is suppressed
    // rather than repeating the word.
    expect(persistedInsert()![1][4]).toBe('Europees Parlement · Persbericht · onbekend');
  });
});

describe('runCurationCycle — EP motion collapse', () => {
  const persistedInserts = () =>
    mockDb.none.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO pa_signals'));

  const motion = (id: string, title: string) =>
    feedItem({
      id,
      source: 'eu',
      subbron: 'ep-teksten',
      type: 'Ontwerpresolutie',
      title,
      date: null,
      // persistCandidate only builds the ref JSON for an item that has a url.
      url: `https://www.europarl.europa.eu/doceo/document/${id}_NL.html`,
    });

  const TITLE = 'MOTION FOR A RESOLUTION on the threat of war crimes in El-Obeid, Sudan';

  beforeEach(() => {
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['eu'] })]);
  });

  it('persists one signal for a motion tabled by several groups', async () => {
    mockFetchEuFeed.mockResolvedValue({
      items: [
        motion('B-10-2026-0360', TITLE),
        motion('B-10-2026-0359', TITLE),
        // EP is inconsistent about casing between siblings; they are one motion.
        motion('B-10-2026-0358', TITLE.replace('threat of war crimes', 'Threat of War Crimes')),
      ],
      total: 3,
    });

    await runCurationCycle();

    expect(persistedInserts()).toHaveLength(1);
  });

  it('keys the survivor on the title, not a ref, so later siblings update it', async () => {
    // A ref-derived winner would change when a lower ref turns up in a later
    // cycle, persisting a second row instead of updating the first.
    mockFetchEuFeed.mockResolvedValue({
      items: [motion('B-10-2026-0360', TITLE), motion('B-10-2026-0359', TITLE)],
      total: 2,
    });
    await runCurationCycle();
    const firstKey = persistedInserts()[0][1][13];

    jest.clearAllMocks();
    mockDb.any.mockResolvedValue([savedSearch({ q: 'stikstof', sources: ['eu'] })]);
    mockDb.none.mockResolvedValue(undefined);
    mockFetchEuFeed.mockResolvedValue({
      items: [motion('B-10-2026-0346', TITLE), motion('B-10-2026-0360', TITLE)],
      total: 2,
    });
    await runCurationCycle();

    expect(persistedInserts()[0][1][13]).toBe(firstKey);
  });

  it('shows the lowest ref and how many others tabled it', async () => {
    mockFetchEuFeed.mockResolvedValue({
      items: [
        motion('B-10-2026-0360', TITLE),
        motion('B-10-2026-0346', TITLE),
        motion('B-10-2026-0359', TITLE),
      ],
      total: 3,
    });

    await runCurationCycle();

    const ref = JSON.parse(persistedInserts()[0][1][10] as string);
    expect(ref.nr).toBe('B-10-2026-0346 +2');
  });

  it('leaves distinct motions and press releases alone', async () => {
    mockFetchEuFeed.mockResolvedValue({
      items: [
        motion('B-10-2026-0360', TITLE),
        motion('B-10-2026-0301', 'MOTION FOR A RESOLUTION on something else entirely'),
        feedItem({
          id: '20260716IPR46531',
          source: 'eu',
          subbron: 'ep-persbericht',
          type: 'Persbericht',
          title: 'Press release - EU-China relations',
          date: null,
        }),
      ],
      total: 3,
    });

    await runCurationCycle();

    expect(persistedInserts()).toHaveLength(3);
  });
});
