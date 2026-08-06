/**
 * Unit tests for search.service — federates the five public content sources
 * into one cached index, and provides the pure search/facet/lookup functions
 * the /v1/public/zoeken and per-type detail routes are built on.
 *
 * Every source service is mocked; the module is re-required per test to
 * reset its module-level cache.
 */

jest.mock('@services/nieuws.service', () => ({ getNieuwsItems: jest.fn() }));
jest.mock('@services/berichten.service', () => ({ getBerichtenItems: jest.fn() }));
jest.mock('@services/productenDiensten.service', () => ({ getProductenDienstenItems: jest.fn() }));
jest.mock('@services/regelcatalogus.service', () => ({ getRegelcatalogusData: jest.fn() }));
jest.mock('@services/lde.service', () => ({ getPublicProcesses: jest.fn() }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems } from '@services/berichten.service';
import { getProductenDienstenItems } from '@services/productenDiensten.service';
import { getRegelcatalogusData } from '@services/regelcatalogus.service';
import { getPublicProcesses } from '@services/lde.service';

type Mod = typeof import('./search.service');
function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./search.service');
  });
  return mod;
}

const m = {
  nieuws: getNieuwsItems as jest.Mock,
  berichten: getBerichtenItems as jest.Mock,
  producten: getProductenDienstenItems as jest.Mock,
  regels: getRegelcatalogusData as jest.Mock,
  processen: getPublicProcesses as jest.Mock,
};

function mockAllEmpty() {
  m.nieuws.mockResolvedValue({ items: [], total: 0 });
  m.berichten.mockResolvedValue({ items: [], total: 0 });
  m.producten.mockResolvedValue({ items: [], total: 0 });
  m.regels.mockResolvedValue({ services: [], organizations: [], concepts: [], rules: [] });
  m.processen.mockResolvedValue([]);
}

let search: Mod;
beforeEach(() => {
  jest.clearAllMocks();
  mockAllEmpty();
  search = freshModule();
});

describe('getPublicIndex', () => {
  it('maps berichten, nieuws and producten into PublicIndexItem', async () => {
    m.berichten.mockResolvedValue({
      items: [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden N23',
          preview: 'De weg is dicht.',
          content: null,
          type: 'announcement',
          status: 'published',
          audience: 'all',
          sender: { id: 'flevoland', name: 'Provincie Flevoland' },
          publishedAt: '2026-07-01T00:00:00.000Z',
          expiresAt: null,
          priority: 'normal',
          isRead: false,
          action: null,
        },
      ],
      total: 1,
    });
    m.nieuws.mockResolvedValue({
      items: [
        {
          id: 'n1',
          title: 'Kabinet stelt regels bij',
          summary: 'Nieuwe regels per 2027.',
          category: 'beleid',
          publishedAt: '2026-07-02T00:00:00.000Z',
          url: 'https://rijksoverheid.nl/n1',
          source: { id: 'government', name: 'Rijksoverheid' },
        },
      ],
      total: 1,
    });
    m.producten.mockResolvedValue({
      items: [
        {
          id: 'p1',
          title: 'Omgevingsvergunning kappen',
          description: 'Vergunning voor het kappen van bomen.',
          url: 'https://flevoland.nl/p1',
          audience: ['particulier'],
          onlineAanvragen: true,
          modified: '2026-06-15T00:00:00.000Z',
          soort: 'vergunning',
        },
      ],
      total: 1,
    });

    const index = await search.getPublicIndex();
    expect(index).toHaveLength(3);

    const bericht = index.find((i) => i.type === 'bericht')!;
    expect(bericht).toMatchObject({
      slug: 'b1',
      title: 'Wegwerkzaamheden N23',
      org: 'Provincie Flevoland',
    });

    const nieuws = index.find((i) => i.type === 'nieuws')!;
    expect(nieuws).toMatchObject({
      slug: 'n1',
      title: 'Kabinet stelt regels bij',
      org: 'Rijksoverheid',
    });

    const product = index.find((i) => i.type === 'product')!;
    expect(product).toMatchObject({
      slug: 'p1',
      title: 'Omgevingsvergunning kappen',
      audience: ['Inwoner'],
    });
  });

  it('maps regelcatalogus services into regel items, joining org/rules/concepts by title', async () => {
    m.regels.mockResolvedValue({
      services: [{ uri: 'svc:1', title: 'Zorgtoeslag', description: 'Zorgtoeslag aanvragen' }],
      organizations: [
        {
          uri: 'org:1',
          identifier: '1',
          name: 'Belastingdienst',
          homepage: 'https://belastingdienst.nl',
          logo: null,
          services: [{ uri: 'svc:1', title: 'Zorgtoeslag' }],
        },
      ],
      concepts: [
        {
          uri: 'c:1',
          prefLabel: 'Toetsingsinkomen',
          exactMatch: null,
          serviceUri: 'svc:1',
          serviceTitle: 'Zorgtoeslag',
        },
      ],
      rules: [
        {
          serviceTitle: 'Zorgtoeslag',
          ruleTitle: 'Recht op zorgtoeslag',
          validFrom: '2026-01-01',
          confidence: 'high',
          description: null,
        },
      ],
    });

    const index = await search.getPublicIndex();
    const regel = index.find((i) => i.type === 'regel')!;
    expect(regel.slug).toBe('zorgtoeslag');
    expect(regel.org).toBe('Belastingdienst');
    expect(regel.ruleCount).toBe(1);
    expect(regel.rules).toEqual([{ naam: 'Recht op zorgtoeslag', geldig: '2026-01-01' }]);
    expect(regel.begrippen).toEqual(['Toetsingsinkomen']);
  });

  it('a service with zero rules still appears (empty rules array, ruleCount 0)', async () => {
    m.regels.mockResolvedValue({
      services: [{ uri: 'svc:2', title: 'Geen regels', description: '' }],
      organizations: [],
      concepts: [],
      rules: [],
    });
    const index = await search.getPublicIndex();
    const regel = index.find((i) => i.type === 'regel')!;
    expect(regel.ruleCount).toBe(0);
    expect(regel.rules).toEqual([]);
  });

  it('maps public processes into proces items', async () => {
    m.processen.mockResolvedValue([
      {
        key: 'zorgtoeslag-process',
        naam: 'Zorgtoeslag',
        beschrijving: 'Aanvraagproces',
        gepubliceerd: '2026-06-01T00:00:00.000Z',
        status: 'active',
        forms: [{ id: 'f1', name: 'Formulier' }],
        documents: [],
        subprocesses: [],
      },
    ]);
    const index = await search.getPublicIndex();
    const proces = index.find((i) => i.type === 'proces')!;
    expect(proces.slug).toBe('zorgtoeslag-process');
    expect(proces.forms).toEqual([{ id: 'f1', name: 'Formulier' }]);
  });

  it('caches for 5 minutes and forceRefresh bypasses it', async () => {
    await search.getPublicIndex();
    await search.getPublicIndex();
    expect(m.nieuws).toHaveBeenCalledTimes(1);
    await search.getPublicIndex(true);
    expect(m.nieuws).toHaveBeenCalledTimes(2);
  });
});

