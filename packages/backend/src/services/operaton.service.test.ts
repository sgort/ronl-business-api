/**
 * Unit tests for OperatonService — core process / task / decision / health
 * methods (part A). A mocked axios client stands in for the Operaton REST API;
 * we assert the request (verb + URL + body/params), the mapped response, tenant
 * injection, and error handling.
 *
 * The archive/list + BPMN/form methods (part B) are covered lower in this file.
 */

const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
};

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockClient),
    isAxiosError: (e: unknown) => !!(e && (e as { isAxiosError?: boolean }).isAxiosError),
  },
}));
jest.mock('@utils/config', () => ({
  config: {
    operaton: {
      baseUrl: 'http://operaton',
      timeout: 1000,
      username: undefined,
      password: undefined,
    },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { OperatonService } from './operaton.service';
import type { OperatonVariable, ProcessStartRequest } from '@ronl/shared';

let svc: OperatonService;
beforeEach(() => {
  jest.clearAllMocks();
  svc = new OperatonService();
});

describe('passthrough queries', () => {
  it('listProcessInstances GETs /process-instance with params', async () => {
    mockClient.get.mockResolvedValue({ data: [{ id: 'p1' }] });
    await expect(svc.listProcessInstances({ businessKey: 'b' })).resolves.toEqual([{ id: 'p1' }]);
    expect(mockClient.get).toHaveBeenCalledWith('/process-instance', {
      params: { businessKey: 'b' },
    });
  });

  it('queryProcessHistory POSTs the body to /history/process-instance', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'h' }] });
    await expect(svc.queryProcessHistory({ finished: true })).resolves.toEqual([{ id: 'h' }]);
    expect(mockClient.post).toHaveBeenCalledWith('/history/process-instance', { finished: true });
  });

  it('getDecisionDefinition GETs by key', async () => {
    mockClient.get.mockResolvedValue({ data: { id: 'd' } });
    await svc.getDecisionDefinition('MyDec');
    expect(mockClient.get).toHaveBeenCalledWith('/decision-definition/key/MyDec');
  });

  it('getProcessInstance GETs and returns data; rethrows on error', async () => {
    mockClient.get.mockResolvedValueOnce({ data: { id: 'pi' } });
    await expect(svc.getProcessInstance('pi')).resolves.toEqual({ id: 'pi' });
    expect(mockClient.get).toHaveBeenCalledWith('/process-instance/pi');

    mockClient.get.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.getProcessInstance('pi')).rejects.toThrow('boom');
  });

  it('getProcessVariables GETs the variables sub-resource', async () => {
    mockClient.get.mockResolvedValue({ data: { x: { value: 1, type: 'Integer' } } });
    await svc.getProcessVariables('pi');
    expect(mockClient.get).toHaveBeenCalledWith('/process-instance/pi/variables');
  });

  it('getTask GETs /task/:id', async () => {
    mockClient.get.mockResolvedValue({ data: { id: 't1' } });
    await expect(svc.getTask('t1')).resolves.toEqual({ id: 't1' });
    expect(mockClient.get).toHaveBeenCalledWith('/task/t1');
  });
});

describe('resolveDeployedTenant', () => {
  it('returns the tenantId of the deployed definition', async () => {
    mockClient.get.mockResolvedValue({ data: [{ tenantId: 'toeslagen' }] });
    // @ts-expect-error -- private method, exercised directly for this unit test
    await expect(svc.resolveDeployedTenant('AwbZorgtoeslagProcess')).resolves.toBe('toeslagen');
    expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
      params: { key: 'AwbZorgtoeslagProcess', latestVersion: true },
    });
  });

  it('prefers a tenant-scoped row over a coexisting untenanted legacy row for the same key', async () => {
    mockClient.get.mockResolvedValue({
      data: [{ tenantId: null }, { tenantId: 'flevoland' }],
    });
    // @ts-expect-error -- private method
    await expect(svc.resolveDeployedTenant('AwbShellProcess')).resolves.toBe('flevoland');
  });

  it('returns null when the key is not deployed at all', async () => {
    mockClient.get.mockResolvedValue({ data: [] });
    // @ts-expect-error -- private method
    await expect(svc.resolveDeployedTenant('NotDeployed')).resolves.toBeNull();
  });

  it('returns null on lookup failure rather than throwing', async () => {
    mockClient.get.mockRejectedValue(new Error('network down'));
    // @ts-expect-error -- private method
    await expect(svc.resolveDeployedTenant('AwbShellProcess')).resolves.toBeNull();
  });
});

