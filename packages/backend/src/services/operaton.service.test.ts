/**
 * Unit tests for OperatonService — core process / task / decision / health
 * methods (part A). A mocked axios client stands in for the Operaton REST API;
 * we assert the request (verb + URL + body/params), the mapped response, tenant
 * injection, and error handling.
 *
 * The archive/list + BPMN/form methods are covered in part B.
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

describe('startProcess', () => {
  const req = () => ({ businessKey: 'bk', variables: {} }) as unknown as ProcessStartRequest;

  it('injects municipality from tenantId when absent and posts to the start endpoint', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pi-1' } });
    const request = req();

    const res = await svc.startProcess('MyProc', request, 'flevoland');

    expect(res).toEqual({ id: 'pi-1' });
    expect(mockClient.post).toHaveBeenCalledWith('/process-definition/key/MyProc/start', request);
    expect(request.variables.municipality).toEqual({ value: 'flevoland', type: 'String' });
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