describe('searchPublicIndex', () => {
  const index = [
    {
      id: 'a',
      slug: 'a',
      type: 'regel',
      title: 'Zorgtoeslag',
      summary: 'Toeslag voor zorgkosten',
      org: 'Belastingdienst',
      date: null,
      audience: ['Inwoner'],
      external: null,
      facts: [],
      tech: [],
    },
    {
      id: 'b',
      slug: 'b',
      type: 'product',
      title: 'Kapvergunning',
      summary: 'Bomen kappen',
      org: 'Provincie Flevoland',
      date: null,
      audience: ['Inwoner', 'Ondernemer'],
      external: null,
      facts: [],
      tech: [],
    },
    {
      id: 'c',
      slug: 'c',
      type: 'nieuws',
      title: 'Kabinet nieuws',
      summary: 'Landelijk beleid',
      org: 'Rijksoverheid',
      date: '2026-01-01',
      audience: ['Inwoner'],
      external: null,
      facts: [],
      tech: [],
    },
  ] as import('./search.service').PublicIndexItem[];

  it('an empty query returns everything', () => {
    expect(search.searchPublicIndex(index, '', {})).toHaveLength(3);
  });

  it('matches by title and summary, case-insensitively', () => {
    const hits = search.searchPublicIndex(index, 'zorgtoeslag', {});
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });

  it('filtering on two types adds up to their combined count', () => {
    const hits = search.searchPublicIndex(index, '', { types: ['regel', 'product'] });
    expect(hits).toHaveLength(2);
  });

  it('filters by org and audience', () => {
    expect(search.searchPublicIndex(index, '', { orgs: ['Rijksoverheid'] })).toHaveLength(1);
    expect(search.searchPublicIndex(index, '', { audience: ['Ondernemer'] })).toHaveLength(1);
  });

  it('regex metacharacters in the query do not crash', () => {
    expect(() => search.searchPublicIndex(index, '.*+?^${}()|[]\\', {})).not.toThrow();
    expect(search.searchPublicIndex(index, '.*+?^${}()|[]\\', {})).toEqual([]);
  });

  it('sorts by az, date, or relevance', () => {
    const az = search.searchPublicIndex(index, '', { sort: 'az' });
    // Alphabetical (nl locale): Kabinet nieuws, Kapvergunning, Zorgtoeslag
    expect(az.map((h) => h.id)).toEqual(['c', 'b', 'a']);
    const byDate = search.searchPublicIndex(index, '', { sort: 'date' });
    expect(byDate[0].id).toBe('c'); // only item with a date sorts first
  });
});

describe('facetCounts', () => {
  it('counts occurrences and sorts descending', () => {
    const index = [
      { org: 'A' },
      { org: 'A' },
      { org: 'B' },
    ] as unknown as import('./search.service').PublicIndexItem[];
    expect(search.facetCounts(index, (i) => i.org)).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
  });

  it('flattens array-valued getters (e.g. audience)', () => {
    const index = [
      { audience: ['Inwoner', 'Ondernemer'] },
      { audience: ['Inwoner'] },
    ] as unknown as import('./search.service').PublicIndexItem[];
    expect(search.facetCounts(index, (i) => i.audience)).toEqual([
      ['Inwoner', 2],
      ['Ondernemer', 1],
    ]);
  });
});

describe('getPublicItemBySlug', () => {
  it('finds an item by type + slug', async () => {
    m.regels.mockResolvedValue({
      services: [{ uri: 'svc:1', title: 'Zorgtoeslag', description: '' }],
      organizations: [],
      concepts: [],
      rules: [],
    });
    const index = await search.getPublicIndex();
    expect(search.getPublicItemBySlug(index, 'regel', 'zorgtoeslag')?.title).toBe('Zorgtoeslag');
    expect(search.getPublicItemBySlug(index, 'regel', 'nope')).toBeUndefined();
    expect(search.getPublicItemBySlug(index, 'product', 'zorgtoeslag')).toBeUndefined();
  });
});