describe('startProcess', () => {
  const req = () => ({ businessKey: 'bk', variables: {} }) as unknown as ProcessStartRequest;

  it('injects municipality from tenantId when absent and posts to the tenant-scoped start endpoint', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pi-1' } });
    const request = req();

    const res = await svc.startProcess('MyProc', request, 'flevoland');

    expect(res).toEqual({ id: 'pi-1' });
    expect(mockClient.post).toHaveBeenCalledTimes(1);
    expect(mockClient.post).toHaveBeenCalledWith(
      '/process-definition/key/MyProc/tenant-id/flevoland/start',
      request
    );
    expect(request.variables.municipality).toEqual({ value: 'flevoland', type: 'String' });
  });

  it('falls back to the untenanted start endpoint when no tenant-scoped definition exists', async () => {
    mockClient.post
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { message: 'No matching process definition with key: MyProc' } },
      })
      .mockResolvedValueOnce({ data: { id: 'pi-3' } });

    const res = await svc.startProcess('MyProc', req(), 'flevoland');

    expect(res).toEqual({ id: 'pi-3' });
    expect(mockClient.post).toHaveBeenCalledTimes(2);
    expect(mockClient.post).toHaveBeenNthCalledWith(
      1,
      '/process-definition/key/MyProc/tenant-id/flevoland/start',
      expect.anything()
    );
    expect(mockClient.post).toHaveBeenNthCalledWith(
      2,
      '/process-definition/key/MyProc/start',
      expect.anything()
    );
  });

  it('keeps an explicitly provided municipality variable', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pi-2' } });
    const request = {
      variables: { municipality: { value: 'utrecht', type: 'String' } },
    } as unknown as ProcessStartRequest;

    await svc.startProcess('P', request, 'flevoland');

    expect(request.variables.municipality).toEqual({ value: 'utrecht', type: 'String' });
  });

  it('rethrows on failure', async () => {
    mockClient.post.mockRejectedValue(new Error('start failed'));
    await expect(svc.startProcess('P', req(), 't')).rejects.toThrow('start failed');
  });

  it('translates a missing-deployment 404 into a friendly Dutch message', async () => {
    mockClient.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          type: 'RestException',
          message: 'No matching process definition with key: RipR21Process and no tenant-id',
        },
      },
    });
    await expect(svc.startProcess('RipR21Process', req(), 'flevoland')).rejects.toThrow(
      /RipR21Process' is niet gevonden op deze Operaton-omgeving/
    );
  });

  it("scopes the start call to the process's actual deployed tenant, not the citizen's own", async () => {
    mockClient.get.mockResolvedValue({ data: [{ tenantId: 'toeslagen' }] });
    mockClient.post.mockResolvedValue({ data: { id: 'pi1' } });

    await svc.startProcess('AwbZorgtoeslagProcess', req(), 'unive');

    expect(mockClient.post).toHaveBeenCalledWith(
      '/process-definition/key/AwbZorgtoeslagProcess/tenant-id/toeslagen/start',
      expect.anything()
    );
  });

  it("falls back to the citizen's own tenant when the deployed tenant cannot be resolved", async () => {
    mockClient.get.mockRejectedValue(new Error('lookup failed'));
    mockClient.post.mockResolvedValue({ data: { id: 'pi1' } });

    await svc.startProcess('SomeProcess', req(), 'flevoland');

    expect(mockClient.post).toHaveBeenCalledWith(
      '/process-definition/key/SomeProcess/tenant-id/flevoland/start',
      expect.anything()
    );
  });
});

describe('getRipPhase1ActiveList / getRipPhase1CompletedList', () => {
  it('getRipPhase1ActiveList filters by the RipR21Process key', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await svc.getRipPhase1ActiveList('flevoland');
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ processDefinitionKey: 'RipR21Process' })
    );
  });

  it('getRipPhase1CompletedList filters by the RipR21Process key', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await svc.getRipPhase1CompletedList('flevoland');
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ processDefinitionKey: 'RipR21Process' })
    );
  });
});

describe('getDeployedProcessKeys', () => {
  it('queries with keysIn + latestVersion and returns only the deployed subset, in input order', async () => {
    mockClient.get.mockResolvedValue({
      data: [{ key: 'RipR21Process' }, { key: 'SomeOtherProcess' }],
    });

    const result = await svc.getDeployedProcessKeys(['RipR21Process', 'NotDeployedYet']);

    expect(result).toEqual(['RipR21Process']);
    expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
      params: { keysIn: 'RipR21Process,NotDeployedYet', latestVersion: true },
    });
  });

  it('returns an empty array when none of the requested keys are deployed', async () => {
    mockClient.get.mockResolvedValue({ data: [] });

    const result = await svc.getDeployedProcessKeys(['NotDeployedYet']);

    expect(result).toEqual([]);
  });

  it('rethrows on failure', async () => {
    mockClient.get.mockRejectedValue(new Error('boom'));

    await expect(svc.getDeployedProcessKeys(['RipR21Process'])).rejects.toThrow('boom');
  });

  it('adds tenantIdIn to the query when a tenantId is given', async () => {
    mockClient.get.mockResolvedValue({ data: [{ key: 'RipR21Process' }] });

    await svc.getDeployedProcessKeys(['RipR21Process'], 'flevoland');

    expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
      params: { keysIn: 'RipR21Process', latestVersion: true, tenantIdIn: 'flevoland' },
    });
  });
});

