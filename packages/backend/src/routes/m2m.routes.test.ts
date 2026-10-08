/**
 * Route tests for /v1/m2m (jwt only — system actors, no tenant scoping).
 * 18 thin wrappers over operatonService (process / task / decision). config sets
 * m2mBaseUrl='' so the shared (mocked) operatonService singleton is used.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    // An authenticated request that carries no user: the shape each handler's own
    // `if (!req.user)` guard is written for, which jwtMiddleware itself never produces.
    if (req.headers['x-test-no-user']) return next();
    if (!req.headers['x-test-auth'])
      return res.status(401).type('application/problem+json').json({
        type: 'about:blank',
        status: 401,
        title: 'Missing token',
        detail: 'Missing token',
        instance: req.originalUrl,
        code: 'MISSING_TOKEN',
      });
    req.user = { userId: 'm2m-user' } as Request['user'];
    // `azp` is the Keycloak client the token was issued to. Default to the
    // allow-listed M2M client; x-test-azp stands in for any other caller, and
    // an empty value for a token that carries no azp at all.
    const azp = req.headers['x-test-azp'];
    req.auth = {
      userId: 'm2m-user',
      azp: azp === undefined ? 'operaton-mcp-client' : String(azp) || undefined,
    } as Request['auth'];
    next();
  },
}));
jest.mock('@services/operaton.service', () => ({
  OperatonService: jest.fn(),
  operatonService: {
    listProcessInstances: jest.fn(),
    startProcess: jest.fn(),
    queryProcessHistory: jest.fn(),
    getProcessInstance: jest.fn(),
    getProcessVariables: jest.fn(),
    getHistoricVariables: jest.fn(),
    getDecisionDocument: jest.fn(),
    getDeployedStartForm: jest.fn(),
    getVariableHints: jest.fn(),
    deleteProcessInstance: jest.fn(),
    getUserTasks: jest.fn(),
    getTask: jest.fn(),
    getTaskVariables: jest.fn(),
    getDeployedTaskForm: jest.fn(),
    claimTask: jest.fn(),
    completeTask: jest.fn(),
    evaluateDecision: jest.fn(),
    getDecisionDefinition: jest.fn(),
  },
}));
jest.mock('@middleware/audit.middleware', () => ({ auditLog: jest.fn() }));
jest.mock('@utils/config', () => ({
  config: {
    operaton: {
      m2mBaseUrl: '',
      m2mUsername: undefined,
      m2mPassword: undefined,
      m2mAllowedClients: ['operaton-mcp-client'],
    },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import { versionMiddleware } from '@middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import m2mRouter, { M2M_ALLOWED_OPERATIONS } from './m2m.routes';
import { operatonService } from '@services/operaton.service';

const svc = operatonService as unknown as Record<string, jest.Mock>;

const app = express();
// versionMiddleware is app-wide in index.ts, not in the router, so a test
// app mounting the router alone answers without API-Version -- which
// expectToMatchOperation checks on every 2xx (ADR API-57). Mounting it here
// keeps the test app answering what the real one does (#269).
app.use(express.json());
app.use(versionMiddleware);
app.use('/v1/m2m', m2mRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

// A running instance as Operaton's own /process-instance list reports it. The
// ProcessInstanceSummary schema names five required fields; `{ id: 'pi' }` met
// none of them and passed anyway until #269.
// A task as Operaton reports one -- the Task schema names five required
// fields, and `{ id: 't1' }` supplied one (#269).
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Beoordelen aanvraag',
  created: '2026-09-28T12:00:00.000Z',
  processInstanceId: 'pi-1',
  taskDefinitionKey: 'Task_Review',
  ...over,
});

/** A form-js schema, which is what a deployed form is. */
const form = { id: 'a-form', type: 'default', components: [] };

