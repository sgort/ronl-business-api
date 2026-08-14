/**
 * Route tests for /v1/process (jwt + tenant + assurance): start (with AwbZorgtoeslag
 * special-casing), history, status, variables, historic-variables, activity-history,
 * decision-document, start-form, variable-hints, delete. operatonService, axios,
 * auditLog and the middleware are mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    const roles = ((req.headers['x-test-roles'] as string) ?? 'caseworker').split(',');
    req.user = {
      userId: 'u-1',
      tenantId: 'flevoland',
      roles,
      organisationType: 'province',
      assuranceLevel: 'substantieel',
    } as unknown as Request['user'];
    next();
  },
  requireAssuranceLevel: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
  addTenantToProcessVariables: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@services/operaton.service', () => ({
  operatonService: {
    startProcess: jest.fn(),
    getProcessHistory: jest.fn(),
    getProcessInstance: jest.fn(),
    getProcessVariables: jest.fn(),
    getHistoricVariables: jest.fn(),
    getActivityHistory: jest.fn(),
    getDecisionDocument: jest.fn(),
    getDeployedStartForm: jest.fn(),
    getVariableHints: jest.fn(),
    deleteProcessInstance: jest.fn(),
  },
}));
jest.mock('@middleware/audit.middleware', () => ({ auditLog: jest.fn() }));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    isAxiosError: (e: unknown) => !!(e && (e as { isAxiosError?: boolean }).isAxiosError),
  },
}));
jest.mock('@utils/config', () => ({ config: { operaton: { baseUrl: 'http://op' } } }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import processRouter from './process.routes';
import { operatonService } from '@services/operaton.service';

const svc = operatonService as unknown as Record<string, jest.Mock>;

const app = express();
app.use(express.json());
app.use('/v1/process', processRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');
/** Operaton-format process variables owned by the caller's tenant. */
const ownedVars = { municipality: { value: 'flevoland', type: 'String' } };

beforeEach(() => jest.clearAllMocks());

describe('POST /:key/start', () => {
  it('401 without a token', async () => {
    expect((await request(app).post('/v1/process/P/start').send({})).status).toBe(401);
  });

  it('infers all variable types, starts the process, returns 201', async () => {
    svc.startProcess.mockResolvedValue({ id: 'pi-1', businessKey: 'bk', ended: false });
    const res = await auth(request(app).post('/v1/process/MyProc/start')).send({
      businessKey: 'bk',
      variables: { amount: 5, ratio: 1.5, note: 'hi', payload: { a: 1 }, empty: null },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ processInstanceId: 'pi-1', status: 'active' });
    expect(svc.startProcess.mock.calls[0][1].variables).toEqual({
      amount: { value: 5, type: 'Integer' },
      ratio: { value: 1.5, type: 'Double' },
      note: { value: 'hi', type: 'String' },
      payload: { value: { a: 1 }, type: 'Json' },
      empty: { value: null, type: 'Null' },
    });
  });

  it('applies AwbZorgtoeslag coercions and authority override', async () => {
    svc.startProcess.mockResolvedValue({ id: 'pi-2' });
    await auth(request(app).post('/v1/process/AwbZorgtoeslagProcess/start')).send({
      variables: { toetsingsinkomen: '30000', overlijdensdatum: '' },
    });
    const vars = svc.startProcess.mock.calls[0][1].variables;
    expect(vars.toetsingsinkomen).toEqual({ value: 30000, type: 'Double' });
    expect(vars.overlijdensdatum).toBeUndefined(); // blank stripped
    expect(vars.municipality).toEqual({ value: 'toeslagen', type: 'String' }); // authority override
    expect(vars.originTenantId).toEqual({ value: 'flevoland', type: 'String' });
  });

  it('500 preferring the Operaton error message', async () => {
    svc.startProcess.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'no matching process definition deployed with key P' } },
    });
    const res = await auth(request(app).post('/v1/process/P/start')).send({ variables: {} });
    expect(res.status).toBe(500);
    expect(res.body.error.details).toBe('no matching process definition deployed with key P');
  });
});

describe('GET /history', () => {
  it('400 without applicantId', async () => {
    const res = await auth(request(app).get('/v1/process/history'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('403 when a citizen requests another citizen', async () => {
    const res = await auth(request(app).get('/v1/process/history?applicantId=other')).set(
      'x-test-roles',
      'citizen'
    );
    expect(res.status).toBe(403);
  });

  it('returns history for a caseworker', async () => {
    svc.getProcessHistory.mockResolvedValue([{ id: 'p' }]);
    const res = await auth(request(app).get('/v1/process/history?applicantId=any'));
    expect(res.status).toBe(200);
    expect(svc.getProcessHistory).toHaveBeenCalledWith('any', 'flevoland', 'province', true);
  });

  it('500 on failure', async () => {
    svc.getProcessHistory.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/process/history?applicantId=any'));
    expect(res.status).toBe(500);
  });
});

describe('GET /:id/status', () => {
  it('returns status for an owned instance', async () => {
    svc.getProcessInstance.mockResolvedValue({ id: 'pi', ended: false, suspended: false });
    svc.getProcessVariables.mockResolvedValue(ownedVars);
    const res = await auth(request(app).get('/v1/process/pi/status'));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('403 on a tenant mismatch', async () => {
    svc.getProcessInstance.mockResolvedValue({ id: 'pi' });
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    expect((await auth(request(app).get('/v1/process/pi/status'))).status).toBe(403);
  });

  it('404 when the instance is missing', async () => {
    svc.getProcessInstance.mockRejectedValue(new Error('nope'));
    expect((await auth(request(app).get('/v1/process/pi/status'))).status).toBe(404);
  });
});

describe('GET /:id/variables', () => {
  it('flattens variables for an owned instance', async () => {
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'flevoland', type: 'String' },
      amount: { value: 42, type: 'Integer' },
    });
    const res = await auth(request(app).get('/v1/process/pi/variables'));
    expect(res.body.data).toEqual({ municipality: 'flevoland', amount: 42 });
  });

  it('403 on a tenant mismatch', async () => {
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    expect((await auth(request(app).get('/v1/process/pi/variables'))).status).toBe(403);
  });

  it('404 on failure', async () => {
    svc.getProcessVariables.mockRejectedValue(new Error('nope'));
    expect((await auth(request(app).get('/v1/process/pi/variables'))).status).toBe(404);
  });
});

describe('GET /:id/historic-variables', () => {
  it('returns variables when the tenant matches', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'flevoland', decision: 'granted' });
    const res = await auth(request(app).get('/v1/process/pi/historic-variables'));
    expect(res.status).toBe(200);
    expect(res.body.data.decision).toBe('granted');
  });

  it('allows the applicant even under a different authority', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'toeslagen', applicantId: 'u-1' });
    expect((await auth(request(app).get('/v1/process/pi/historic-variables'))).status).toBe(200);
  });

  it('403 for a foreign tenant/process', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'toeslagen', applicantId: 'other' });
    expect((await auth(request(app).get('/v1/process/pi/historic-variables'))).status).toBe(403);
  });

  it('500 on failure', async () => {
    svc.getHistoricVariables.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).get('/v1/process/pi/historic-variables'))).status).toBe(500);
  });
});