describe('getPhaseInstanceCounts', () => {
  it('queries active + completed counts per key and maps the result', async () => {
    mockClient.get.mockImplementation(
      (url: string, _config: { params: Record<string, unknown> }) => {
        if (url === '/process-instance/count') {
          return Promise.resolve({ data: { count: 3 } });
        }
        if (url === '/history/process-instance/count') {
          return Promise.resolve({ data: { count: 7 } });
        }
        throw new Error(`unexpected url ${url}`);
      }
    );

    const result = await svc.getPhaseInstanceCounts(['RipR21Process']);

    expect(result).toEqual({ RipR21Process: { wip: 3, gereed: 7 } });
    expect(mockClient.get).toHaveBeenCalledWith('/process-instance/count', {
      params: { processDefinitionKey: 'RipR21Process' },
    });
    expect(mockClient.get).toHaveBeenCalledWith('/history/process-instance/count', {
      params: { processDefinitionKey: 'RipR21Process', finished: true },
    });
  });

  it('queries multiple keys in parallel', async () => {
    mockClient.get.mockImplementation(
      (_url: string, config: { params: { processDefinitionKey: string } }) =>
        Promise.resolve({ data: { count: config.params.processDefinitionKey === 'A' ? 1 : 2 } })
    );

    const result = await svc.getPhaseInstanceCounts(['A', 'B']);

    expect(result).toEqual({
      A: { wip: 1, gereed: 1 },
      B: { wip: 2, gereed: 2 },
    });
  });

  it('rethrows on failure', async () => {
    mockClient.get.mockRejectedValue(new Error('boom'));

    await expect(svc.getPhaseInstanceCounts(['RipR21Process'])).rejects.toThrow('boom');
  });

  it('adds tenantIdIn to both count queries when a tenantId is given', async () => {
    mockClient.get.mockResolvedValue({ data: { count: 1 } });

    await svc.getPhaseInstanceCounts(['RipR21Process'], 'flevoland');

    expect(mockClient.get).toHaveBeenCalledWith('/process-instance/count', {
      params: { processDefinitionKey: 'RipR21Process', tenantIdIn: 'flevoland' },
    });
    expect(mockClient.get).toHaveBeenCalledWith('/history/process-instance/count', {
      params: { processDefinitionKey: 'RipR21Process', finished: true, tenantIdIn: 'flevoland' },
    });
  });
});

describe('getActivityHistory', () => {
  it('queries oldest-first and maps the activity items', async () => {
    mockClient.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          activityId: 'act',
          activityName: 'Step',
          activityType: 'serviceTask',
          assignee: null,
          startTime: 't0',
          endTime: 't1',
          durationInMillis: 5,
          canceled: false,
        },
      ],
    });

    const res = await svc.getActivityHistory('pi');

    expect(res[0]).toMatchObject({ id: 'a1', activityType: 'serviceTask', durationInMillis: 5 });
    expect(mockClient.get).toHaveBeenCalledWith('/history/activity-instance', {
      params: { processInstanceId: 'pi', sortBy: 'startTime', sortOrder: 'asc', maxResults: 500 },
    });
  });
});

describe('deleteProcessInstance', () => {
  it('uses the default cancellation reason', async () => {
    mockClient.delete.mockResolvedValue({});
    await svc.deleteProcessInstance('pi');
    expect(mockClient.delete).toHaveBeenCalledWith('/process-instance/pi', {
      params: { skipCustomListeners: false, skipIoMappings: false },
      data: { reason: 'Cancelled by user' },
    });
  });

  it('passes a custom reason through', async () => {
    mockClient.delete.mockResolvedValue({});
    await svc.deleteProcessInstance('pi', 'obsolete');
    expect(mockClient.delete).toHaveBeenLastCalledWith(
      '/process-instance/pi',
      expect.objectContaining({ data: { reason: 'obsolete' } })
    );
  });
});

describe('getProcessHistory', () => {
  it('applies the municipality filter for caseworkers', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await svc.getProcessHistory('app-1', 'flevoland', undefined, true);
    expect(mockClient.post).toHaveBeenCalledWith('/history/process-instance', {
      variables: [
        { name: 'applicantId', operator: 'eq', value: 'app-1' },
        { name: 'municipality', operator: 'eq', value: 'flevoland' },
      ],
      sorting: [{ sortBy: 'startTime', sortOrder: 'desc' }],
    });
  });

  it('filters only by applicantId for citizens', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await svc.getProcessHistory('app-1', 'flevoland');
    expect(mockClient.post.mock.calls[0][1].variables).toEqual([
      { name: 'applicantId', operator: 'eq', value: 'app-1' },
    ]);
  });
});

describe('getHistoricVariables', () => {
  it('flattens [{name,value}] into a plain object', async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { name: 'a', value: 1 },
        { name: 'b', value: 'x' },
      ],
    });
    await expect(svc.getHistoricVariables('pi')).resolves.toEqual({ a: 1, b: 'x' });
    expect(mockClient.get).toHaveBeenCalledWith('/history/variable-instance', {
      params: { processInstanceId: 'pi', deserializeValues: true },
    });
  });
});

