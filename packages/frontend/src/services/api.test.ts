import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { businessApi } from './api';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  token: undefined as string | undefined,
  updateToken: vi.fn(),
  login: vi.fn(),
}));

vi.mock('./keycloak', () => ({
  default: mockKeycloak,
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockKeycloak.authenticated = false;
  mockKeycloak.token = undefined;
  mockKeycloak.updateToken.mockReset().mockResolvedValue(true);
});

describe('businessApi.health', () => {
  it('returns the health payload on success', async () => {
    server.use(
      http.get('*/health', () =>
        HttpResponse.json({
          success: true,
          data: { name: 'api', version: '1.0.0', status: 'healthy' },
        })
      )
    );

    const result = await businessApi.health();

    expect(result).toEqual({ name: 'api', version: '1.0.0', status: 'healthy' });
  });

  it('falls back to the error response body when the server still returned data', async () => {
    server.use(
      http.get('*/health', () =>
        HttpResponse.json(
          { success: false, data: { name: 'api', version: '1.0.0', status: 'degraded' } },
          { status: 503 }
        )
      )
    );

    const result = await businessApi.health();

    expect(result).toEqual({ name: 'api', version: '1.0.0', status: 'degraded' });
  });

  it('attaches a bearer token when the user is authenticated', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.token = 'test-token';

    let receivedAuth: string | null = null;
    server.use(
      http.get('*/health', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({
          success: true,
          data: { name: 'api', version: '1.0.0', status: 'healthy' },
        });
      })
    );

    await businessApi.health();

    expect(receivedAuth).toBe('Bearer test-token');
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(120);
  });

  it('sends no Authorization header when the user is not authenticated', async () => {
    let receivedAuth: string | null = 'unset';
    server.use(
      http.get('*/health', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({
          success: true,
          data: { name: 'api', version: '1.0.0', status: 'healthy' },
        });
      })
    );

    await businessApi.health();

    expect(receivedAuth).toBeNull();
    expect(mockKeycloak.updateToken).not.toHaveBeenCalled();
  });
});

describe('businessApi.evaluateDecision', () => {
  it('posts variables and returns the response on success', async () => {
    let body: unknown;
    server.use(
      http.post('*/decision/zorgtoeslag/evaluate', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: [{ eligible: true }] });
      })
    );

    const result = await businessApi.evaluateDecision('zorgtoeslag', {
      income: { value: 30000, type: 'Double' },
    });

    expect(body).toEqual({ variables: { income: { value: 30000, type: 'Double' } } });
    expect(result).toEqual({ success: true, data: [{ eligible: true }] });
  });

  it('falls back to the error response body when the request fails', async () => {
    server.use(
      http.post('*/decision/zorgtoeslag/evaluate', () =>
        HttpResponse.json({ success: false, error: { code: 'BAD', message: 'x' } }, { status: 400 })
      )
    );

    const result = await businessApi.evaluateDecision('zorgtoeslag', {});

    expect(result).toEqual({ success: false, error: { code: 'BAD', message: 'x' } });
  });

  it('rethrows when the failure has no usable response body', async () => {
    server.use(http.post('*/decision/zorgtoeslag/evaluate', () => HttpResponse.error()));

    await expect(businessApi.evaluateDecision('zorgtoeslag', {})).rejects.toBeTruthy();
  });
});

