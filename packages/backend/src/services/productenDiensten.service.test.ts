/**
 * Unit tests for productenDiensten.service — Flevoland SC4.0 XML → ProductDienstItem,
 * covering soort derivation, audience filtering, onlineAanvragen, 30-min cache and
 * stale/empty fallback.
 */

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

type Mod = typeof import('./productenDiensten.service');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./productenDiensten.service');
  });
  return mod;
}

const XML = `<root>
<scproduct>
  <productID>p-1</productID>
  <dcterms:title>Subsidie duurzaamheid</dcterms:title>
  <dcterms:abstract>Aanvraag subsidie</dcterms:abstract>
  <dcterms:identifier>https://f/p1</dcterms:identifier>
  <dcterms:modified>2026-06-01</dcterms:modified>
  <onlineAanvragen>Ja</onlineAanvragen>
  <dcterms:audience>ondernemer</dcterms:audience>
  <dcterms:audience>bestuur</dcterms:audience>
</scproduct>
<scproduct>
  <dcterms:title>Bezwaar indienen</dcterms:title>
  <dcterms:abstract>Bezwaarprocedure</dcterms:abstract>
  <dcterms:identifier>https://f/p2</dcterms:identifier>
  <onlineAanvragen>Nee</onlineAanvragen>
  <dcterms:audience>particulier</dcterms:audience>
</scproduct>
<scproduct>
  <dcterms:title>Omgevingsvergunning</dcterms:title>
  <dcterms:abstract>Vergunning</dcterms:abstract>
  <dcterms:identifier>https://f/p3</dcterms:identifier>
</scproduct>
<scproduct>
  <dcterms:title></dcterms:title>
</scproduct>
</root>`;

let getItems: Mod['getProductenDienstenItems'];
beforeEach(() => {
  jest.clearAllMocks();
  ({ getProductenDienstenItems: getItems } = freshModule());
});

describe('getProductenDienstenItems', () => {
  it('parses items and drops empty-title entries', async () => {
    mockAxios.get.mockResolvedValue({ data: XML });
    const { total } = await getItems();
    expect(total).toBe(3); // fourth (empty title) filtered
  });

  it('derives soort from the title', async () => {
    mockAxios.get.mockResolvedValue({ data: XML });
    const { items } = await getItems();
    expect(items[0].soort).toBe('subsidie'); // title mentions subsidie
    expect(items[1].soort).toBe('bezwaar'); // title mentions bezwaar
    expect(items[2].soort).toBe('vergunning'); // default
  });

  it('maps id fallback, onlineAanvragen, modified and filters audience', async () => {
    mockAxios.get.mockResolvedValue({ data: XML });
    const { items } = await getItems();

    expect(items[0]).toMatchObject({
      id: 'p-1',
      url: 'https://f/p1',
      onlineAanvragen: true, // "Ja"
      modified: '2026-06-01',
      audience: ['ondernemer'], // "bestuur" dropped — not a known audience
    });
    expect(items[1].onlineAanvragen).toBe(false); // "Nee"
    expect(items[1].id).toBe('product-1'); // no productID → index fallback
    expect(items[2].modified).toBeNull();
  });

  it('serves from cache within the TTL', async () => {
    mockAxios.get.mockResolvedValue({ data: XML });
    await getItems();
    await getItems();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('returns an empty result (no throw) when the upstream fails cold', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('down'));
    await expect(getItems()).resolves.toEqual({ items: [], total: 0 });
  });
});