describe('getTaskVariables', () => {
  it('resolves the task, fetches its process variables, and flattens .value', async () => {
    mockClient.get
      .mockResolvedValueOnce({ data: { id: 't1', processInstanceId: 'pi-9' } }) // getTask
      .mockResolvedValueOnce({
        data: { amount: { value: 42, type: 'Integer' }, name: { value: 'Bob', type: 'String' } },
      }); // getProcessVariables

    await expect(svc.getTaskVariables('t1')).resolves.toEqual({ amount: 42, name: 'Bob' });
    expect(mockClient.get).toHaveBeenNthCalledWith(1, '/task/t1');
    expect(mockClient.get).toHaveBeenNthCalledWith(2, '/process-instance/pi-9/variables');
  });
});

describe('completeTask / claimTask', () => {
  it('completeTask posts the request to /complete', async () => {
    mockClient.post.mockResolvedValue({});
    const request = { variables: { ok: { value: true, type: 'Boolean' } as OperatonVariable } };
    await svc.completeTask('t1', request);
    expect(mockClient.post).toHaveBeenCalledWith('/task/t1/complete', request);
  });

  it('claimTask posts the userId to /claim', async () => {
    mockClient.post.mockResolvedValue({});
    await svc.claimTask('t1', 'user-9');
    expect(mockClient.post).toHaveBeenCalledWith('/task/t1/claim', { userId: 'user-9' });
  });
});

describe('evaluateDecision', () => {
  it('injects municipality and returns the decision result', async () => {
    mockClient.post.mockResolvedValue({ data: [{ approved: true }] });
    const res = await svc.evaluateDecision('Dec', {}, 'flevoland');

    expect(res).toEqual([{ approved: true }]);
    expect(mockClient.post).toHaveBeenCalledWith(
      '/decision-definition/key/Dec/evaluate',
      expect.objectContaining({
        variables: expect.objectContaining({
          municipality: { value: 'flevoland', type: 'String' },
        }),
      })
    );
  });

  it('translates the null-hit-policy engine error', async () => {
    mockClient.post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Exception while evaluating decision with key 'null'" } },
    });
    await expect(svc.evaluateDecision('Dec', {}, 't')).rejects.toThrow(/meerdere regels/);
  });

  it('translates a decision-definition RestException', async () => {
    mockClient.post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'bad decision-definition', type: 'RestException' } },
    });
    await expect(svc.evaluateDecision('Dec', {}, 't')).rejects.toThrow(/regelengine/);
  });

  it('surfaces any other engine message verbatim', async () => {
    mockClient.post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Some engine error' } },
    });
    await expect(svc.evaluateDecision('Dec', {}, 't')).rejects.toThrow('Some engine error');
  });

  it('rethrows a non-Operaton error unchanged', async () => {
    mockClient.post.mockRejectedValue(new Error('network'));
    await expect(svc.evaluateDecision('Dec', {}, 't')).rejects.toThrow('network');
  });
});

describe('healthCheck', () => {
  it('returns up with a latency when /version responds', async () => {
    mockClient.get.mockResolvedValue({});
    const res = await svc.healthCheck();
    expect(res.status).toBe('up');
    expect(typeof res.latency).toBe('number');
    expect(mockClient.get).toHaveBeenCalledWith('/version');
  });

  it('returns down with the error message on failure', async () => {
    mockClient.get.mockRejectedValue(new Error('unreachable'));
    await expect(svc.healthCheck()).resolves.toMatchObject({
      status: 'down',
      error: 'unreachable',
    });
  });
});

// ── Part B: archive/list + BPMN/form methods ────────────────────────────────

/** Route GET calls by URL (exact string or regex) for the multi-call methods. */
function routeGet(routes: Array<[string | RegExp, unknown]>) {
  mockClient.get.mockImplementation((url: string) => {
    for (const [pattern, value] of routes) {
      const hit = typeof pattern === 'string' ? url === pattern : pattern.test(url);
      if (hit) return Promise.resolve(value);
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe('getHrOnboardingProfile', () => {
  it('returns flattened historic variables of the most recent completed instance', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'i1' }] });
    mockClient.get.mockResolvedValue({ data: [{ name: 'firstName', value: 'Bob' }] });

    await expect(svc.getHrOnboardingProfile('e1', 'flevoland')).resolves.toEqual({
      firstName: 'Bob',
    });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ processDefinitionKey: 'HrOnboardingProcess', finished: true })
    );
  });

  it('returns null when no completed instance exists', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await expect(svc.getHrOnboardingProfile('e1', 't')).resolves.toBeNull();
  });
});

describe('getHrOnboardingCompletedList', () => {
  it('joins display variables and falls back to em-dash for missing ones', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'i1', startTime: 's', endTime: 'e' }] });
    mockClient.get.mockResolvedValue({
      data: [
        { processInstanceId: 'i1', name: 'employeeId', value: 'E1' },
        { processInstanceId: 'i1', name: 'firstName', value: 'Bob' },
        { processInstanceId: 'i1', name: 'ignored', value: 'x' },
      ],
    });

    const res = await svc.getHrOnboardingCompletedList('flevoland');
    expect(res[0]).toEqual({
      id: 'i1',
      startTime: 's',
      endTime: 'e',
      employeeId: 'E1',
      firstName: 'Bob',
      lastName: '—',
    });
  });

  it('returns [] when there are no instances', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await expect(svc.getHrOnboardingCompletedList('t')).resolves.toEqual([]);
  });
});

