/**
 * Unit tests for nieuws.service — fetches + parses the Rijksoverheid RSS feed,
 * caches for 10 min, paginates, and falls back to stale cache on error.
 *
 * axios is mocked; the module is re-required per test (jest.isolateModules) to
 * reset its module-level cache.
 */

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

type Mod = typeof import('./nieuws.service');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./nieuws.service');
  });
  return mod;
}

const RSS = `<rss><channel>
<item><guid>news-1</guid><title><![CDATA[First]]></title><description><![CDATA[Sum one]]></description><pubDate>Tue, 01 Jul 2026 10:00:00 GMT</pubDate><link>https://x/1</link></item>
<item><title>Second</title><description>Desc two</description><pubDate>Wed, 02 Jul 2026 10:00:00 GMT</pubDate><link>https://x/2</link></item>
<item><title></title><description>no title, filtered</description></item>
</channel></rss>`;

let getNieuwsItems: Mod['getNieuwsItems'];
beforeEach(() => {
  jest.clearAllMocks();
  ({ getNieuwsItems } = freshModule());
});

describe('getNieuwsItems', () => {
  it('fetches, parses, maps fields and drops empty-title items', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    const { items, total } = await getNieuwsItems();

    expect(total).toBe(2); // third item (empty title) filtered out
    expect(items[0]).toMatchObject({
      id: 'news-1',
      title: 'First',
      summary: 'Sum one',
      url: 'https://x/1',
      category: null,
      source: { id: 'government', name: 'Rijksoverheid' },
    });
    expect(items[0].publishedAt).toBe(new Date('Tue, 01 Jul 2026 10:00:00 GMT').toISOString());
  });

  it('falls back to an index-based id when guid is missing', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    const { items } = await getNieuwsItems();
    expect(items[1].id).toBe('gov-news-1'); // second item has no guid
  });

  it('paginates with limit and offset', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    const page = await getNieuwsItems(1, 1);
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].title).toBe('Second');
  });

  it('serves from cache within the TTL (single upstream call)', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    await getNieuwsItems();
    await getNieuwsItems();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('throws when the feed parses to zero items (does not cache empty)', async () => {
    mockAxios.get.mockResolvedValue({ data: '<rss><channel></channel></rss>' });
    await expect(getNieuwsItems()).rejects.toThrow(/0 items/);
  });

  it('serves stale cache when a refresh fails', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    mockAxios.get.mockResolvedValueOnce({ data: RSS });
    await getNieuwsItems(); // populates cache at t=1000

    nowSpy.mockReturnValue(1_000 + 10 * 60 * 1000 + 1); // past TTL
    mockAxios.get.mockRejectedValueOnce(new Error('upstream down'));
    const res = await getNieuwsItems();

    expect(res.total).toBe(2); // stale cache served
    nowSpy.mockRestore();
  });

  it('throws on a cold cache when the upstream fails', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(getNieuwsItems()).rejects.toThrow('ECONNREFUSED');
  });
});