describe('businessApi.process', () => {
  it('start posts variables and businessKey, returns the response on success', async () => {
    let body: unknown;
    server.use(
      http.post('*/process/AwbShellProcess/start', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { processInstanceId: 'pi-1' } });
      })
    );

    const result = await businessApi.process.start('AwbShellProcess', { a: 1 }, 'BK-1');

    expect(body).toEqual({ variables: { a: 1 }, businessKey: 'BK-1' });
    expect(result).toEqual({ success: true, data: { processInstanceId: 'pi-1' } });
  });

  it('start falls back to the error response body when the request fails', async () => {
    server.use(
      http.post('*/process/AwbShellProcess/start', () =>
        HttpResponse.json({ success: false, error: { message: 'nope' } }, { status: 400 })
      )
    );

    const result = await businessApi.process.start('AwbShellProcess', {});

    expect(result).toEqual({ success: false, error: { message: 'nope' } });
  });

  it('startForm fetches the process start form schema', async () => {
    server.use(
      http.get('*/process/AwbShellProcess/start-form', () =>
        HttpResponse.json({ success: true, data: { schema: 'x' } })
      )
    );

    expect(await businessApi.process.startForm('AwbShellProcess')).toEqual({
      success: true,
      data: { schema: 'x' },
    });
  });

  it('status fetches the process status', async () => {
    server.use(
      http.get('*/process/pi-1/status', () =>
        HttpResponse.json({ success: true, data: { status: 'ACTIVE' } })
      )
    );

    expect(await businessApi.process.status('pi-1')).toEqual({
      success: true,
      data: { status: 'ACTIVE' },
    });
  });

  it('variables fetches the process variables', async () => {
    server.use(
      http.get('*/process/pi-1/variables', () =>
        HttpResponse.json({ success: true, data: { x: 1 } })
      )
    );

    expect(await businessApi.process.variables('pi-1')).toEqual({ success: true, data: { x: 1 } });
  });

  it('cancel sends a DELETE with the reason in the body', async () => {
    let body: unknown;
    let method = '';
    server.use(
      http.delete('*/process/pi-1', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );

    const result = await businessApi.process.cancel('pi-1', 'no longer needed');

    expect(method).toBe('DELETE');
    expect(body).toEqual({ reason: 'no longer needed' });
    expect(result).toEqual({ success: true });
  });

  it('history URL-encodes the applicantId query param', async () => {
    let url = '';
    server.use(
      http.get('*/process/history', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    await businessApi.process.history('user with spaces');

    expect(url).toContain(`applicantId=${encodeURIComponent('user with spaces')}`);
  });

  it('historicVariables fetches historic variables', async () => {
    server.use(
      http.get('*/process/pi-1/historic-variables', () =>
        HttpResponse.json({ success: true, data: { x: 1 } })
      )
    );

    expect(await businessApi.process.historicVariables('pi-1')).toEqual({
      success: true,
      data: { x: 1 },
    });
  });

  it('activityHistory fetches the activity history', async () => {
    server.use(
      http.get('*/process/pi-1/activity-history', () =>
        HttpResponse.json({ success: true, data: [] })
      )
    );

    expect(await businessApi.process.activityHistory('pi-1')).toEqual({
      success: true,
      data: [],
    });
  });

  it('decisionDocument fetches the document template envelope', async () => {
    server.use(
      http.get('*/process/pi-1/decision-document', () =>
        HttpResponse.json({ success: true, template: { id: 't1' } })
      )
    );

    expect(await businessApi.process.decisionDocument('pi-1')).toEqual({
      success: true,
      template: { id: 't1' },
    });
  });
});

describe('businessApi.task', () => {
  it('list fetches the open task list', async () => {
    server.use(http.get('*/task', () => HttpResponse.json({ success: true, data: [] })));
    expect(await businessApi.task.list()).toEqual({ success: true, data: [] });
  });

  it('get fetches a single task', async () => {
    server.use(
      http.get('*/task/t1', () => HttpResponse.json({ success: true, data: { id: 't1' } }))
    );
    expect(await businessApi.task.get('t1')).toEqual({ success: true, data: { id: 't1' } });
  });

  it('formSchema fetches the task form schema', async () => {
    server.use(
      http.get('*/task/t1/form-schema', () =>
        HttpResponse.json({ success: true, data: { schema: 'x' } })
      )
    );
    expect(await businessApi.task.formSchema('t1')).toEqual({
      success: true,
      data: { schema: 'x' },
    });
  });

  it('variables fetches the task variables', async () => {
    server.use(
      http.get('*/task/t1/variables', () => HttpResponse.json({ success: true, data: {} }))
    );
    expect(await businessApi.task.variables('t1')).toEqual({ success: true, data: {} });
  });

  it('claim posts to claim the task', async () => {
    let method = '';
    server.use(
      http.post('*/task/t1/claim', ({ request }) => {
        method = request.method;
        return HttpResponse.json({ success: true });
      })
    );
    expect(await businessApi.task.claim('t1')).toEqual({ success: true });
    expect(method).toBe('POST');
  });

  it('complete posts the variables to complete the task', async () => {
    let body: unknown;
    server.use(
      http.post('*/task/t1/complete', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await businessApi.task.complete('t1', { approved: true });
    expect(body).toEqual({ variables: { approved: true } });
  });

  it('history fetches the historic task list', async () => {
    server.use(http.get('*/task/history', () => HttpResponse.json({ success: true, data: [] })));
    expect(await businessApi.task.history()).toEqual({ success: true, data: [] });
  });
});

describe('businessApi.portal', () => {
  it('nieuws defaults to limit=10 offset=0', async () => {
    let url = '';
    server.use(
      http.get('*/public/nieuws', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: { items: [], pagination: {} } });
      })
    );
    await businessApi.portal.nieuws();
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=0');
  });

  it('nieuws honours explicit limit/offset', async () => {
    let url = '';
    server.use(
      http.get('*/public/nieuws', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: { items: [], pagination: {} } });
      })
    );
    await businessApi.portal.nieuws(5, 20);
    expect(url).toContain('limit=5');
    expect(url).toContain('offset=20');
  });

  it('berichten defaults to limit=10 offset=0', async () => {
    let url = '';
    server.use(
      http.get('*/public/berichten', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: { items: [], pagination: {} } });
      })
    );
    await businessApi.portal.berichten();
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=0');
  });

  it('productenDiensten defaults to limit=50', async () => {
    let url = '';
    server.use(
      http.get('*/public/producten-diensten', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: { items: [], pagination: {} } });
      })
    );
    await businessApi.portal.productenDiensten();
    expect(url).toContain('limit=50');
  });

  it('regelcatalogus omits the refresh param by default', async () => {
    let url = '';
    server.use(
      http.get('*/public/regelcatalogus', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: {} });
      })
    );
    await businessApi.portal.regelcatalogus();
    expect(url).not.toContain('refresh');
  });

  it('regelcatalogus adds refresh=true when force is set', async () => {
    let url = '';
    server.use(
      http.get('*/public/regelcatalogus', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: {} });
      })
    );
    await businessApi.portal.regelcatalogus(true);
    expect(url).toContain('refresh=true');
  });
});

