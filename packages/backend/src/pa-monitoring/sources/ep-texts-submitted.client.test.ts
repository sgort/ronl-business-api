/**
 * Unit tests for ep-texts-submitted.client — normaliseEpRef and parsePageHtml.
 * Both functions are pure/deterministic; no network calls are made.
 */

jest.mock('@utils/config', () => ({
  config: { pa: { euApiBase: '', cacheTtlTk: 900 }, redis: { url: '' } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../pa-cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normaliseEpRef,
  parsePageHtml,
  fetchSubmittedTexts,
  fetchAllNewSubmittedTexts,
} from './ep-texts-submitted.client';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'ep-texts-submitted.html'), 'utf-8');

const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

// The four valid refs the fixture parses to (2 malformed cards are skipped).
const FIXTURE_IDS = ['A-10-2026-0151', 'A-10-2026-0156', 'B-10-2026-0333', 'A-10-2026-0168'];

// ── normaliseEpRef ────────────────────────────────────────────────────────────

describe('normaliseEpRef', () => {
  it('converts A-ref display format to canonical dashed form', () => {
    expect(normaliseEpRef('A10-0151/2026')).toBe('A-10-2026-0151');
  });

  it('converts B-ref display format to canonical dashed form', () => {
    expect(normaliseEpRef('B10-0333/2026')).toBe('B-10-2026-0333');
  });

  it('pads the document number to 4 digits', () => {
    expect(normaliseEpRef('A10-0042/2026')).toBe('A-10-2026-0042');
  });

  it('passes through a ref already in canonical form', () => {
    expect(normaliseEpRef('A-10-2026-0151')).toBe('A-10-2026-0151');
  });

  it('passes through a canonical B-ref unchanged', () => {
    expect(normaliseEpRef('B-10-2026-0333')).toBe('B-10-2026-0333');
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(normaliseEpRef('  A10-0151/2026  ')).toBe('A-10-2026-0151');
  });

  it('returns null for a completely invalid string', () => {
    expect(normaliseEpRef('INVALID-REF')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normaliseEpRef('')).toBeNull();
  });
});

// ── parsePageHtml ─────────────────────────────────────────────────────────────

describe('parsePageHtml (fixture: ep-texts-submitted.html)', () => {
  let docs: ReturnType<typeof parsePageHtml>;

  beforeAll(() => {
    docs = parsePageHtml(FIXTURE);
  });

  it('returns the four valid cards and skips the two malformed ones', () => {
    // Fixture has 6 div.notice cards: 4 valid, 1 invalid ref, 1 missing title
    expect(docs).toHaveLength(4);
  });

  it('every parsed doc has a non-empty canonical id', () => {
    docs.forEach((d) => {
      expect(d.id).toMatch(/^[A-Z]+-10-\d{4}-\d{4,}$/);
    });
  });

  // ── Verslag (A-ref with committee) ──────────────────────────────────────────

  it('parses the ITRE Verslag correctly', () => {
    const doc = docs.find((d) => d.id === 'A-10-2026-0151');
    if (!doc) throw new Error('A-10-2026-0151 not found in parsed output');
    expect(doc.title).toBe('VERSLAG over de aanbeveling van de Raad inzake energie-infrastructuur');
    expect(doc.docType).toBe('Verslag');
    expect(doc.committee).toBe('ITRE');
    expect(doc.date).toBe('2026-06-05');
    expect(doc.doceoUrl).toContain('A-10-2026-0151_NL.html');
  });

  // ── Aanbeveling ─────────────────────────────────────────────────────────────

  it('classifies AANBEVELING-titled A-refs as Aanbeveling, not Verslag', () => {
    const doc = docs.find((d) => d.id === 'A-10-2026-0156');
    if (!doc) throw new Error('A-10-2026-0156 not found in parsed output');
    expect(doc.docType).toBe('Aanbeveling');
    expect(doc.committee).toBe('JURI');
  });

  // ── B-ref Ontwerpresolutie ───────────────────────────────────────────────────

  it('classifies B-refs as Ontwerpresolutie with null committee', () => {
    const doc = docs.find((d) => d.id === 'B-10-2026-0333');
    if (!doc) throw new Error('B-10-2026-0333 not found in parsed output');
    expect(doc.docType).toBe('Ontwerpresolutie');
    expect(doc.committee).toBeNull();
    expect(doc.date).toBe('2026-07-01');
  });

  // ── English title (Dutch translation not yet available) ──────────────────────

  it('parses an English-titled card without modification — title is preserved as-is', () => {
    const doc = docs.find((d) => d.id === 'A-10-2026-0168');
    if (!doc) throw new Error('A-10-2026-0168 not found in parsed output');
    expect(doc.title).toMatch(/^REPORT on/);
    expect(doc.committee).toBe('SANT');
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it('returns an empty array for a page with no div.notice cards', () => {
    expect(parsePageHtml('<html><body><p>geen documenten</p></body></html>')).toEqual([]);
  });

  it('returns an empty array for completely empty input', () => {
    expect(parsePageHtml('')).toEqual([]);
  });
});

// ── Fetch orchestration ───────────────────────────────────────────────────────

describe('fetchSubmittedTexts (single page)', () => {
  beforeEach(() => mockFetch.mockReset());

  const okHtml = (html: string) => ({ ok: true, status: 200, text: async () => html });

  it('fetches one tab page and parses its cards', async () => {
    mockFetch.mockResolvedValue(okHtml(FIXTURE));
    const docs = await fetchSubmittedTexts({ tabType: 'reports' });
    expect(docs).toHaveLength(4);
    expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('tabType')).toBe('reports');
  });

  it('rejects when the page responds with a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    await expect(fetchSubmittedTexts({})).rejects.toThrow('HTTP 503');
  });
});

describe('fetchAllNewSubmittedTexts (paging + dedup across both tabs)', () => {
  beforeEach(() => mockFetch.mockReset());

  // page 1 (no ?page param) → fixture; page >= 2 (?page set) → empty page ends the tab.
  const pageAware = () =>
    mockFetch.mockImplementation(async (url: string) => {
      const hasPage = new URL(url).searchParams.has('page');
      return { ok: true, status: 200, text: async () => (hasPage ? '<html></html>' : FIXTURE) };
    });

  it('returns the deduped new items mapped to FeedItems', async () => {
    pageAware();
    const items = await fetchAllNewSubmittedTexts({ sinceRefs: new Set() });

    // Both tabs parse the same fixture; the shared seen-set collapses them to 4.
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.id).sort()).toEqual([...FIXTURE_IDS].sort());
    expect(items.every((i) => i.source === 'eu' && i.subbron === 'ep-teksten')).toBe(true);
  });

  it('stops early and returns nothing when every ref is already known', async () => {
    pageAware();
    const items = await fetchAllNewSubmittedTexts({ sinceRefs: new Set(FIXTURE_IDS) });
    expect(items).toEqual([]);
    // page 1 was all-old → no second page requested for either tab
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('tolerates a tab whose page fetch fails (per-tab break, allSettled)', async () => {
    mockFetch.mockRejectedValue(new Error('EP down'));
    const items = await fetchAllNewSubmittedTexts({ sinceRefs: new Set() });
    expect(items).toEqual([]);
  });
});
