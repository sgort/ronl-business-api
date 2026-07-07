/**
 * Unit tests for berichten.service — Flevoland RSS → BerichtItem, with entity
 * decoding, 10-min cache, stale/empty fallback (never throws), and getBerichtById.
 */

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

type Mod = typeof import('./berichten.service');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./berichten.service');
  });
  return mod;
}

const RSS = `<rss><channel>
<item><guid>b-1</guid><title>Werk &amp; inkomen</title><description>Loket &nbsp; open</description><pubDate>Tue, 01 Jul 2026 10:00:00 GMT</pubDate><link>https://f/1</link></item>
<item><title>Zonder link</title><description>Geen actie</description></item>
<item><title></title><description>filtered</description></item>
</channel></rss>`;

let mod: Mod;
beforeEach(() => {
  jest.clearAllMocks();
  mod = freshModule();
});

describe('getBerichtenItems', () => {
  it('decodes entities, wraps content, and derives an action from the link', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    const { items, total } = await mod.getBerichtenItems();

    expect(total).toBe(2); // empty-subject item filtered
    expect(items[0]).toMatchObject({
      id: 'b-1',
      subject: 'Werk & inkomen', // &amp; decoded
      preview: 'Loket open', // &nbsp; + whitespace collapsed
      content: '<p>Loket open</p>',
      type: 'announcement',
      status: 'published',
      sender: { id: 'flevoland', name: 'Provincie Flevoland' },
      action: { label: 'Lees meer', url: 'https://f/1' },
    });
  });

  it('sets action to null and uses an index id when link/guid are absent', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    const { items } = await mod.getBerichtenItems();
    expect(items[1].id).toBe('flevoland-1');
    expect(items[1].action).toBeNull();
  });

  it('serves from cache within the TTL', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    await mod.getBerichtenItems();
    await mod.getBerichtenItems();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('returns an empty result (no throw) when the upstream fails cold', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('down'));
    await expect(mod.getBerichtenItems()).resolves.toEqual({ items: [], total: 0 });
  });
});

describe('getBerichtById', () => {
  it('returns null before any cache is populated', () => {
    expect(mod.getBerichtById('b-1')).toBeNull();
  });

  it('finds a cached bericht by id after a fetch', async () => {
    mockAxios.get.mockResolvedValue({ data: RSS });
    await mod.getBerichtenItems();
    expect(mod.getBerichtById('b-1')?.subject).toBe('Werk & inkomen');
    expect(mod.getBerichtById('nope')).toBeNull();
  });
});