describe('getVariableHints', () => {
  it('dedupes by name, defaults a missing type to String, and sorts', async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { name: 'b', type: 'String' },
        { name: 'a', type: 'Integer' },
        { name: 'a', type: 'Integer' },
        { name: 'c' },
      ],
    });
    await expect(svc.getVariableHints('Key')).resolves.toEqual([
      { name: 'a', type: 'Integer' },
      { name: 'b', type: 'String' },
      { name: 'c', type: 'String' },
    ]);
  });
});

describe('getUserTasks', () => {
  it('builds tenant + candidateGroup params and derives the key from a versioned defId', async () => {
    routeGet([['/task', { data: [{ id: 't1', processDefinitionId: 'RipR21Process:3:abc' }] }]]);

    const res = await svc.getUserTasks('u', 'flevoland', ['role-a', 'role-b']);

    expect(res[0]).toMatchObject({ id: 't1', processDefinitionKey: 'RipR21Process' });
    expect(mockClient.get).toHaveBeenCalledWith('/task', {
      params: {
        processVariables: 'municipality_eq_flevoland',
        candidateGroups: 'role-a,role-b',
        includeAssignedTasks: 'true',
      },
    });
  });

  it('looks up the definition key when the id is not versioned', async () => {
    routeGet([
      ['/task', { data: [{ id: 't1', processDefinitionId: 'plainId' }] }],
      ['/process-definition/plainId', { data: { key: 'ResolvedKey' } }],
    ]);
    const res = await svc.getUserTasks();
    expect(res[0].processDefinitionKey).toBe('ResolvedKey');
  });

  it('returns [] when there are no tasks', async () => {
    routeGet([['/task', { data: [] }]]);
    await expect(svc.getUserTasks()).resolves.toEqual([]);
  });
});

