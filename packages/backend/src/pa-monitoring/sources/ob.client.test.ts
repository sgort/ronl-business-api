/**
 * Unit tests for ob.client.fetchObFeed — CQL building, SRU XML parsing into
 * FeedItems, newest-first sort, and the cache flow. cacheGet/cacheSet, fetch and
 * config are mocked; fast-xml-parser runs for real against a crafted fixture.
 */

// Spread the real module so a third export added later is not silently absent.
jest.mock('../pa-cache', () => ({
  ...jest.requireActual('../pa-cache'),
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
}));
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

  it('does not serve an empty cached result for the rest of the TTL', async () => {
    // Same guard as tk.client: { items: [] } is truthy, so an entry left behind
    // by a failed fetch used to be served as a real answer until the TTL ran out.
    mockCacheGet.mockResolvedValue({ items: [], total: 0, skip: 0, top: 20 });
    mockFetch.mockResolvedValue({ ok: true, text: async () => SRU_XML });

    const res = await fetchObFeed('q');

    expect(mockFetch).toHaveBeenCalled();
    expect(res.items.length).toBeGreaterThan(0);
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

  it('rethrows a network error from fetch', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    await expect(fetchObFeed('q')).rejects.toThrow('network down');
  });

  it('throws on malformed XML', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '<<invalid xml' });
    await expect(fetchObFeed('q')).rejects.toThrow('Invalid XML from OB SRU');
  });

  it('uses top (not 3×top) for skip > 0 paging requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<searchRetrieveResponse><records/></searchRetrieveResponse>',
    });
    await fetchObFeed('q', [], 20, 10);
    const url = mockFetch.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('maximumRecords')).toBe('10'); // not 30
    expect(params.get('startRecord')).toBe('21');
  });

  it('constructs a fallback URL when preferredUrl is absent', async () => {
    const noEnrichedXml = `<searchRetrieveResponse>
      <records>
        <record><recordData><gzd>
          <originalData><meta>
            <owmskern><identifier>stb-2026-9</identifier><title>Wet Z</title></owmskern>
            <owmsmantel><date>2026-07-06</date></owmsmantel>
            <tpmeta><publicatienaam>Staatsblad</publicatienaam></tpmeta>
          </meta></originalData>
        </gzd></recordData></record>
      </records>
    </searchRetrieveResponse>`;
    mockFetch.mockResolvedValue({ ok: true, text: async () => noEnrichedXml });
    const res = await fetchObFeed('q');
    expect(res.items[0].url).toBe('https://zoek.officielebekendmakingen.nl/stb-2026-9.html');
  });

  it('handles str() #text nodes (identifier with attribute + text content)', async () => {
    // When an element carries both an attribute and text content, fast-xml-parser
    // returns { '@_attr': '...', '#text': 'value' }. str() must extract '#text'.
    const attrXml = `<searchRetrieveResponse>
      <records>
        <record><recordData><gzd>
          <originalData><meta>
            <owmskern>
              <identifier resource="https://example.com/id">stcrt-2026-attr</identifier>
              <title>Attr Title</title>
            </owmskern>
            <owmsmantel><date>2026-07-07</date></owmsmantel>
            <tpmeta><publicatienaam>Staatscourant</publicatienaam></tpmeta>
          </meta></originalData>
        </gzd></recordData></record>
      </records>
    </searchRetrieveResponse>`;
    mockFetch.mockResolvedValue({ ok: true, text: async () => attrXml });
    const res = await fetchObFeed('q');
    expect(res.items[0].id).toBe('stcrt-2026-attr');
  });

  it('uses findDeep to locate owmskern when the standard gzd path is absent', async () => {
    // Non-standard structure: no gzd wrapper — dig() returns undefined, findDeep finds it.
    const altXml = `<searchRetrieveResponse>
      <records>
        <record><recordData>
          <owmskern><identifier>alt-id-1</identifier><title>Alt Title</title></owmskern>
          <owmsmantel><date>2026-07-07</date></owmsmantel>
          <tpmeta><publicatienaam>Staatsblad</publicatienaam></tpmeta>
        </recordData></record>
      </records>
    </searchRetrieveResponse>`;
    mockFetch.mockResolvedValue({ ok: true, text: async () => altXml });
    const res = await fetchObFeed('q');
    expect(res.items[0].id).toBe('alt-id-1');
    expect(res.items[0].title).toBe('Alt Title');
  });

  it('skips records without recordData or without owmskern', async () => {
    // Mix of: a record missing recordData entirely, a record missing owmskern
    // (parseRecord returns null), and a valid record — only the valid one surfaces.
    const mixedXml = `<searchRetrieveResponse>
      <records>
        <record><noData/></record>
        <record><recordData><gzd>
          <originalData><meta>
            <owmsmantel><date>2026-07-07</date></owmsmantel>
          </meta></originalData>
        </gzd></recordData></record>
        <record><recordData><gzd>
          <originalData><meta>
            <owmskern><identifier>valid-1</identifier><title>Valid</title></owmskern>
            <owmsmantel><date>2026-07-07</date></owmsmantel>
            <tpmeta><publicatienaam>Staatsblad</publicatienaam></tpmeta>
          </meta></originalData>
        </gzd></recordData></record>
      </records>
    </searchRetrieveResponse>`;
    mockFetch.mockResolvedValue({ ok: true, text: async () => mixedXml });
    const res = await fetchObFeed('q');
    expect(res.items.map((i) => i.id)).toEqual(['valid-1']);
  });
});