const instance = (over: Record<string, unknown> = {}) => ({
  id: 'pi',
  definitionId: 'MyProc:1:def-1',
  definitionKey: 'MyProc',
  businessKey: null,
  ended: false,
  suspended: false,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('auth gate', () => {
  it('401 without a token', async () => {
    const r1 = await request(app).get('/v1/m2m/process');
    expect(r1.status).toBe(401);
    expectToMatchOperation(r1, 'get', '/m2m/process');
  });
});

describe('client allow-list (#237)', () => {
  // ronl-business-api is the client every person signs in through — citizens
  // and caseworkers alike; edocs-mcp-client is a machine client for other routes.
  it.each([
    ['a user token (citizen or caseworker)', 'ronl-business-api'],
    ['another machine client', 'edocs-mcp-client'],
    ['a token without azp', ''],
  ])('403 M2M_CLIENT_NOT_ALLOWED for %s, before any engine call', async (_label, azp) => {
    const res = await auth(request(app).get('/v1/m2m/process')).set('x-test-azp', azp);

    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/m2m/process');
    expect(res.body).toEqual({
      type: 'about:blank',
      status: 403,
      title: 'M2m client not allowed',
      detail: 'This API is only available to registered M2M clients.',
      instance: '/v1/m2m/process',
      code: 'M2M_CLIENT_NOT_ALLOWED',
    });
    expect(svc.listProcessInstances).not.toHaveBeenCalled();
  });

  it('gates the write operations too', async () => {
    const start = await auth(request(app).post('/v1/m2m/process/MyProc/start'))
      .set('x-test-azp', 'ronl-business-api')
      .send({ variables: {} });
    const del = await auth(request(app).delete('/v1/m2m/process/pi-1')).set(
      'x-test-azp',
      'ronl-business-api'
    );
    const complete = await auth(request(app).post('/v1/m2m/task/t-1/complete'))
      .set('x-test-azp', 'ronl-business-api')
      .send({ variables: {} });

    expect([start.status, del.status, complete.status]).toEqual([403, 403, 403]);
    expect(svc.startProcess).not.toHaveBeenCalled();
    expect(svc.deleteProcessInstance).not.toHaveBeenCalled();
    expect(svc.completeTask).not.toHaveBeenCalled();
  });

  it('lets an allow-listed client through', async () => {
    svc.listProcessInstances.mockResolvedValue([]);
    const res = await auth(request(app).get('/v1/m2m/process')).set(
      'x-test-azp',
      'operaton-mcp-client'
    );
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/m2m/process');
  });
});

describe('process endpoints', () => {
  it('GET /process lists instances', async () => {
    svc.listProcessInstances.mockResolvedValue([instance()]);
    const res = await auth(request(app).get('/v1/m2m/process'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/m2m/process');
    expect(res.body.data).toEqual([instance()]);
  });

  it('GET /process → 500 on failure', async () => {
    svc.listProcessInstances.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/m2m/process'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/m2m/process');
    expect(res.body.code).toBe('PROCESS_LIST_FAILED');
  });

  it('POST /process/:key/start infers all variable types and starts', async () => {
    svc.startProcess.mockResolvedValue({ id: 'pi-1', businessKey: 'bk' });
    const res = await auth(request(app).post('/v1/m2m/process/MyProc/start')).send({
      variables: {
        amount: 5, // Integer
        ratio: 1.5, // Double
        name: 'x', // String
        obj: { a: 1 }, // Json
        pre: { value: 9, type: 'Long' }, // kept as-is
      },
      businessKey: 'bk',
    });
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/process/{key}/start');
    expect(res.body.data).toEqual({ processInstanceId: 'pi-1', businessKey: 'bk' });
    expect(svc.startProcess).toHaveBeenCalledWith(
      'MyProc',
      {
        variables: {
          amount: { value: 5, type: 'Integer' },
          ratio: { value: 1.5, type: 'Double' },
          name: { value: 'x', type: 'String' },
          obj: { value: { a: 1 }, type: 'Json' },
          pre: { value: 9, type: 'Long' },
        },
        businessKey: 'bk',
      },
      'm2m'
    );
  });

  it('POST /process/:key/start → 500 on failure', async () => {
    svc.startProcess.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/m2m/process/MyProc/start')).send({});
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/m2m/process/{key}/start');
    expect(res.body.code).toBe('PROCESS_START_FAILED');
  });

  it('POST /process/history passes the filter body to the history query', async () => {
    svc.queryProcessHistory.mockResolvedValue([{ id: 'h' }]);
    const res = await auth(request(app).post('/v1/m2m/process/history')).send({
      processDefinitionKey: 'AwbZorgtoeslagProcess',
    });
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/process/history');
    expect(svc.queryProcessHistory).toHaveBeenCalledWith({
      processDefinitionKey: 'AwbZorgtoeslagProcess',
    });
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('POST /process/history → 500 on failure', async () => {
    svc.queryProcessHistory.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/m2m/process/history')).send({});
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/m2m/process/history');
    expect(res.body.code).toBe('PROCESS_HISTORY_FAILED');
  });

  // The GET spelling answered for one release (v2026.10.0) as a deprecated
  // alias, marked with an RFC 9745 Deprecation header (#263). It is removed
  // (#312 item 5): a body on GET has no defined meaning, and a client whose
  // body was dropped silently received the unfiltered history.
  it('GET /process/history no longer answers', async () => {
    svc.queryProcessHistory.mockResolvedValue([{ id: 'h' }]);
    const res = await auth(request(app).get('/v1/m2m/process/history'));
    expect(res.status).toBe(404);
    expect(res.headers.deprecation).toBeUndefined();
    expect(svc.queryProcessHistory).not.toHaveBeenCalled();
  });

  it('GET /process/:id/status maps active/ended/suspended', async () => {
    svc.getProcessInstance.mockResolvedValueOnce({ id: 'pi', ended: false, suspended: false });
    expect((await auth(request(app).get('/v1/m2m/process/pi/status'))).body.data.status).toBe(
      'active'
    );
    svc.getProcessInstance.mockResolvedValueOnce({ id: 'pi', ended: true, suspended: false });
    expect((await auth(request(app).get('/v1/m2m/process/pi/status'))).body.data.status).toBe(
      'ended'
    );
    svc.getProcessInstance.mockResolvedValueOnce({ id: 'pi', ended: false, suspended: true });
    expect((await auth(request(app).get('/v1/m2m/process/pi/status'))).body.data.status).toBe(
      'suspended'
    );
  });

  it('GET /process/:id/status → 404 when not found', async () => {
    svc.getProcessInstance.mockRejectedValue(new Error('nope'));
    const res = await auth(request(app).get('/v1/m2m/process/pi/status'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/m2m/process/{id}/status');
    expect(res.body.code).toBe('PROCESS_NOT_FOUND');
  });

  it('GET /process/:id/variables flattens values', async () => {
    svc.getProcessVariables.mockResolvedValue({ a: { value: 1, type: 'Integer' } });
    const res = await auth(request(app).get('/v1/m2m/process/pi/variables'));
    expect(res.body.data).toEqual({ a: 1 });
  });

  it('GET /process/:id/variables → 404 on failure', async () => {
    svc.getProcessVariables.mockRejectedValue(new Error('nope'));
    const r2 = await auth(request(app).get('/v1/m2m/process/pi/variables'));
    expect(r2.status).toBe(404);
    expectToMatchOperation(r2, 'get', '/m2m/process/{id}/variables');
  });

  it('GET /process/:id/historic-variables returns variables', async () => {
    svc.getHistoricVariables.mockResolvedValue({ a: 1 });
    const res = await auth(request(app).get('/v1/m2m/process/pi/historic-variables'));
    expect(res.body.data).toEqual({ a: 1 });
    expectToMatchOperation(res, 'get', '/m2m/process/{id}/historic-variables');
  });

  it('GET /process/:id/historic-variables → 404 on failure', async () => {
    svc.getHistoricVariables.mockRejectedValue(new Error('nope'));
    expect((await auth(request(app).get('/v1/m2m/process/pi/historic-variables'))).status).toBe(
      404
    );
  });

  it('GET /process/:id/decision-document returns the template', async () => {
    svc.getDecisionDocument.mockResolvedValue({ t: 'x' });
    const res = await auth(request(app).get('/v1/m2m/process/pi/decision-document'));
    expect(res.body.template).toEqual({ t: 'x' });
  });

  it('GET /process/:id/decision-document → 404 on failure', async () => {
    svc.getDecisionDocument.mockRejectedValue(new Error('DOCUMENT_NOT_FOUND'));
    const r3 = await auth(request(app).get('/v1/m2m/process/pi/decision-document'));
    expect(r3.status).toBe(404);
    expectToMatchOperation(r3, 'get', '/m2m/process/{id}/decision-document');
  });

  it('GET /process/:key/start-form returns JSON forms and 415 for HTML', async () => {
    svc.getDeployedStartForm.mockResolvedValueOnce({
      data: JSON.stringify(form),
      contentType: 'application/json',
    });
    const r4 = await auth(request(app).get('/v1/m2m/process/MyProc/start-form'));
    expect(r4.status).toBe(200);
    expectToMatchOperation(r4, 'get', '/m2m/process/{key}/start-form');
    svc.getDeployedStartForm.mockResolvedValueOnce({ data: '<form/>', contentType: 'text/html' });
    const res = await auth(request(app).get('/v1/m2m/process/MyProc/start-form'));
    expect(res.status).toBe(415);
    expectToMatchOperation(res, 'get', '/m2m/process/{key}/start-form');
  });

  it('GET /process/:key/start-form → 404 on failure', async () => {
    svc.getDeployedStartForm.mockRejectedValue(new Error('nope'));
    const r5 = await auth(request(app).get('/v1/m2m/process/MyProc/start-form'));
    expect(r5.status).toBe(404);
    expectToMatchOperation(r5, 'get', '/m2m/process/{key}/start-form');
  });

  it('GET /process/:key/variable-hints returns hints', async () => {
    svc.getVariableHints.mockResolvedValue([{ name: 'a', type: 'String' }]);
    const res = await auth(request(app).get('/v1/m2m/process/MyProc/variable-hints'));
    expect(res.body.variables).toEqual([{ name: 'a', type: 'String' }]);
    expectToMatchOperation(res, 'get', '/m2m/process/{key}/variable-hints');
  });

  it('GET /process/:key/variable-hints → 500 on failure', async () => {
    svc.getVariableHints.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).get('/v1/m2m/process/MyProc/variable-hints'))).status).toBe(
      500
    );
  });

  it('DELETE /process/:id cancels the instance', async () => {
    svc.deleteProcessInstance.mockResolvedValue(undefined);
    const res = await auth(request(app).delete('/v1/m2m/process/pi')).send({ reason: 'obsolete' });
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/m2m/process/{id}');
    expect(svc.deleteProcessInstance).toHaveBeenCalledWith('pi', 'obsolete');
  });

  it('DELETE /process/:id → 500 on failure', async () => {
    svc.deleteProcessInstance.mockRejectedValue(new Error('boom'));
    const r6 = await auth(request(app).delete('/v1/m2m/process/pi')).send({});
    expect(r6.status).toBe(500);
    expectToMatchOperation(r6, 'delete', '/m2m/process/{id}');
  });
});

describe('task endpoints', () => {
  it('GET /task lists tasks', async () => {
    svc.getUserTasks.mockResolvedValue([{ id: 't' }]);
    expect((await auth(request(app).get('/v1/m2m/task'))).body.data).toEqual([{ id: 't' }]);
  });

  it('GET /task → 500 on failure', async () => {
    svc.getUserTasks.mockRejectedValue(new Error('boom'));
    const r7 = await auth(request(app).get('/v1/m2m/task'));
    expect(r7.status).toBe(500);
    expectToMatchOperation(r7, 'get', '/m2m/task');
  });

  it('GET /task/:id returns a task; 404 on failure', async () => {
    svc.getTask.mockResolvedValueOnce(task());
    const r8 = await auth(request(app).get('/v1/m2m/task/t1'));
    expect(r8.status).toBe(200);
    expectToMatchOperation(r8, 'get', '/m2m/task/{id}');
    svc.getTask.mockRejectedValueOnce(new Error('nope'));
    const r9 = await auth(request(app).get('/v1/m2m/task/t1'));
    expect(r9.status).toBe(404);
    expectToMatchOperation(r9, 'get', '/m2m/task/{id}');
  });

  it('GET /task/:id/variables returns variables; 500 on failure', async () => {
    svc.getTaskVariables.mockResolvedValueOnce({ a: 1 });
    expect((await auth(request(app).get('/v1/m2m/task/t1/variables'))).body.data).toEqual({ a: 1 });
    svc.getTaskVariables.mockRejectedValueOnce(new Error('boom'));
    const r10 = await auth(request(app).get('/v1/m2m/task/t1/variables'));
    expect(r10.status).toBe(500);
    expectToMatchOperation(r10, 'get', '/m2m/task/{id}/variables');
  });

  it('GET /task/:id/form-schema returns JSON; 415 for HTML; 404 on failure', async () => {
    svc.getDeployedTaskForm.mockResolvedValueOnce({
      data: JSON.stringify(form),
      contentType: 'application/json',
    });
    const r11 = await auth(request(app).get('/v1/m2m/task/t1/form-schema'));
    expect(r11.status).toBe(200);
    expectToMatchOperation(r11, 'get', '/m2m/task/{id}/form-schema');
    svc.getDeployedTaskForm.mockResolvedValueOnce({ data: '<f/>', contentType: 'text/html' });
    const r12 = await auth(request(app).get('/v1/m2m/task/t1/form-schema'));
    expect(r12.status).toBe(415);
    expectToMatchOperation(r12, 'get', '/m2m/task/{id}/form-schema');
    svc.getDeployedTaskForm.mockRejectedValueOnce(new Error('nope'));
    const r13 = await auth(request(app).get('/v1/m2m/task/t1/form-schema'));
    expect(r13.status).toBe(404);
    expectToMatchOperation(r13, 'get', '/m2m/task/{id}/form-schema');
  });

  it('POST /task/:id/claim uses the body userId, falling back to the token subject', async () => {
    svc.claimTask.mockResolvedValue(undefined);
    await auth(request(app).post('/v1/m2m/task/t1/claim')).send({ userId: 'alice' });
    expect(svc.claimTask).toHaveBeenLastCalledWith('t1', 'alice');
    await auth(request(app).post('/v1/m2m/task/t1/claim')).send({});
    expect(svc.claimTask).toHaveBeenLastCalledWith('t1', 'm2m-user');
  });

  it('POST /task/:id/claim → 500 on failure', async () => {
    svc.claimTask.mockRejectedValue(new Error('boom'));
    const r14 = await auth(request(app).post('/v1/m2m/task/t1/claim')).send({});
    expect(r14.status).toBe(500);
    expectToMatchOperation(r14, 'post', '/m2m/task/{id}/claim');
  });

  it('POST /task/:id/complete infers variables', async () => {
    svc.completeTask.mockResolvedValue(undefined);
    await auth(request(app).post('/v1/m2m/task/t1/complete')).send({ variables: { ok: true } });
    expect(svc.completeTask).toHaveBeenCalledWith('t1', {
      variables: { ok: { value: true, type: 'Boolean' } },
    });
  });

  it('POST /task/:id/complete → 500 on failure', async () => {
    svc.completeTask.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/m2m/task/t1/complete')).send({ variables: {} });
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/m2m/task/{id}/complete');
  });
});

describe('reserved process variables (#261)', () => {
  // The same three /v1/task/{id}/complete refuses. An M2M client has no
  // organisation of its own, so it has no reason to write an access label.
  it.each(['municipality', 'originTenantId', 'applicantId', 'edocsAuthor', 'edocsAuthorName'])(
    'POST /task/:id/complete refuses %s with 400 RESERVED_VARIABLE, before any engine call',
    async (name) => {
      const res = await auth(request(app).post('/v1/m2m/task/t1/complete')).send({
        variables: { [name]: 'x', reviewDecision: 'Approved' },
      });
      expect(res.status).toBe(400);
      expectToMatchOperation(res, 'post', '/m2m/task/{id}/complete');
      expect(res.body.code).toBe('RESERVED_VARIABLE');
      expect(res.body.detail).toContain(name);
      expect(svc.completeTask).not.toHaveBeenCalled();
    }
  );

  // At start the deployed tenant is the only legitimate source of the label,
  // and originTenantId is never set by this surface. applicantId may be: a
  // machine starting a case on a citizen's behalf.
  // A machine names no employee; edocsAuthor is set only by a person acting through /v1 (spec §6).
  it.each(['municipality', 'originTenantId', 'edocsAuthor', 'edocsAuthorName'])(
    'POST /process/:key/start refuses %s with 400 RESERVED_VARIABLE, before any engine call',
    async (name) => {
      const res = await auth(request(app).post('/v1/m2m/process/MyProc/start')).send({
        variables: { [name]: 'utrecht' },
      });
      expect(res.status).toBe(400);
      expectToMatchOperation(res, 'post', '/m2m/process/{key}/start');
      expect(res.body.code).toBe('RESERVED_VARIABLE');
      expect(res.body.detail).toContain(name);
      expect(svc.startProcess).not.toHaveBeenCalled();
    }
  );

  it('POST /process/:key/start still accepts applicantId', async () => {
    svc.startProcess.mockResolvedValue({ id: 'pi-1', businessKey: null });
    const res = await auth(request(app).post('/v1/m2m/process/MyProc/start')).send({
      variables: { applicantId: '999993653' },
    });
    expect(res.status).toBe(200);
    expect(svc.startProcess).toHaveBeenCalled();
  });

  it('names every reserved key in the body, in the body order', async () => {
    const res = await auth(request(app).post('/v1/m2m/task/t1/complete')).send({
      variables: { applicantId: 'a', ok: true, municipality: 'm' },
    });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe(
      'Variables set at process start cannot be changed: applicantId, municipality'
    );
    expect(res.body.reserved).toEqual(['applicantId', 'municipality']);
  });
});

describe('decision endpoints', () => {
  it('POST /decision/:key/evaluate evaluates with m2m tenant', async () => {
    svc.evaluateDecision.mockResolvedValue([{ result: { value: 1, type: 'Integer' } }]);
    const res = await auth(request(app).post('/v1/m2m/decision/Dec/evaluate')).send({
      variables: { x: 1 },
    });
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/decision/{key}/evaluate');
    expect(svc.evaluateDecision).toHaveBeenCalledWith(
      'Dec',
      { x: { value: 1, type: 'Integer' } },
      'm2m'
    );
  });

  it('POST /decision/:key/evaluate → 500 with the engine message', async () => {
    svc.evaluateDecision.mockRejectedValue(new Error('DMN broke'));
    const res = await auth(request(app).post('/v1/m2m/decision/Dec/evaluate')).send({
      variables: {},
    });
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/m2m/decision/{key}/evaluate');
    expect(res.body.detail).toBe('DMN broke');
  });

  it('GET /decision/:key returns the definition; 404 on failure', async () => {
    svc.getDecisionDefinition.mockResolvedValueOnce({
      id: 'd',
      key: 'Dec',
      name: 'A decision',
      version: 1,
    });
    const r15 = await auth(request(app).get('/v1/m2m/decision/Dec'));
    expect(r15.status).toBe(200);
    expectToMatchOperation(r15, 'get', '/m2m/decision/{key}');
    svc.getDecisionDefinition.mockRejectedValueOnce(new Error('nope'));
    const r16 = await auth(request(app).get('/v1/m2m/decision/Dec'));
    expect(r16.status).toBe(404);
    expectToMatchOperation(r16, 'get', '/m2m/decision/{key}');
  });
});

/**
 * Every curated operation, with the route that fronts it, how it fails, and the
 * path the OPENAPI DOCUMENT calls it.
 *
 * The last column is written out rather than derived from the URL. Deriving it
 * would re-resolve silently when a route moved; written out, a route that moves
 * without the document moving is an edit somebody has to make here, which is
 * the point (#269).
 */
const OPERATIONS = [
  ['process.list', 'get', '/v1/m2m/process', 'listProcessInstances', 500, '/m2m/process'],
  [
    'process.start',
    'post',
    '/v1/m2m/process/K/start',
    'startProcess',
    500,
    '/m2m/process/{key}/start',
  ],
  [
    'process.history',
    'post',
    '/v1/m2m/process/history',
    'queryProcessHistory',
    500,
    '/m2m/process/history',
  ],
  [
    'process.status',
    'get',
    '/v1/m2m/process/pi-1/status',
    'getProcessInstance',
    404,
    '/m2m/process/{id}/status',
  ],
  [
    'process.variables',
    'get',
    '/v1/m2m/process/pi-1/variables',
    'getProcessVariables',
    404,
    '/m2m/process/{id}/variables',
  ],
  [
    'process.historic-variables',
    'get',
    '/v1/m2m/process/pi-1/historic-variables',
    'getHistoricVariables',
    404,
    '/m2m/process/{id}/historic-variables',
  ],
  [
    'process.decision-document',
    'get',
    '/v1/m2m/process/pi-1/decision-document',
    'getDecisionDocument',
    404,
    '/m2m/process/{id}/decision-document',
  ],
  [
    'process.start-form',
    'get',
    '/v1/m2m/process/K/start-form',
    'getDeployedStartForm',
    404,
    '/m2m/process/{key}/start-form',
  ],
  [
    'process.variable-hints',
    'get',
    '/v1/m2m/process/K/variable-hints',
    'getVariableHints',
    500,
    '/m2m/process/{key}/variable-hints',
  ],
  [
    'process.delete',
    'delete',
    '/v1/m2m/process/pi-1',
    'deleteProcessInstance',
    500,
    '/m2m/process/{id}',
  ],
  ['task.list', 'get', '/v1/m2m/task', 'getUserTasks', 500, '/m2m/task'],
  ['task.get', 'get', '/v1/m2m/task/t-1', 'getTask', 404, '/m2m/task/{id}'],
  [
    'task.variables',
    'get',
    '/v1/m2m/task/t-1/variables',
    'getTaskVariables',
    500,
    '/m2m/task/{id}/variables',
  ],
  [
    'task.form-schema',
    'get',
    '/v1/m2m/task/t-1/form-schema',
    'getDeployedTaskForm',
    404,
    '/m2m/task/{id}/form-schema',
  ],
  ['task.claim', 'post', '/v1/m2m/task/t-1/claim', 'claimTask', 500, '/m2m/task/{id}/claim'],
  [
    'task.complete',
    'post',
    '/v1/m2m/task/t-1/complete',
    'completeTask',
    500,
    '/m2m/task/{id}/complete',
  ],
  [
    'decision.evaluate',
    'post',
    '/v1/m2m/decision/K/evaluate',
    'evaluateDecision',
    500,
    '/m2m/decision/{key}/evaluate',
  ],
  [
    'decision.get',
    'get',
    '/v1/m2m/decision/K',
    'getDecisionDefinition',
    404,
    '/m2m/decision/{key}',
  ],
] as const;

describe('the curation gate', () => {
  it('covers exactly the operations the routes ask about', () => {
    expect([...M2M_ALLOWED_OPERATIONS].sort()).toEqual(OPERATIONS.map(([op]) => op).sort());
  });

  it.each(OPERATIONS)(
    'answers 403 OPERATION_NOT_PERMITTED for %s once it is de-listed',
    async (op, method, path, _service, _status, documentPath) => {
      // The gate is operated by removing an entry from the list; do exactly that,
      // rather than asserting against a hard-coded copy of it.
      const index = M2M_ALLOWED_OPERATIONS.indexOf(op);
      M2M_ALLOWED_OPERATIONS.splice(index, 1);
      try {
        const res = await auth(request(app)[method](path));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('OPERATION_NOT_PERMITTED');
        // Every one of the eighteen, against the document's own 403 -- which is
        // the shared M2mForbidden, covering this code and M2M_CLIENT_NOT_ALLOWED.
        expectToMatchOperation(res, method, documentPath);
      } finally {
        M2M_ALLOWED_OPERATIONS.splice(index, 0, op);
      }
    }
  );
});

describe('non-Error rejections', () => {
  // Operaton failures surface as bare strings often enough that the String(error)
  // fallback in each catch is a real path, not a formality.
  it.each(OPERATIONS)(
    '%s rejecting with a string still answers its error status',
    async (_op, method, path, fn, status) => {
      svc[fn].mockRejectedValue('socket hang up');
      const res = await auth(request(app)[method](path));
      expect(res.status).toBe(status);
      expect(res.body.status).toBe(status);
      expect(typeof res.body.code).toBe('string');
    }
  );
});

describe('request bodies that leave fields out', () => {
  it('starts a process with no variables when the body omits them', async () => {
    svc.startProcess.mockResolvedValue({ id: 'pi-1', businessKey: null });
    const res = await auth(request(app).post('/v1/m2m/process/K/start').send({}));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/process/{key}/start');
    expect(svc.startProcess).toHaveBeenCalledWith(
      'K',
      expect.objectContaining({ variables: {} }),
      'm2m'
    );
  });

  it('queries history with an empty filter when there is no body at all', async () => {
    svc.queryProcessHistory.mockResolvedValue([]);
    const res = await auth(request(app).post('/v1/m2m/process/history'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/process/history');
    expect(svc.queryProcessHistory).toHaveBeenCalledWith({});
  });

  it('completes a task with no variables when the body omits them', async () => {
    svc.completeTask.mockResolvedValue(undefined);
    const res = await auth(request(app).post('/v1/m2m/task/t-1/complete').send({}));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/task/{id}/complete');
    expect(svc.completeTask).toHaveBeenCalledWith('t-1', { variables: {} });
  });

  it('evaluates a decision with no variables when the body omits them', async () => {
    svc.evaluateDecision.mockResolvedValue([]);
    const res = await auth(request(app).post('/v1/m2m/decision/K/evaluate').send({}));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/m2m/decision/{key}/evaluate');
  });
});

describe('variable coercion', () => {
  it('passes through values already in Operaton form and infers a type for the rest', async () => {
    svc.completeTask.mockResolvedValue(undefined);
    await auth(
      request(app)
        .post('/v1/m2m/task/t-1/complete')
        .send({
          variables: {
            alReedsGetypeerd: { value: '2026-01-01', type: 'Date' },
            akkoord: true,
            aantal: 3,
            bedrag: 12.5,
            toelichting: 'ok',
            bijlage: { naam: 'a.pdf' },
            reden: null,
          },
        })
    );
    expect(svc.completeTask).toHaveBeenCalledWith('t-1', {
      variables: {
        alReedsGetypeerd: { value: '2026-01-01', type: 'Date' },
        akkoord: { value: true, type: 'Boolean' },
        aantal: { value: 3, type: 'Integer' },
        bedrag: { value: 12.5, type: 'Double' },
        toelichting: { value: 'ok', type: 'String' },
        bijlage: { value: { naam: 'a.pdf' }, type: 'Json' },
        reden: { value: null, type: 'Null' },
      },
    });
  });
});

describe('the M2M Operaton instance', () => {
  it('uses a dedicated OperatonService when OPERATON_M2M_BASE_URL is configured', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OperatonService } = require('@services/operaton.service') as {
      OperatonService: jest.Mock;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config } = require('@utils/config') as {
      config: { operaton: Record<string, string | undefined> };
    };
    config.operaton.m2mBaseUrl = 'https://operaton-doc.test/engine-rest';
    config.operaton.m2mUsername = 'm2m';
    config.operaton.m2mPassword = 'pw';
    try {
      OperatonService.mockClear();
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./m2m.routes');
      });
      expect(OperatonService).toHaveBeenCalledWith(
        'https://operaton-doc.test/engine-rest',
        'm2m',
        'pw'
      );
    } finally {
      config.operaton.m2mBaseUrl = '';
      config.operaton.m2mUsername = undefined;
      config.operaton.m2mPassword = undefined;
    }
  });
});