describe('getBoardOwner', () => {
  it('parses the boardOwner property and caches the result', async () => {
    mockClient.get.mockResolvedValue({
      data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo" />' },
    });
    await expect(svc.getBoardOwner('K1')).resolves.toBe('rvo');
    await svc.getBoardOwner('K1'); // cached
    expect(mockClient.get).toHaveBeenCalledTimes(1);
  });

  it('matches the property with reversed attribute order', async () => {
    mockClient.get.mockResolvedValue({
      data: { bpmn20Xml: '<camunda:property value="waterschap" name="boardOwner"/>' },
    });
    await expect(svc.getBoardOwner('K9')).resolves.toBe('waterschap');
  });

  it('returns null for untagged BPMN', async () => {
    mockClient.get.mockResolvedValue({ data: { bpmn20Xml: '<process/>' } });
    await expect(svc.getBoardOwner('K2')).resolves.toBeNull();
  });

  it('returns null on lookup failure', async () => {
    mockClient.get.mockRejectedValue(new Error('xml down'));
    await expect(svc.getBoardOwner('K3')).resolves.toBeNull();
  });

  it('returns null for an empty key without hitting the API', async () => {
    await expect(svc.getBoardOwner('')).resolves.toBeNull();
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('tries the tenant-scoped XML lookup first when a tenantId is given', async () => {
    mockClient.get.mockResolvedValue({
      data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo" />' },
    });
    await expect(svc.getBoardOwner('K10', 'flevoland')).resolves.toBe('rvo');
    expect(mockClient.get).toHaveBeenCalledWith(
      '/process-definition/key/K10/tenant-id/flevoland/xml'
    );
  });

  it('falls back to the untenanted XML lookup when the tenant-scoped one reports no matching definition', async () => {
    mockClient.get
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          data: {
            message: 'No matching process definition with key: K11 and tenant-id: flevoland',
          },
        },
      })
      .mockResolvedValueOnce({
        data: { bpmn20Xml: '<camunda:property name="boardOwner" value="waterschap" />' },
      });
    await expect(svc.getBoardOwner('K11', 'flevoland')).resolves.toBe('waterschap');
    expect(mockClient.get).toHaveBeenNthCalledWith(
      1,
      '/process-definition/key/K11/tenant-id/flevoland/xml'
    );
    expect(mockClient.get).toHaveBeenNthCalledWith(2, '/process-definition/key/K11/xml');
  });

  it('caches tenant-scoped and untenanted lookups of the same key separately', async () => {
    mockClient.get.mockResolvedValue({
      data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo" />' },
    });
    await svc.getBoardOwner('K12'); // untenanted, caches under '::K12'
    await svc.getBoardOwner('K12', 'flevoland'); // tenant-scoped, caches under 'flevoland::K12'
    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('getCompletedTasks', () => {
  it('joins businessKey and boardOwner into each historic task', async () => {
    routeGet([
      [
        '/history/task',
        {
          data: [
            {
              id: 'ht1',
              name: 'Review',
              assignee: 'u',
              taskDefinitionKey: 'tdk',
              processDefinitionKey: 'K1',
              processInstanceId: 'pi1',
              startTime: 's',
              endTime: 'e',
              duration: 10,
            },
          ],
        },
      ],
      [
        '/process-definition/key/K1/tenant-id/flevoland/xml',
        { data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo"/>' } },
      ],
    ]);
    mockClient.post.mockResolvedValue({ data: [{ id: 'pi1', businessKey: 'BK-1' }] });

    const res = await svc.getCompletedTasks('flevoland');
    expect(res[0]).toMatchObject({ id: 'ht1', businessKey: 'BK-1', boardOwner: 'rvo' });
  });

  it('returns [] when there are no completed tasks', async () => {
    routeGet([['/history/task', { data: [] }]]);
    await expect(svc.getCompletedTasks('t')).resolves.toEqual([]);
  });
});

describe('deployed forms', () => {
  it('getDeployedStartForm returns the raw form and its content type', async () => {
    mockClient.get.mockResolvedValue({ data: '<form/>', headers: { 'content-type': 'text/html' } });
    await expect(svc.getDeployedStartForm('K')).resolves.toEqual({
      data: '<form/>',
      contentType: 'text/html',
    });
    expect(mockClient.get).toHaveBeenCalledWith('/process-definition/key/K/deployed-start-form', {
      responseType: 'text',
    });
  });

  it('defaults the content type when the header is absent', async () => {
    mockClient.get.mockResolvedValue({ data: '{}', headers: {} });
    await expect(svc.getDeployedStartForm('K')).resolves.toMatchObject({
      contentType: 'application/octet-stream',
    });
  });

  it('getDeployedStartForm tries the tenant-scoped lookup first when a tenantId is given', async () => {
    mockClient.get.mockResolvedValue({ data: '<form/>', headers: { 'content-type': 'text/html' } });
    await svc.getDeployedStartForm('K', 'flevoland');
    expect(mockClient.get).toHaveBeenCalledWith(
      '/process-definition/key/K/tenant-id/flevoland/deployed-start-form',
      { responseType: 'text' }
    );
  });

  it('getDeployedStartForm scopes to the resolved deployed tenant, not the passed-in citizen tenant', async () => {
    mockClient.get
      .mockResolvedValueOnce({ data: [{ tenantId: 'toeslagen' }] }) // resolveDeployedTenant
      .mockResolvedValueOnce({ data: '{}', headers: { 'content-type': 'application/json' } }); // the form itself

    await svc.getDeployedStartForm('AwbZorgtoeslagProcess', 'unive');

    expect(mockClient.get).toHaveBeenNthCalledWith(
      2,
      '/process-definition/key/AwbZorgtoeslagProcess/tenant-id/toeslagen/deployed-start-form',
      { responseType: 'text' }
    );
  });

  it('getDeployedStartForm falls back to the untenanted lookup on a no-matching-definition error', async () => {
    mockClient.get
      .mockResolvedValueOnce({ data: [] }) // resolveDeployedTenant — key not deployed, returns null
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          data: { message: 'No matching process definition with key: K and tenant-id: flevoland' },
        },
      })
      .mockResolvedValueOnce({ data: '{}', headers: { 'content-type': 'application/json' } });
    await svc.getDeployedStartForm('K', 'flevoland');
    expect(mockClient.get).toHaveBeenNthCalledWith(
      2,
      '/process-definition/key/K/tenant-id/flevoland/deployed-start-form',
      { responseType: 'text' }
    );
    expect(mockClient.get).toHaveBeenNthCalledWith(
      3,
      '/process-definition/key/K/deployed-start-form',
      {
        responseType: 'text',
      }
    );
  });

  it('getDeployedTaskForm fetches the task deployed-form', async () => {
    mockClient.get.mockResolvedValue({
      data: '{}',
      headers: { 'content-type': 'application/json' },
    });
    await expect(svc.getDeployedTaskForm('t1')).resolves.toEqual({
      data: '{}',
      contentType: 'application/json',
    });
    expect(mockClient.get).toHaveBeenCalledWith('/task/t1/deployed-form', { responseType: 'text' });
  });
});

describe('getDecisionDocument', () => {
  const setup = (xml: string, resources: unknown) =>
    routeGet([
      [/\/history\/process-instance\/pi1$/, { data: { processDefinitionId: 'pd1' } }],
      ['/process-definition/pd1/xml', { data: { bpmn20Xml: xml } }],
      ['/process-definition/pd1', { data: { deploymentId: 'dep1' } }],
      ['/deployment/dep1/resources', { data: resources }],
      [/\/deployment\/dep1\/resources\/r1\/data$/, { data: '{"template":"x"}' }],
    ]);

  it('resolves and parses the referenced document template', async () => {
    setup('<bpmn ronl:documentRef="doc1" />', [
      { id: 'r1', name: 'doc1.document', deploymentId: 'dep1' },
    ]);
    await expect(svc.getDecisionDocument('pi1')).resolves.toEqual({ template: 'x' });
  });

  it('throws DOCUMENT_NOT_FOUND when there is no ronl:documentRef', async () => {
    setup('<bpmn/>', []);
    await expect(svc.getDecisionDocument('pi1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('throws DOCUMENT_NOT_FOUND when the resource is absent', async () => {
    setup('<bpmn ronl:documentRef="doc1" />', [{ id: 'r9', name: 'other.document' }]);
    await expect(svc.getDecisionDocument('pi1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});

describe('document bundles', () => {
  it('getRipPhase1Documents returns variables plus present templates (null for absent)', async () => {
    routeGet([
      [/\/history\/variable-instance$/, { data: [{ name: 'projectNumber', value: 'P1' }] }],
      [/\/history\/process-instance\/pi1$/, { data: { processDefinitionId: 'pd1' } }],
      ['/process-definition/pd1', { data: { deploymentId: 'dep1' } }],
      ['/deployment/dep1/resources', { data: [{ id: 'r1', name: 'rip-intake-report.document' }] }],
      [/\/deployment\/dep1\/resources\/r1\/data$/, { data: '{"t":"intake"}' }],
    ]);

    const res = await svc.getRipPhase1Documents('pi1');
    expect(res.variables).toEqual({ projectNumber: 'P1' });
    expect(res.intakeReport).toEqual({ t: 'intake' });
    expect(res.psuReport).toBeNull();
    expect(res.pdp).toBeNull();
  });

  it('getCapacityClaimDocuments returns variables plus both templates', async () => {
    routeGet([
      [/\/history\/variable-instance$/, { data: [{ name: 'jobTitle', value: 'Manager' }] }],
      [/\/history\/process-instance\/pi1$/, { data: { processDefinitionId: 'pd1' } }],
      ['/process-definition/pd1', { data: { deploymentId: 'dep1' } }],
      [
        '/deployment/dep1/resources',
        {
          data: [
            { id: 'r1', name: 'board-decision-notification-nl.document' },
            { id: 'r2', name: 'capacity-claim-handover-nl.document' },
          ],
        },
      ],
      [/\/deployment\/dep1\/resources\/r1\/data$/, { data: '{"doc":"board"}' }],
      [/\/deployment\/dep1\/resources\/r2\/data$/, { data: '{"doc":"handover"}' }],
    ]);

    const res = await svc.getCapacityClaimDocuments('pi1');
    expect(res.variables).toEqual({ jobTitle: 'Manager' });
    expect(res.boardDecisionNotification).toEqual({ doc: 'board' });
    expect(res.capacityClaimHandover).toEqual({ doc: 'handover' });
  });
});

describe('archive list builders', () => {
  it('getRipPhase1ActiveList maps project variables with fallbacks', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'i1', startTime: 's' }] });
    mockClient.get.mockResolvedValue({
      data: [
        { processInstanceId: 'i1', name: 'projectNumber', value: 'P1' },
        { processInstanceId: 'i1', name: 'projectName', value: 'Road' },
      ],
    });

    const res = await svc.getRipPhase1ActiveList('flevoland');
    expect(res[0]).toEqual({
      id: 'i1',
      startTime: 's',
      projectNumber: 'P1',
      projectName: 'Road',
      edocsWorkspaceId: '—',
      leadRole: '',
    });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ processDefinitionKey: 'RipR21Process', unfinished: true })
    );
  });

  it('getRipPhase1CompletedList maps completed instances', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'i1', startTime: 's', endTime: 'e' }] });
    mockClient.get.mockResolvedValue({
      data: [{ processInstanceId: 'i1', name: 'projectNumber', value: 'P1' }],
    });

    const res = await svc.getRipPhase1CompletedList('flevoland');
    expect(res[0]).toMatchObject({ id: 'i1', endTime: 'e', projectNumber: 'P1', projectName: '—' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ finished: true })
    );
  });

  it('getCapacityClaimActiveList maps capacity variables', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'i1', startTime: 's' }] });
    mockClient.get.mockResolvedValue({
      data: [{ processInstanceId: 'i1', name: 'jobTitle', value: 'Mgr' }],
    });

    const res = await svc.getCapacityClaimActiveList('flevoland');
    expect(res[0]).toMatchObject({ id: 'i1', jobTitle: 'Mgr', requestType: '—' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({
        processDefinitionKey: 'ManagementCapacityClaimProcess',
        unfinished: true,
      })
    );
  });

  it('getCapacityClaimCompletedList maps completed capacity variables', async () => {
    mockClient.post.mockResolvedValue({ data: [{ id: 'i1', startTime: 's', endTime: 'e' }] });
    mockClient.get.mockResolvedValue({
      data: [{ processInstanceId: 'i1', name: 'jobTitle', value: 'Mgr' }],
    });

    const res = await svc.getCapacityClaimCompletedList('flevoland');
    expect(res[0]).toMatchObject({ id: 'i1', endTime: 'e', jobTitle: 'Mgr', advisoryGroup: '—' });
  });

  it('list builders return [] when there are no instances', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await expect(svc.getRipPhase1ActiveList('t')).resolves.toEqual([]);
    await expect(svc.getCapacityClaimActiveList('t')).resolves.toEqual([]);
  });
});