describe('GET /:id/activity-history', () => {
  it('returns activities for an owned instance', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'flevoland' });
    svc.getActivityHistory.mockResolvedValue([{ id: 'a1' }]);
    const res = await auth(request(app).get('/v1/process/pi/activity-history'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'a1' }]);
  });

  it('403 on a tenant mismatch', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'utrecht' });
    expect((await auth(request(app).get('/v1/process/pi/activity-history'))).status).toBe(403);
  });

  it('500 on failure', async () => {
    svc.getHistoricVariables.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).get('/v1/process/pi/activity-history'))).status).toBe(500);
  });
});

describe('GET /:instanceId/decision-document', () => {
  it('returns the template for an owned instance', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'flevoland' });
    svc.getDecisionDocument.mockResolvedValue({ t: 'x' });
    const res = await auth(request(app).get('/v1/process/pi/decision-document'));
    expect(res.body.template).toEqual({ t: 'x' });
  });

  it('403 on a tenant/process mismatch', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'utrecht', applicantId: 'other' });
    expect((await auth(request(app).get('/v1/process/pi/decision-document'))).status).toBe(403);
  });

  it('404 for an axios 404', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'flevoland' });
    svc.getDecisionDocument.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const res = await auth(request(app).get('/v1/process/pi/decision-document'));
    expect(res.status).toBe(404);
  });

  it('404 for DOCUMENT_NOT_FOUND', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'flevoland' });
    svc.getDecisionDocument.mockRejectedValue(new Error('DOCUMENT_NOT_FOUND'));
    const res = await auth(request(app).get('/v1/process/pi/decision-document'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('500 for other failures', async () => {
    svc.getHistoricVariables.mockResolvedValue({ municipality: 'flevoland' });
    svc.getDecisionDocument.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).get('/v1/process/pi/decision-document'))).status).toBe(500);
  });
});

describe('GET /:key/start-form', () => {
  it('returns a JSON form', async () => {
    svc.getDeployedStartForm.mockResolvedValue({
      data: '{"x":1}',
      contentType: 'application/json',
    });
    const res = await auth(request(app).get('/v1/process/P/start-form'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ x: 1 });
    expect(svc.getDeployedStartForm).toHaveBeenCalledWith('P', 'flevoland');
  });

  it('415 for an HTML form', async () => {
    svc.getDeployedStartForm.mockResolvedValue({ data: '<f/>', contentType: 'text/html' });
    expect((await auth(request(app).get('/v1/process/P/start-form'))).status).toBe(415);
  });

  it('404 for an axios 404', async () => {
    svc.getDeployedStartForm.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const res = await auth(request(app).get('/v1/process/P/start-form'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FORM_NOT_FOUND');
  });

  it('500 for other failures', async () => {
    svc.getDeployedStartForm.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).get('/v1/process/P/start-form'))).status).toBe(500);
  });
});

describe('GET /:key/variable-hints', () => {
  it('returns hints; 500 on failure', async () => {
    svc.getVariableHints.mockResolvedValueOnce([{ name: 'a', type: 'String' }]);
    expect((await auth(request(app).get('/v1/process/P/variable-hints'))).body.variables).toEqual([
      { name: 'a', type: 'String' },
    ]);
    svc.getVariableHints.mockRejectedValueOnce(new Error('boom'));
    expect((await auth(request(app).get('/v1/process/P/variable-hints'))).status).toBe(500);
  });
});

describe('DELETE /:id', () => {
  it('cancels an owned instance', async () => {
    svc.getProcessVariables.mockResolvedValue(ownedVars);
    svc.deleteProcessInstance.mockResolvedValue(undefined);
    const res = await auth(request(app).delete('/v1/process/pi')).send({ reason: 'obsolete' });
    expect(res.status).toBe(200);
    expect(svc.deleteProcessInstance).toHaveBeenCalledWith('pi', 'obsolete');
  });

  it('403 on a tenant mismatch', async () => {
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    expect((await auth(request(app).delete('/v1/process/pi')).send({})).status).toBe(403);
  });

  it('500 on failure', async () => {
    svc.getProcessVariables.mockResolvedValue(ownedVars);
    svc.deleteProcessInstance.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).delete('/v1/process/pi')).send({})).status).toBe(500);
  });
});
