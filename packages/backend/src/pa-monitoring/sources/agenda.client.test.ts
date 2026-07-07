/**
 * Unit tests for agenda.client.fetchAgenda — soort classification, status/date/
 * time normalisation, item-URL building, and the single-page fetch + cache flow.
 */

jest.mock('../pa-cache', () => ({ cacheGet: jest.fn(), cacheSet: jest.fn() }));
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