// ── Error-path branch coverage ────────────────────────────────────────────────

describe('constructor auth branch', () => {
  it('attaches basic auth when username and password are provided', () => {
    const axiosMock = jest.requireMock('axios').default;
    new OperatonService('http://x', 'user', 'pass');
    const createCall = axiosMock.create.mock.calls.at(-1)[0];
    expect(createCall.auth).toEqual({ username: 'user', password: 'pass' });
  });

  it('omits basic auth when credentials are absent', () => {
    const axiosMock = jest.requireMock('axios').default;
    new OperatonService('http://x', undefined, undefined);
    const createCall = axiosMock.create.mock.calls.at(-1)[0];
    expect(createCall.auth).toBeUndefined();
  });
});

describe('error paths — rethrow on upstream failure', () => {
  it('getActivityHistory rethrows', async () => {
    mockClient.get.mockRejectedValue(new Error('act-err'));
    await expect(svc.getActivityHistory('pi')).rejects.toThrow('act-err');
  });

  it('deleteProcessInstance rethrows', async () => {
    mockClient.delete.mockRejectedValue(new Error('del-err'));
    await expect(svc.deleteProcessInstance('pi')).rejects.toThrow('del-err');
  });

  it('getProcessHistory rethrows', async () => {
    mockClient.post.mockRejectedValue(new Error('hist-err'));
    await expect(svc.getProcessHistory('app', 'tenant')).rejects.toThrow('hist-err');
  });

  it('getHistoricVariables rethrows', async () => {
    mockClient.get.mockRejectedValue(new Error('hv-err'));
    await expect(svc.getHistoricVariables('pi')).rejects.toThrow('hv-err');
  });

  it('getHrOnboardingProfile rethrows', async () => {
    mockClient.post.mockRejectedValue(new Error('hr-err'));
    await expect(svc.getHrOnboardingProfile('e', 't')).rejects.toThrow('hr-err');
  });

  it('getVariableHints rethrows', async () => {
    mockClient.get.mockRejectedValue(new Error('vh-err'));
    await expect(svc.getVariableHints('Key')).rejects.toThrow('vh-err');
  });

  it('getDeployedStartForm rethrows', async () => {
    mockClient.get.mockRejectedValue(new Error('form-err'));
    await expect(svc.getDeployedStartForm('K')).rejects.toThrow('form-err');
  });

  it('getDeployedTaskForm rethrows', async () => {
    mockClient.get.mockRejectedValue(new Error('tform-err'));
    await expect(svc.getDeployedTaskForm('t1')).rejects.toThrow('tform-err');
  });

  it('completeTask rethrows', async () => {
    mockClient.post.mockRejectedValue(new Error('complete-err'));
    await expect(svc.completeTask('t1', {})).rejects.toThrow('complete-err');
  });

  it('claimTask rethrows', async () => {
    mockClient.post.mockRejectedValue(new Error('claim-err'));
    await expect(svc.claimTask('t1', 'u')).rejects.toThrow('claim-err');
  });
});

