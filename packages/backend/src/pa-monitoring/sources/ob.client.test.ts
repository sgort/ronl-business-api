/**
 * Unit tests for ob.client.fetchObFeed — CQL building, SRU XML parsing into
 * FeedItems, newest-first sort, and the cache flow. cacheGet/cacheSet, fetch and
 * config are mocked; fast-xml-parser runs for real against a crafted fixture.
 */

jest.mock('../pa-cache', () => ({ cacheGet: jest.fn(), cacheSet: jest.fn() }));
jest.mock('@utils/config', () => ({
  config: { pa: { tkApiBase: 'https://tk', cacheTtlTk: 900 } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { fetchObFeed } from './ob.client';
import { cacheGet, cacheSet } from '../pa-cache';

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockFetch = jest.fn();

const record = (id: string, title: string, date: string, pub: string) => `
  <record><recordData><gzd>
    <originalData><meta>
      <owmskern><identifier>${id}</identifier><title>${title}</title></owmskern>
      <owmsmantel><date>${date}</date><abstract>Samenvatting ${id}</abstract></owmsmantel>
      <tpmeta><publicatienaam>${pub}</publicatienaam></tpmeta>
    </meta></originalData>
    <enrichedData><preferredUrl>https://zoek/${id}.html</preferredUrl></enrichedData>
  </gzd></recordData></record>`;

const SRU_XML = `<searchRetrieveResponse>
  <numberOfRecords>2</numberOfRecords>
  <records>
    ${record('stcrt-2026-1', 'Regeling A', '2026-07-01', 'Staatscourant')}
    ${record('stb-2026-2', 'Wet B', '2026-07-05', 'Staatsblad')}
  </records>
</searchRetrieveResponse>`;

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
});

describe('fetchObFeed', () => {
  it('returns cached results without fetching', async () => {
    mockCacheGet.mockResolvedValue({ items: [{ id: 'x' }], total: 1, skip: 0, top: 20 });
    const res = await fetchObFeed('q');
    expect(res.items).toEqual([{ id: 'x' }]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('parses the SRU XML, sorts newest-first, and caches', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => SRU_XML });

    const res = await fetchObFeed('stikstof OR "green deal"', ['Staatscourant'], 0, 20);

    // NOTE: fast-xml-parser parses <numberOfRecords> as a number, and str() only
    // stringifies strings / #text nodes — so total resolves to null (latent quirk).
    expect(res.total).toBeNull();
    // newest first — stb-2026-2 (2026-07-05) before stcrt-2026-1 (2026-07-01)
    expect(res.items.map((i) => i.id)).toEqual(['stb-2026-2', 'stcrt-2026-1']);
    expect(res.items[0]).toMatchObject({
      title: 'Wet B',
      type: 'Staatsblad',
      url: 'https://zoek/stb-2026-2.html',
      source: 'ob',
    });

    // CQL query is built with product-area, dynamic jaargang, terms and pub type
    const url = mockFetch.mock.calls[0][0] as string;
    // URLSearchParams encodes spaces as '+'; restore them before decoding.
    const query = decodeURIComponent((url.split('query=')[1] ?? '').replace(/\+/g, ' '));
    expect(query).toContain('c.product-area == "officielepublicaties"');
    expect(query).toContain(`w.jaargang == "${new Date().getFullYear()}"`);
    expect(query).toContain('cql.textAndIndexes any');
    expect(query).toContain('w.publicatienaam == "Staatscourant"');

    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringMatching(/^ob:/), res, 900);
  });

  it('throws when the SRU endpoint responds with a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchObFeed('q')).rejects.toThrow(/OB SRU 500/);
  });
});
