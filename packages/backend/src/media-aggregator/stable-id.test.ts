/**
 * stable-id — link-first article identity + duplicate-group clustering.
 */

import { stableArticleId, canonicalizeUrl, assignDuplicateGroups } from './stable-id';

const BASE = {
  guid: 'https://example.com/artikel/stikstof-123',
  canonical_url: 'https://example.com/artikel/stikstof-123',
  title: 'Stikstofkader provincies definitief vastgesteld',
  published_at: '2026-07-03T10:00:00.000Z',
};

describe('stableArticleId — stability', () => {
  it('same article fetched twice produces an identical id', () => {
    expect(stableArticleId(BASE)).toBe(stableArticleId(BASE));
  });

  it('uses the feed guid when present (g: prefix)', () => {
    expect(stableArticleId(BASE)).toMatch(/^g:/);
  });

  it('falls back to canonical url when guid is absent (u: prefix)', () => {
    expect(stableArticleId({ ...BASE, guid: null })).toMatch(/^u:/);
  });

  it('falls back to title+date when neither guid nor url is present (t: prefix)', () => {
    expect(stableArticleId({ ...BASE, guid: null, canonical_url: null })).toMatch(/^t:/);
  });
});

describe('canonicalizeUrl — tracking-param stripping', () => {
  it('two syndicated copies differing only in tracking params map to the same canonical', () => {
    const a = 'https://example.com/artikel?utm_source=rss&utm_medium=feed';
    const b = 'https://example.com/artikel?fbclid=abc123';
    expect(canonicalizeUrl(a)).toBe(canonicalizeUrl(b));
  });

  it('preserves non-tracking query params', () => {
    const url = 'https://example.com/search?q=stikstof';
    expect(canonicalizeUrl(url)).toContain('q=stikstof');
  });
});

describe('assignDuplicateGroups', () => {
  it('two near-identical titles share a non-null duplicate_group_id', () => {
    const articles = [
      {
        id: 'id-1',
        title: 'Stikstofkader provincies definitief vastgesteld',
        duplicate_group_id: null,
      },
      {
        id: 'id-2',
        title: 'Stikstofkader: provincies definitief vastgesteld',
        duplicate_group_id: null,
      },
    ];
    const grouped = assignDuplicateGroups(articles);
    expect(grouped[0].duplicate_group_id).not.toBeNull();
    expect(grouped[0].duplicate_group_id).toBe(grouped[1].duplicate_group_id);
  });

  it('an unrelated article gets null duplicate_group_id', () => {
    const articles = [
      {
        id: 'id-1',
        title: 'Stikstofkader provincies definitief vastgesteld',
        duplicate_group_id: null,
      },
      {
        id: 'id-2',
        title: 'Vliegtuig maakt noodlanding bij Lelystad Airport',
        duplicate_group_id: null,
      },
    ];
    const grouped = assignDuplicateGroups(articles);
    expect(grouped[0].duplicate_group_id).toBeNull();
    expect(grouped[1].duplicate_group_id).toBeNull();
  });

  it('does not mutate the input array', () => {
    const articles = [
      { id: 'id-1', title: 'Stikstofkader provincies', duplicate_group_id: null },
      { id: 'id-2', title: 'Stikstofkader: provincies', duplicate_group_id: null },
    ];
    assignDuplicateGroups(articles);
    expect(articles[0].duplicate_group_id).toBeNull();
  });
});
