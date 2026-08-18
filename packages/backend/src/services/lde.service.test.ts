/**
 * Unit tests for lde.service — proxies LDE's public process-bundle list and
 * its published-DMN list, filters to publicly-visible bundles, maps to the
 * PublicProcess shape, and caches for 5 minutes. axios is mocked; the module
 * is re-required per test to reset its module-level cache.
 */

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
const mockConfig = {
  lde: { apiUrl: 'https://lde.test/v1' },
  public: { showWipProcesses: false },
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

const activeCaseworkerBundle = {
  id: 'b1',
  bpmnProcessId: 'zorgtoeslag-process',
  name: 'Zorgtoeslag',
  description: 'Aanvraag zorgtoeslag',
  processRole: 'main',
  status: 'active',
  boardOwner: 'caseworker',
  deployedAt: '2026-06-01T00:00:00.000Z',
  operatonUrl: 'https://operaton.test',
  operatonDeploymentId: 'dep-1',
  linkedDmnTemplates: ['dmn-1'],
  deployedForms: [{ id: 'f1', name: 'Aanvraagformulier' }],
  deployedDocuments: [{ id: 'd1', name: 'Beschikking' }],
  subprocesses: [],
};
const activeUntaggedBundle = {
  ...activeCaseworkerBundle,
  id: 'b2',
  bpmnProcessId: 'untagged',
  boardOwner: undefined,
};
const activeInfraBundle = {
  ...activeCaseworkerBundle,
  id: 'b3',
  bpmnProcessId: 'infra-x',
  boardOwner: 'infra-board',
};
const draftBundle = {
  ...activeCaseworkerBundle,
  id: 'b4',
  bpmnProcessId: 'draft-x',
  status: 'draft',
};
const wipCaseworkerBundle = {
  ...activeCaseworkerBundle,
  id: 'b5',
  bpmnProcessId: 'wip-caseworker',
  status: 'wip',
};
const wipInfraBundle = {
  ...activeCaseworkerBundle,
  id: 'b6',
  bpmnProcessId: 'wip-infra',
  status: 'wip',
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
  mockConfig.public.showWipProcesses = false;
  ({ getPublicProcesses, getPublicProcessByKey, getPublicDmnsByService } = freshModule());
});

describe('getPublicProcesses', () => {
  it('fetches, filters to active + caseworker/untagged, and maps fields', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: [activeCaseworkerBundle, activeUntaggedBundle, activeInfraBundle, draftBundle],
      },
    });
    const items = await getPublicProcesses();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.key).sort()).toEqual(['untagged', 'zorgtoeslag-process']);
    expect(items[0]).toMatchObject({
      key: 'zorgtoeslag-process',
      naam: 'Zorgtoeslag',
      beschrijving: 'Aanvraag zorgtoeslag',
      gepubliceerd: '2026-06-01T00:00:00.000Z',
      status: 'active',
    });
    expect(items[0].forms).toEqual([{ id: 'f1', name: 'Aanvraagformulier' }]);
  });

  it('caches for 5 minutes', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeCaseworkerBundle] } });
    await getPublicProcesses();
    await getPublicProcesses();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh bypasses the cache', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeCaseworkerBundle] } });
    await getPublicProcesses();
    await getPublicProcesses(true);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });

  it('returns stale cache on fetch failure, or empty array if never cached', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('down'));
    expect(await getPublicProcesses()).toEqual([]);

    mockAxios.get.mockResolvedValueOnce({
      data: { success: true, data: [activeCaseworkerBundle] },
    });
    await getPublicProcesses();
    mockAxios.get.mockRejectedValueOnce(new Error('down again'));
    const stale = await getPublicProcesses(true);
    expect(stale).toHaveLength(1);
  });

  it('excludes wip bundles by default (config.public.showWipProcesses = false)', async () => {
    mockAxios.get.mockResolvedValue({
      data: { success: true, data: [activeCaseworkerBundle, wipCaseworkerBundle] },
    });
    const items = await getPublicProcesses();
    expect(items.map((i) => i.key)).toEqual(['zorgtoeslag-process']);
  });

  it('includes wip bundles when config.public.showWipProcesses is true, still gated on board', async () => {
    mockConfig.public.showWipProcesses = true;
    ({ getPublicProcesses } = freshModule());
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: [activeCaseworkerBundle, wipCaseworkerBundle, wipInfraBundle, draftBundle],
      },
    });
    const items = await getPublicProcesses();
    // wip-caseworker included (wip + caseworker board); wip-infra still excluded
    // (wrong board, regardless of status); draft still excluded (neither active nor wip).
    expect(items.map((i) => i.key).sort()).toEqual(['wip-caseworker', 'zorgtoeslag-process']);
  });
});

describe('getPublicProcessByKey', () => {
  it('finds a publicly-visible bundle by its bpmnProcessId', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeCaseworkerBundle] } });
    const item = await getPublicProcessByKey('zorgtoeslag-process');
    expect(item?.naam).toBe('Zorgtoeslag');
  });

  it('returns null when not found or not publicly visible', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeInfraBundle] } });
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
