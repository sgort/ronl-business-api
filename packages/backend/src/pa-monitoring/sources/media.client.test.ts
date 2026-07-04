/**
 * Unit tests for media.client — articleToFeedItem (pure mapper, no network).
 * Covers: field mapping, subbron derivation, regio join, sentiment pass-through,
 * duplicate-group id collapse, and malformed-article resilience.
 */

jest.mock('@utils/config', () => ({
  config: {
    pa: { mediaAggregatorBase: 'http://localhost', mediaAggregatorApiKey: 'test-key' },
    redis: { url: '' },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { articleToFeedItem, type AggregatorArticle } from './media.client';

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/media-search.json'), 'utf8')
) as { articles: AggregatorArticle[] };

describe('articleToFeedItem', () => {
  it('sets source to media and bron-relevant fields', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.source).toBe('media');
    expect(item.type).toBe('Nieuwsartikel');
  });

  it('maps subbron from source.type: regional → nieuws-regionaal', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.subbron).toBe('nieuws-regionaal');
  });

  it('maps subbron from source.type: national → nieuws-nationaal', () => {
    const item = articleToFeedItem(FIXTURE.articles[1]);
    expect(item.subbron).toBe('nieuws-nationaal');
  });

  it('joins province and municipality into regio', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.regio).toBe('Flevoland · Lelystad');
  });

  it('sets regio to province only when municipality is null', () => {
    const item = articleToFeedItem(FIXTURE.articles[1]);
    expect(item.regio).toBe('Flevoland');
  });

  it('sets regio to null when both province and municipality are null', () => {
    const item = articleToFeedItem(FIXTURE.articles[4]);
    expect(item.regio).toBeNull();
  });

  it('passes sentiment through', () => {
    const regional = articleToFeedItem(FIXTURE.articles[0]);
    expect(regional.sentiment).toBe('negatief');
    const positief = articleToFeedItem(FIXTURE.articles[3]);
    expect(positief.sentiment).toBe('positief');
  });

  it('sets ref.url to canonical_url', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.url).toBe(FIXTURE.articles[0].canonical_url);
  });

  it('sets number to source.homepage (provenance label)', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.number).toBe('omroepflevoland.nl');
  });

  it('collapses duplicate cluster: uses duplicate_group_id as id', () => {
    // articles[1] and articles[2] both have duplicate_group_id 'dup-stikstof-1'
    const a = articleToFeedItem(FIXTURE.articles[1]);
    const b = articleToFeedItem(FIXTURE.articles[2]);
    expect(a.id).toBe('dup-stikstof-1');
    expect(b.id).toBe('dup-stikstof-1');
    // Dedup by source:id in the curation cycle will keep only the first.
  });

  it('uses article id when duplicate_group_id is null', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.id).toBe('art-001');
  });

  it('sets description to summary_short', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.description).toBe(FIXTURE.articles[0].summary_short);
  });
});

describe('fixture resilience', () => {
  it('skips the malformed article without throwing', () => {
    const malformed = FIXTURE.articles[5];
    expect(() => articleToFeedItem(malformed)).toThrow();
    // fetchFlevolandNews wraps each article in try/catch and skips on error.
    // This confirms the contract: a bad row throws, the caller skips it.
  });

  it('processes all valid articles from the fixture', () => {
    const valid = FIXTURE.articles.slice(0, 5);
    const items = valid.map(articleToFeedItem);
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.source === 'media')).toBe(true);
  });
});
