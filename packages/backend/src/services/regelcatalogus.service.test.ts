/**
 * Unit tests for regelcatalogus.service — composes the rule catalogue from five
 * SPARQL queries plus a TriplyDB assets lookup (for logo resolution), with a
 * 5-min cache and stale/empty fallback.
 *
 * axios is mocked: post is routed per-query by matching the SPARQL body; get
 * serves the assets list. Module caches are reset per test via isolateModules.
 */

// This file has no top-level import, so TypeScript would otherwise treat it as
// a global script and hoist every top-level declaration below into the global
// scope — where `mockAxios`, `Mod`, `freshModule` and friends collide with the
// identically-named declarations in sibling test files. `export {}` makes it a
// module and scopes them to this file.
export {};

const mockAxios = { post: jest.fn(), get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

type Mod = typeof import('./regelcatalogus.service');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./regelcatalogus.service');
  });
  return mod;
}

type Row = Record<string, { value: string }>;
const results = (rows: Row[]) => ({ data: { results: { bindings: rows } } });

const serviceRows: Row[] = [
  { service: { value: 'svc-1' }, title: { value: 'Svc One' }, description: { value: 'desc' } },
];
const orgRows: Row[] = [
  {
    organization: { value: 'org-1' },
    identifier: { value: 'ID1' },
    name: { value: 'Org One' },
    homepage: { value: 'https://org' },
    logo: { value: 'https://rdf/host/mylogo.png' },
  },
];
const orgServiceRows: Row[] = [
  {
    organization: { value: 'org-1' },
    service: { value: 'svc-1' },
    serviceTitle: { value: 'Svc One' },
  },
];
const conceptRows: Row[] = [
  {
    subject: { value: 'c-1' },
    prefLabel: { value: 'Concept' },
    exactMatch: { value: 'em' },
    service: { value: 'svc-1' },
    serviceTitle: { value: 'Svc One' },
  },
];
const ruleRows: Row[] = [
  {
    serviceTitle: { value: 'Svc One' },
    ruleTitle: { value: 'Rule A' },
    validFrom: { value: '2026' },
    confidence: { value: 'high' },
    description: { value: 'rd' },
  },
];

/** Route a SPARQL POST to the right result set by inspecting the query body. */
function routePost(query: string) {
  if (query.includes('cv:PublicOrganisation')) return Promise.resolve(results(orgRows));
  if (query.includes('cv:hasCompetentAuthority')) return Promise.resolve(results(orgServiceRows));
  if (query.includes('skos:exactMatch')) return Promise.resolve(results(conceptRows));
  if (query.includes('cpsv:Rule')) return Promise.resolve(results(ruleRows));
  return Promise.resolve(results(serviceRows)); // fetchServices
}

const assetsResponse = {
  data: [{ assetName: 'mylogo.png', versions: [{ url: 'https://cdn/mylogo.png' }] }],
};

let getRegelcatalogusData: Mod['getRegelcatalogusData'];
beforeEach(() => {
  jest.clearAllMocks();
  ({ getRegelcatalogusData } = freshModule());
});

