/**
 * Unit tests for searchArticles — region filtering, OR-term matching over
 * title+summary, newest-first sort, and the top cap. getArticles is mocked and
 * isInRegion is stubbed to a simple province match so the search logic is isolated.
 */

jest.mock('./store', () => ({ getArticles: jest.fn() }));
jest.mock('./enrich', () => ({
  isInRegion: (loc: { province: string | null }, region: string) =>
    !region || loc.province === region,
}));

import { searchArticles } from './search';
import { getArticles } from './store';
import type { AggregatorArticle } from './types';

const mockGet = getArticles as jest.Mock;

const article = (over: Partial<AggregatorArticle>): AggregatorArticle =>
  ({
    id: '',
    title: '',
    summary_short: '',
    province: 'Flevoland',
    municipality: null,
    published_at: '2026-01-01',
    ...over,
  }) as AggregatorArticle;

const CORPUS = [
  article({ id: '1', title: 'Stikstof in Flevoland', published_at: '2026-07-01' }),
  article({
    id: '2',
    title: 'Iets anders',
    summary_short: 'energie hub',
    published_at: '2026-07-05',
  }),
  article({ id: '3', title: 'Utrecht nieuws', province: 'Utrecht', published_at: '2026-07-10' }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(CORPUS);
});

describe('searchArticles', () => {
  it('filters by region and returns everything in it when q is empty (newest first)', async () => {
    const res = await searchArticles({ region: 'Flevoland', q: '' });
    expect(res.map((a) => a.id)).toEqual(['2', '1']); // Utrecht excluded, sorted desc
  });

  it('matches ANY OR-term across title and summary', async () => {
    const res = await searchArticles({ region: 'Flevoland', q: 'stikstof OR "energie hub"' });
    expect(res.map((a) => a.id).sort()).toEqual(['1', '2']);
  });

  it('excludes articles whose region does not match', async () => {
    const res = await searchArticles({ region: 'Utrecht', q: '' });
    expect(res.map((a) => a.id)).toEqual(['3']);
  });

  it('caps the result set to top', async () => {
    const res = await searchArticles({ region: 'Flevoland', q: '', top: 1 });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('2'); // newest
  });

  it('returns nothing when no term matches', async () => {
    const res = await searchArticles({ region: 'Flevoland', q: 'onbestaand' });
    expect(res).toEqual([]);
  });
});