describe('getUserTasks — branch gaps', () => {
  it('omits processVariables when tenantId is absent', async () => {
    routeGet([['/task', { data: [] }]]);
    await svc.getUserTasks('u', undefined, undefined);
    expect(mockClient.get).toHaveBeenCalledWith('/task', { params: {} });
  });

  it('omits candidateGroups when the array is empty', async () => {
    routeGet([['/task', { data: [] }]]);
    await svc.getUserTasks('u', 'flevoland', []);
    const params = mockClient.get.mock.calls[0][1].params;
    expect(params.candidateGroups).toBeUndefined();
    expect(params.includeAssignedTasks).toBeUndefined();
  });

  it('falls back to the raw defId when the definition lookup throws', async () => {
    routeGet([
      ['/task', { data: [{ id: 't1', processDefinitionId: 'opaqueId' }] }],
      ['/process-definition/opaqueId', Promise.reject(new Error('not found'))],
    ]);
    const res = await svc.getUserTasks();
    expect(res[0].processDefinitionKey).toBe('opaqueId');
  });
});

describe('getCompletedTasks — branch gaps', () => {
  it('sets boardOwner to null for a task with no processDefinitionKey', async () => {
    routeGet([
      [
        '/history/task',
        {
          data: [
            {
              id: 'ht2',
              name: 'Anon',
              assignee: null,
              taskDefinitionKey: 'tdk',
              processDefinitionKey: null,
              processInstanceId: 'pi2',
              startTime: 's',
              endTime: 'e',
              duration: 5,
            },
          ],
        },
      ],
    ]);
    mockClient.post.mockResolvedValue({ data: [{ id: 'pi2', businessKey: 'BK-2' }] });

    const res = await svc.getCompletedTasks('t');
    expect(res[0].boardOwner).toBeNull();
  });

  it('rethrows on upstream failure', async () => {
    routeGet([['/history/task', Promise.reject(new Error('tasks-err'))]]);
    await expect(svc.getCompletedTasks('t')).rejects.toThrow('tasks-err');
  });
});
