/**
 * Unit tests for lde.service — proxies LDE's public process-bundle list and
 * its published-DMN list, filters to publicly-visible bundles, maps to the
 * PublicProcess shape, and caches for 5 minutes. axios is mocked; the module
 * is re-required per test to reset its module-level cache.
 */

// This file has no top-level import, so TypeScript would otherwise treat it as
// a global script and hoist every top-level declaration below into the global
// scope — where `mockAxios`, `Mod`, `freshModule` and friends collide with the
// identically-named declarations in sibling test files. `export {}` makes it a
// module and scopes them to this file.
export {};

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
const mockConfig = {
  lde: { apiUrl: 'https://lde.test/v1' },
  public: { processBoards: ['caseworker'] },
};
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@services/regelcatalogus.service', () => ({
  SPARQL_ENDPOINT: 'https://graph.test/sparql',
}));

type Mod = typeof import('./lde.service');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./lde.service');
  });
  return mod;
}

// Status vocabulary mirrors the LDE database constraint: only 'example',
// 'wip' and 'e2e' are values it can actually hold — never 'active'. Visibility
// no longer depends on this value at all (see #111); it is varied across
// these fixtures specifically to prove that.
const exampleCaseworkerBundle = {
  id: 'b1',
  bpmnProcessId: 'zorgtoeslag-process',
  name: 'Zorgtoeslag',
  description: 'Aanvraag zorgtoeslag',
  processRole: 'main',
  status: 'example',
  boardOwner: 'caseworker',
  deployedAt: '2026-06-01T00:00:00.000Z',
  operatonUrl: 'https://operaton.test',
  operatonDeploymentId: 'dep-1',
  linkedDmnTemplates: ['dmn-1'],
  deployedForms: [{ id: 'f1', name: 'Aanvraagformulier' }],
  deployedDocuments: [{ id: 'd1', name: 'Beschikking' }],
  subprocesses: [],
};
const wipUntaggedBundle = {
  ...exampleCaseworkerBundle,
  id: 'b2',
  bpmnProcessId: 'untagged',
  status: 'wip',
  boardOwner: undefined,
};
const e2eInfraBundle = {
  ...exampleCaseworkerBundle,
  id: 'b3',
  bpmnProcessId: 'infra-x',
  status: 'e2e',
  boardOwner: 'infra-board',
};

const digitalTwinDmn = {
  id: 'https://regels.overheid.nl/services/digital-twin/dmn',
  identifier: '_bad36e9e-ac9d-4d78-b0be-2f1c58cbf3c5',
  title: 'HvA_full_dmn_export-patched.dmn',
  service: 'https://regels.overheid.nl/services/digital-twin',
  serviceTitle: 'Digital Twin Inkomensregelingen',
  xmlUrl: '/v1/dmns/_bad36e9e-ac9d-4d78-b0be-2f1c58cbf3c5/xml',
};
const zorgtoeslagDmn = {
  id: 'https://regels.overheid.nl/services/zorgtoeslag-lvnsgb/dmn',
  identifier: 'zorgtoeslag_resultaat',
  title: 'resultaat_zorgtoeslag_operaton_compat.dmn',
  service: 'https://regels.overheid.nl/services/zorgtoeslag-lvnsgb',
  serviceTitle: 'Zorgtoeslag',
  xmlUrl: '/v1/dmns/zorgtoeslag_resultaat/xml',
};

let getPublicProcesses: Mod['getPublicProcesses'];
let getPublicProcessByKey: Mod['getPublicProcessByKey'];
let getPublicDmnsByService: Mod['getPublicDmnsByService'];
beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.public.processBoards = ['caseworker'];
  ({ getPublicProcesses, getPublicProcessByKey, getPublicDmnsByService } = freshModule());
});

