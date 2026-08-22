/**
 * Unit tests for agenda.client.fetchAgenda — soort classification, status/date/
 * time normalisation, item-URL building, and the single-page fetch + cache flow.
 */

// Spread the real module so a third export added later is not silently absent.
jest.mock('../pa-cache', () => ({
  ...jest.requireActual('../pa-cache'),
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
}));
jest.mock('@utils/config', () => ({
  config: { pa: { tkApiBase: 'https://tk', cacheTtlAgenda: 1800 } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { fetchAgenda } from './agenda.client';
import { cacheGet, cacheSet } from '../pa-cache';

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
});

describe('fetchAgenda', () => {
  it('returns cached results without fetching', async () => {
    mockCacheGet.mockResolvedValue([{ id: 'x' }]);
    const res = await fetchAgenda('2026-06-01', '2026-06-30');
    expect(res).toEqual([{ id: 'x' }]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not serve an empty cached result for the rest of the TTL', async () => {
    // An empty array left by a failed fetch is not a valid answer — see
    // tk.client for the failure this guard prevents.
    mockCacheGet.mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            Id: 'a1',
            Soort: 'Commissiedebat',
            Onderwerp: 'Energie',
            Datum: '2026-06-10T10:00:00Z',
            Status: 'Gepland',
          },
        ],
      }),
    });

    const res = await fetchAgenda('2026-06-01', '2026-06-30');

    expect(mockFetch).toHaveBeenCalled();
    expect(res.length).toBeGreaterThan(0);
  });

  it('classifies soorten, normalises fields, and caches (single page)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            Id: 'a1',
            Soort: 'Plenair debat (debat)', // → plenair, label override 'Plenair debat'
            Nummer: '2026A01',
            Onderwerp: 'Debat over stikstof',
            Datum: '2026-06-22T10:00:00+02:00',
            Status: 'Gepland',
            VoortouwCommissieNaam: null,
          },
          {
            Id: 'a2',
            Soort: 'Commissiedebat', // → commissie
            Nummer: '2026C01',
            Datum: '2026-06-23T14:00:00+02:00',
            Status: 'Uitgevoerd',
          },
          {
            Id: 'a3',
            Soort: 'Mondelinge vragen', // → vragenuur
            Nummer: '2026V01',
            Datum: '2026-06-24T15:00:00',
            Status: 'Geannuleerd',
          },
          { Id: 'a4', Soort: 'Onbekend type' }, // → skipped
        ],
      }),
    });

    const res = await fetchAgenda('2026-06-01', '2026-06-30');

    expect(res).toHaveLength(3); // unknown soort dropped
    expect(res[0]).toMatchObject({
      id: 'a1',
      soort: 'plenair',
      soortLabel: 'Plenair debat',
      titel: 'Debat over stikstof',
      iso: '2026-06-22',
      tijd: '10:00',
      status: 'gepland',
      url: expect.stringContaining('plenaire_vergaderingen'),
    });
    expect(res[1]).toMatchObject({
      soort: 'commissie',
      titel: '(geen onderwerp)',
      status: 'uitgevoerd',
      url: expect.stringContaining('commissievergaderingen'),
    });
    expect(res[2]).toMatchObject({ soort: 'vragenuur', status: 'geannuleerd', tijd: '15:00' });

    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringMatching(/^agenda:/), res, 1800);
  });

  it('throws when a page responds with a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });
    await expect(fetchAgenda('2026-06-01', '2026-06-30')).rejects.toThrow(/TK Agenda API 400/);
  });
});

describe('fetchAgenda — raw items with fields missing or unlabelled', () => {
  it('keeps the raw Soort as the label when there is no override for it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ Id: 'a1', Soort: 'Stemmingen', Nummer: '2026S01' }],
      }),
    });
    const [item] = await fetchAgenda('2026-06-01', '2026-06-30');
    expect(item).toMatchObject({ soort: 'plenair', soortLabel: 'Stemmingen' });
  });

  it('defaults id, nummer, status and date when the raw item omits them', async () => {
    // TK's OData returns partial rows for provisional agenda entries.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: [{ Soort: 'Commissiedebat' }] }),
    });
    const [item] = await fetchAgenda('2026-06-01', '2026-06-30');
    expect(item).toMatchObject({ id: '', nummer: '', status: 'gepland', iso: '' });
    expect(item.tijd).toBeNull();
  });

  it('reports no time when the timestamp is too short to carry one', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ Id: 'a1', Soort: 'Commissiedebat', Nummer: 'N', Datum: '2026-06-22' }],
      }),
    });
    const [item] = await fetchAgenda('2026-06-01', '2026-06-30');
    expect(item.tijd).toBeNull();
  });

  it('treats a page without a value array as the last, empty page', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(fetchAgenda('2026-06-01', '2026-06-30')).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rethrows and logs when the fetch rejects with a non-Error', async () => {
    mockFetch.mockRejectedValue('socket hang up');
    await expect(fetchAgenda('2026-06-01', '2026-06-30')).rejects.toBe('socket hang up');
  });
});