describe('businessApi.hr', () => {
  it('profile URL-encodes the employeeId query param', async () => {
    let url = '';
    server.use(
      http.get('*/hr/onboarding/profile', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: {} });
      })
    );
    await businessApi.hr.profile('emp 1');
    expect(url).toContain(`employeeId=${encodeURIComponent('emp 1')}`);
  });

  it('completed fetches the completed onboarding list', async () => {
    server.use(
      http.get('*/hr/onboarding/completed', () => HttpResponse.json({ success: true, data: [] }))
    );
    expect(await businessApi.hr.completed()).toEqual({ success: true, data: [] });
  });
});

describe('businessApi.rip', () => {
  it('phase1Active fetches the active Fase 1 instances', async () => {
    server.use(
      http.get('*/rip/phase1/active', () => HttpResponse.json({ success: true, data: [] }))
    );
    expect(await businessApi.rip.phase1Active()).toEqual({ success: true, data: [] });
  });

  it('phase1Documents fetches the Fase 1 document bundle', async () => {
    server.use(
      http.get('*/rip/phase1/pi-1/documents', () =>
        HttpResponse.json({
          success: true,
          data: { variables: {}, intakeReport: null, psuReport: null, pdp: null },
        })
      )
    );
    expect(await businessApi.rip.phase1Documents('pi-1')).toEqual({
      success: true,
      data: { variables: {}, intakeReport: null, psuReport: null, pdp: null },
    });
  });

  it('deploymentStatus fetches the live deployed process keys', async () => {
    server.use(
      http.get('*/rip/phases/deployment-status', () =>
        HttpResponse.json({ success: true, data: { deployedKeys: ['RipPhase1Process'] } })
      )
    );
    expect(await businessApi.rip.deploymentStatus()).toEqual({
      success: true,
      data: { deployedKeys: ['RipPhase1Process'] },
    });
  });

  it('phasesCounts fetches per-phase WIP/Gereed counts', async () => {
    server.use(
      http.get('*/rip/phases/counts', () =>
        HttpResponse.json({
          success: true,
          data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },
        })
      )
    );
    expect(await businessApi.rip.phasesCounts()).toEqual({
      success: true,
      data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },
    });
  });

  it('phase1Completed fetches the completed Fase 1 instances', async () => {
    server.use(
      http.get('*/rip/phase1/completed', () => HttpResponse.json({ success: true, data: [] }))
    );
    expect(await businessApi.rip.phase1Completed()).toEqual({ success: true, data: [] });
  });
});