describe('getRegelcatalogusData', () => {
  it('composes services, organizations, concepts and rules from the queries', async () => {
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockResolvedValue(assetsResponse);

    const data = await getRegelcatalogusData();

    expect(data.services).toEqual([{ uri: 'svc-1', title: 'Svc One', description: 'desc' }]);
    expect(data.concepts[0]).toMatchObject({
      uri: 'c-1',
      prefLabel: 'Concept',
      serviceUri: 'svc-1',
    });
    expect(data.rules[0]).toMatchObject({
      ruleTitle: 'Rule A',
      validFrom: '2026',
      confidence: 'high',
    });
  });

  it('joins each organization with its services and resolves its logo asset', async () => {
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockResolvedValue(assetsResponse);

    const { organizations } = await getRegelcatalogusData();

    expect(organizations[0]).toMatchObject({
      uri: 'org-1',
      name: 'Org One',
      logo: 'https://cdn/mylogo.png', // filename mylogo.png resolved via asset map
      services: [{ uri: 'svc-1', title: 'Svc One' }],
    });
  });

  it('leaves the logo null when the assets lookup fails (but still returns data)', async () => {
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockRejectedValue(new Error('assets down'));

    const { organizations, services } = await getRegelcatalogusData();

    expect(organizations[0].logo).toBeNull();
    expect(services).toHaveLength(1); // composition still succeeds
  });

  it('maps missing optional bindings to empty strings / nulls', async () => {
    mockAxios.post.mockImplementation((_url, query: string) => {
      if (query.includes('cv:PublicOrganisation'))
        return Promise.resolve(
          results([
            {
              organization: { value: 'org-2' },
              identifier: { value: 'ID2' },
              name: { value: 'Org Two' },
            },
          ])
        );
      if (query.includes('cv:hasCompetentAuthority')) return Promise.resolve(results([]));
      if (query.includes('skos:exactMatch'))
        return Promise.resolve(
          results([{ subject: { value: 'c-2' }, exactMatch: { value: 'em2' } }])
        );
      if (query.includes('cpsv:Rule'))
        return Promise.resolve(
          results([{ serviceTitle: { value: 'Svc' }, ruleTitle: { value: 'R' } }])
        );
      return Promise.resolve(results([{ service: { value: 'svc-2' } }]));
    });
    mockAxios.get.mockResolvedValue({ data: [] });

    const data = await getRegelcatalogusData();

    expect(data.services[0]).toMatchObject({ uri: 'svc-2', title: '', description: '' });
    expect(data.organizations[0]).toMatchObject({ homepage: null, logo: null, services: [] });
    expect(data.concepts[0]).toMatchObject({ prefLabel: '', serviceUri: '', serviceTitle: '' });
    expect(data.rules[0]).toMatchObject({ validFrom: null, confidence: null, description: null });
  });

  it('serves from cache within the TTL (queries run once)', async () => {
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockResolvedValue(assetsResponse);

    await getRegelcatalogusData();
    await getRegelcatalogusData();

    expect(mockAxios.post).toHaveBeenCalledTimes(5); // 5 queries, not 10
  });

  it('returns empty slices when the queries fail on a cold cache', async () => {
    mockAxios.post.mockRejectedValue(new Error('sparql down'));
    mockAxios.get.mockResolvedValue(assetsResponse);

    await expect(getRegelcatalogusData()).resolves.toEqual({
      services: [],
      organizations: [],
      concepts: [],
      rules: [],
    });
  });

  it('bypasses the cache and re-runs the queries when forceRefresh is true', async () => {
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockResolvedValue(assetsResponse);

    await getRegelcatalogusData(); // populate cache — 5 queries
    await getRegelcatalogusData(true); // force — 5 more, despite fresh cache

    expect(mockAxios.post).toHaveBeenCalledTimes(10);
  });

  it('exposes cache freshness via getRegelcatalogusCacheInfo', async () => {
    const mod = freshModule();
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockResolvedValue(assetsResponse);

    expect(mod.getRegelcatalogusCacheInfo()).toEqual({
      cached: false,
      fetchedAt: null,
      ageMs: null,
    });

    await mod.getRegelcatalogusData();
    const info = mod.getRegelcatalogusCacheInfo();
    expect(info.cached).toBe(true);
    expect(typeof info.fetchedAt).toBe('string');
    expect(info.ageMs).toBeGreaterThanOrEqual(0);
  });

  it('serves stale cache when a later refresh fails', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    mockAxios.post.mockImplementation((_url, query: string) => routePost(query));
    mockAxios.get.mockResolvedValue(assetsResponse);
    await getRegelcatalogusData(); // cache at t=1000

    nowSpy.mockReturnValue(1_000 + 5 * 60 * 1000 + 1); // past TTL
    mockAxios.post.mockRejectedValue(new Error('sparql down'));
    const data = await getRegelcatalogusData();

    expect(data.services).toHaveLength(1); // stale served
    nowSpy.mockRestore();
  });
});