describe('getPublicProcesses', () => {
  it('fetches, filters by board (not status), and maps fields', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: [exampleCaseworkerBundle, wipUntaggedBundle, e2eInfraBundle],
      },
    });
    const items = await getPublicProcesses();
    // caseworker + untagged are visible; infra-board is not in the default
    // allowlist — regardless of any of the three's status label.
    expect(items.map((i) => i.key).sort()).toEqual(['untagged', 'zorgtoeslag-process']);
    expect(items[0]).toMatchObject({
      key: 'zorgtoeslag-process',
      naam: 'Zorgtoeslag',
      beschrijving: 'Aanvraag zorgtoeslag',
      gepubliceerd: '2026-06-01T00:00:00.000Z',
      status: 'example',
    });
    expect(items[0].forms).toEqual([{ id: 'f1', name: 'Aanvraagformulier' }]);
  });

  it('caches for 5 minutes', async () => {
    mockAxios.get.mockResolvedValue({
      data: { success: true, data: [exampleCaseworkerBundle] },
    });
    await getPublicProcesses();
    await getPublicProcesses();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh bypasses the cache', async () => {
    mockAxios.get.mockResolvedValue({
      data: { success: true, data: [exampleCaseworkerBundle] },
    });
    await getPublicProcesses();
    await getPublicProcesses(true);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });

  it('returns stale cache on fetch failure, or empty array if never cached', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('down'));
    expect(await getPublicProcesses()).toEqual([]);

    mockAxios.get.mockResolvedValueOnce({
      data: { success: true, data: [exampleCaseworkerBundle] },
    });
    await getPublicProcesses();
    mockAxios.get.mockRejectedValueOnce(new Error('down again'));
    const stale = await getPublicProcesses(true);
    expect(stale).toHaveLength(1);
  });

  it.each(['example', 'wip', 'e2e'])(
    "is visible on a caseworker board whatever its status label ('%s')",
    async (status) => {
      mockAxios.get.mockResolvedValue({
        data: { success: true, data: [{ ...exampleCaseworkerBundle, status }] },
      });
      const items = await getPublicProcesses();
      // This is the defect fixed by #111: status used to gate visibility
      // (requiring 'active', a value the source database cannot produce) and
      // now plays no part in it at all.
      expect(items.map((i) => i.key)).toEqual(['zorgtoeslag-process']);
    }
  );

  it('hides a bundle whose board is not in the allowlist, regardless of status', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [e2eInfraBundle] } });
    expect(await getPublicProcesses()).toEqual([]);
  });

  it('keeps untagged bundles visible regardless of status', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [wipUntaggedBundle] } });
    const items = await getPublicProcesses();
    expect(items.map((i) => i.key)).toEqual(['untagged']);
  });

  it('includes a board once it is added to config.public.processBoards', async () => {
    mockConfig.public.processBoards = ['caseworker', 'infra-board'];
    ({ getPublicProcesses } = freshModule());
    mockAxios.get.mockResolvedValue({
      data: { success: true, data: [exampleCaseworkerBundle, e2eInfraBundle] },
    });
    const items = await getPublicProcesses();
    expect(items.map((i) => i.key).sort()).toEqual(['infra-x', 'zorgtoeslag-process']);
  });
});

describe('getPublicProcessByKey', () => {
  it('finds a publicly-visible bundle by its bpmnProcessId', async () => {
    mockAxios.get.mockResolvedValue({
      data: { success: true, data: [exampleCaseworkerBundle] },
    });
    const item = await getPublicProcessByKey('zorgtoeslag-process');
    expect(item?.naam).toBe('Zorgtoeslag');
  });

  it('returns null when not found or not publicly visible', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [e2eInfraBundle] } });
    expect(await getPublicProcessByKey('infra-x')).toBeNull();
    expect(await getPublicProcessByKey('nope')).toBeNull();
  });
});

describe('getPublicDmnsByService', () => {
  function mockDmns(dmns: unknown[]) {
    mockAxios.get.mockResolvedValue({
      data: { success: true, data: { total: dmns.length, dmns } },
    });
  }

  it('queries LDE with the RONL SPARQL endpoint', async () => {
    mockDmns([]);
    await getPublicDmnsByService();
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://lde.test/v1/dmns',
      expect.objectContaining({ params: { endpoint: 'https://graph.test/sparql' } })
    );
  });

  it('groups DMNs by their service URI', async () => {
    mockDmns([digitalTwinDmn, zorgtoeslagDmn]);
    const byService = await getPublicDmnsByService();
    expect([...byService.keys()].sort()).toEqual([
      'https://regels.overheid.nl/services/digital-twin',
      'https://regels.overheid.nl/services/zorgtoeslag-lvnsgb',
    ]);
    expect(byService.get('https://regels.overheid.nl/services/digital-twin')).toEqual([
      {
        title: 'HvA_full_dmn_export-patched.dmn',
        xmlUrl: 'https://lde.test/v1/dmns/_bad36e9e-ac9d-4d78-b0be-2f1c58cbf3c5/xml',
      },
    ]);
  });

  it('keeps every DMN when one service publishes more than one', async () => {
    mockDmns([digitalTwinDmn, { ...digitalTwinDmn, identifier: 'second', title: 'second.dmn' }]);
    const byService = await getPublicDmnsByService();
    expect(byService.get('https://regels.overheid.nl/services/digital-twin')).toHaveLength(2);
  });

  it('resolves the relative xmlUrl against the LDE origin without doubling /v1', async () => {
    mockDmns([digitalTwinDmn]);
    const byService = await getPublicDmnsByService();
    expect(byService.get(digitalTwinDmn.service)?.[0].xmlUrl).toBe(
      'https://lde.test/v1/dmns/_bad36e9e-ac9d-4d78-b0be-2f1c58cbf3c5/xml'
    );
  });

  it('skips DMNs without a service URI or without an xmlUrl', async () => {
    mockDmns([
      { ...digitalTwinDmn, service: undefined },
      { ...zorgtoeslagDmn, xmlUrl: undefined },
    ]);
    expect((await getPublicDmnsByService()).size).toBe(0);
  });

  it('caches for 5 minutes', async () => {
    mockDmns([digitalTwinDmn]);
    await getPublicDmnsByService();
    await getPublicDmnsByService();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('returns an empty map on fetch failure so the catalogue still renders', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('down'));
    expect((await getPublicDmnsByService()).size).toBe(0);
  });
});