describe('businessApi.admin', () => {
  it('auditLogs defaults to limit=50 offset=0', async () => {
    let url = '';
    server.use(
      http.get('*/admin/audit', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: { items: [], pagination: {} } });
      })
    );
    await businessApi.admin.auditLogs();
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=0');
  });
});

describe('businessApi.capacityClaim', () => {
  it('active fetches the active capacity claims', async () => {
    server.use(
      http.get('*/hr-capacity/active', () => HttpResponse.json({ success: true, data: [] }))
    );
    expect(await businessApi.capacityClaim.active()).toEqual({ success: true, data: [] });
  });

  it('completed fetches the completed capacity claims', async () => {
    server.use(
      http.get('*/hr-capacity/completed', () => HttpResponse.json({ success: true, data: [] }))
    );
    expect(await businessApi.capacityClaim.completed()).toEqual({ success: true, data: [] });
  });

  it('documents fetches the capacity claim document bundle', async () => {
    server.use(
      http.get('*/hr-capacity/pi-1/documents', () =>
        HttpResponse.json({
          success: true,
          data: { variables: {}, boardDecisionNotification: null, capacityClaimHandover: null },
        })
      )
    );
    expect(await businessApi.capacityClaim.documents('pi-1')).toEqual({
      success: true,
      data: { variables: {}, boardDecisionNotification: null, capacityClaimHandover: null },
    });
  });
});

describe('businessApi.edocs', () => {
  it('status fetches the eDOCS integration status', async () => {
    server.use(
      http.get('*/edocs/status', () => HttpResponse.json({ success: true, data: { status: 'up' } }))
    );
    expect(await businessApi.edocs.status()).toEqual({ success: true, data: { status: 'up' } });
  });
});

describe('businessApi.mcp (non-streaming)', () => {
  it('getSources fetches the configured MCP sources', async () => {
    server.use(http.get('*/mcp/sources', () => HttpResponse.json({ success: true, data: [] })));
    expect(await businessApi.mcp.getSources()).toEqual({ success: true, data: [] });
  });

  it('getModels fetches the available LLM models', async () => {
    server.use(http.get('*/mcp/models', () => HttpResponse.json({ success: true, data: [] })));
    expect(await businessApi.mcp.getModels()).toEqual({ success: true, data: [] });
  });
});

describe('businessApi.externalStatus', () => {
  it('fetches the external dependency health status', async () => {
    server.use(
      http.get('*/health/external', () =>
        HttpResponse.json({ success: true, data: { operaton: { status: 'up', latency: 12 } } })
      )
    );
    expect(await businessApi.externalStatus()).toEqual({
      success: true,
      data: { operaton: { status: 'up', latency: 12 } },
    });
  });
});

describe('businessApi.getBaseUrl', () => {
  it('returns the configured API base URL', () => {
    expect(businessApi.getBaseUrl()).toBe(import.meta.env.VITE_API_URL);
  });
});