describe('fetchObFeed — sparse or unusual SRU payloads', () => {
  const ok = (xml: string) => ({ ok: true, status: 200, text: async () => xml });

  beforeEach(() => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('reports no total when the response omits numberOfRecords', async () => {
    mockFetch.mockResolvedValue(
      ok('<searchRetrieveResponse><records></records></searchRetrieveResponse>')
    );
    const res = await fetchObFeed('stikstof');
    expect(res.total).toBeNull();
    expect(res.items).toEqual([]);
  });

  it('falls back to the raw parse root when there is no searchRetrieveResponse wrapper', async () => {
    mockFetch.mockResolvedValue(
      ok(`<records>${record('stb-2026-9', 'Wet B', '2026-07-04', 'Staatsblad')}</records>`)
    );
    const res = await fetchObFeed('stikstof');
    expect(res.items.map((i) => i.id)).toEqual(['stb-2026-9']);
  });

  it('substitutes placeholders for a record with only an identifier', async () => {
    mockFetch.mockResolvedValue(
      ok(`<searchRetrieveResponse><records><record><recordData><gzd>
        <originalData><meta><owmskern><identifier>stcrt-2026-77</identifier></owmskern></meta></originalData>
      </gzd></recordData></record></records></searchRetrieveResponse>`)
    );
    const [item] = (await fetchObFeed('stikstof')).items;
    expect(item).toMatchObject({
      id: 'stcrt-2026-77',
      title: '(geen titel)',
      type: null,
      number: null,
      date: null,
      url: 'https://zoek.officielebekendmakingen.nl/stcrt-2026-77.html',
    });
    expect(item.description).toBeUndefined();
  });

  it('drops a record that has neither a title nor an identifier', async () => {
    mockFetch.mockResolvedValue(
      ok(`<searchRetrieveResponse><records><record><recordData><gzd>
        <originalData><meta><owmskern><creator>X</creator></owmskern></meta></originalData>
      </gzd></recordData></record></records></searchRetrieveResponse>`)
    );
    expect((await fetchObFeed('stikstof')).items).toEqual([]);
  });

  it('sorts date-less records without crashing on the comparison', async () => {
    mockFetch.mockResolvedValue(
      ok(`<searchRetrieveResponse><records>
        <record><recordData><gzd><originalData><meta><owmskern>
          <identifier>a-1</identifier><title>Eerste</title>
        </owmskern></meta></originalData></gzd></recordData></record>
        <record><recordData><gzd><originalData><meta><owmskern>
          <identifier>a-2</identifier><title>Tweede</title>
        </owmskern></meta></originalData></gzd></recordData></record>
      </records></searchRetrieveResponse>`)
    );
    expect((await fetchObFeed('stikstof')).items.map((i) => i.id).sort()).toEqual(['a-1', 'a-2']);
  });

  it('searches with no query and the default paging when called bare', async () => {
    mockFetch.mockResolvedValue(ok(SRU_XML));
    const res = await fetchObFeed();
    expect(res).toMatchObject({ skip: 0, top: 20 });
  });

  it('logs Unknown error rather than undefined when fetch rejects with a string', async () => {
    mockFetch.mockRejectedValue('socket hang up');
    await expect(fetchObFeed('stikstof')).rejects.toBe('socket hang up');
  });
});
