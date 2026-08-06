/**
 * Unit tests for lde.service — proxies LDE's public process-bundle list,
 * filters to publicly-visible bundles, maps to the PublicProcess shape,
 * and caches for 5 minutes. axios is mocked; the module is re-required per
 * test to reset its module-level cache.
 */

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@utils/config', () => ({
  config: { lde: { apiUrl: 'https://lde.test/v1' } },
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

let getPublicProcesses: Mod['getPublicProcesses'];
let getPublicProcessByKey: Mod['getPublicProcessByKey'];
beforeEach(() => {
  jest.clearAllMocks();
  ({ getPublicProcesses, getPublicProcessByKey } = freshModule());
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
