/**
 * Route tests for /v1/m2m (jwt only — system actors, no tenant scoping).
 * 18 thin wrappers over operatonService (process / task / decision). config sets
 * m2mBaseUrl='' so the shared (mocked) operatonService singleton is used.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = { userId: 'm2m-user' } as Request['user'];
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
  config: { operaton: { m2mBaseUrl: '', m2mUsername: undefined, m2mPassword: undefined } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import m2mRouter from './m2m.routes';
import { operatonService } from '@services/operaton.service';

const svc = operatonService as unknown as Record<string, jest.Mock>;

const app = express();
app.use(express.json());
app.use('/v1/m2m', m2mRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('auth gate', () => {
  it('401 without a token', async () => {
    expect((await request(app).get('/v1/m2m/process')).status).toBe(401);
  });
});

describe('process endpoints', () => {
  it('GET /process lists instances', async () => {
    svc.listProcessInstances.mockResolvedValue([{ id: 'pi' }]);
    const res = await auth(request(app).get('/v1/m2m/process'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'pi' }]);
  });

  it('GET /process → 500 on failure', async () => {
    svc.listProcessInstances.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/m2m/process'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PROCESS_LIST_FAILED');
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
    expect(res.body.error.code).toBe('PROCESS_START_FAILED');
  });

  it('GET /process/history queries history', async () => {
    svc.queryProcessHistory.mockResolvedValue([{ id: 'h' }]);
    const res = await auth(request(app).get('/v1/m2m/process/history'));
    expect(res.status).toBe(200);
  });

  it('GET /process/history → 500 on failure', async () => {
    svc.queryProcessHistory.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/m2m/process/history'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PROCESS_HISTORY_FAILED');
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
    expect(res.body.error.code).toBe('PROCESS_NOT_FOUND');
  });

  it('GET /process/:id/variables flattens values', async () => {
    svc.getProcessVariables.mockResolvedValue({ a: { value: 1, type: 'Integer' } });
    const res = await auth(request(app).get('/v1/m2m/process/pi/variables'));
    expect(res.body.data).toEqual({ a: 1 });
  });

  it('GET /process/:id/variables → 404 on failure', async () => {
    svc.getProcessVariables.mockRejectedValue(new Error('nope'));
    expect((await auth(request(app).get('/v1/m2m/process/pi/variables'))).status).toBe(404);
  });

  it('GET /process/:id/historic-variables returns variables', async () => {
    svc.getHistoricVariables.mockResolvedValue({ a: 1 });
    const res = await auth(request(app).get('/v1/m2m/process/pi/historic-variables'));
    expect(res.body.data).toEqual({ a: 1 });
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
    expect((await auth(request(app).get('/v1/m2m/process/pi/decision-document'))).status).toBe(404);
  });

  it('GET /process/:key/start-form returns JSON forms and 415 for HTML', async () => {
    svc.getDeployedStartForm.mockResolvedValueOnce({
      data: '{"components":[]}',
      contentType: 'application/json',
    });
    expect((await auth(request(app).get('/v1/m2m/process/MyProc/start-form'))).status).toBe(200);
    svc.getDeployedStartForm.mockResolvedValueOnce({ data: '<form/>', contentType: 'text/html' });
    const res = await auth(request(app).get('/v1/m2m/process/MyProc/start-form'));
    expect(res.status).toBe(415);
  });

  it('GET /process/:key/start-form → 404 on failure', async () => {
    svc.getDeployedStartForm.mockRejectedValue(new Error('nope'));
    expect((await auth(request(app).get('/v1/m2m/process/MyProc/start-form'))).status).toBe(404);
  });

  it('GET /process/:key/variable-hints returns hints', async () => {
    svc.getVariableHints.mockResolvedValue([{ name: 'a', type: 'String' }]);
    const res = await auth(request(app).get('/v1/m2m/process/MyProc/variable-hints'));
    expect(res.body.variables).toEqual([{ name: 'a', type: 'String' }]);
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
    expect(svc.deleteProcessInstance).toHaveBeenCalledWith('pi', 'obsolete');
  });

  it('DELETE /process/:id → 500 on failure', async () => {
    svc.deleteProcessInstance.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).delete('/v1/m2m/process/pi')).send({})).status).toBe(500);
  });
});

describe('task endpoints', () => {
  it('GET /task lists tasks', async () => {
    svc.getUserTasks.mockResolvedValue([{ id: 't' }]);
    expect((await auth(request(app).get('/v1/m2m/task'))).body.data).toEqual([{ id: 't' }]);
  });

  it('GET /task → 500 on failure', async () => {
    svc.getUserTasks.mockRejectedValue(new Error('boom'));
    expect((await auth(request(app).get('/v1/m2m/task'))).status).toBe(500);
  });

  it('GET /task/:id returns a task; 404 on failure', async () => {
    svc.getTask.mockResolvedValueOnce({ id: 't1' });
    expect((await auth(request(app).get('/v1/m2m/task/t1'))).status).toBe(200);
    svc.getTask.mockRejectedValueOnce(new Error('nope'));
    expect((await auth(request(app).get('/v1/m2m/task/t1'))).status).toBe(404);
  });

  it('GET /task/:id/variables returns variables; 500 on failure', async () => {
    svc.getTaskVariables.mockResolvedValueOnce({ a: 1 });
    expect((await auth(request(app).get('/v1/m2m/task/t1/variables'))).body.data).toEqual({ a: 1 });
    svc.getTaskVariables.mockRejectedValueOnce(new Error('boom'));
    expect((await auth(request(app).get('/v1/m2m/task/t1/variables'))).status).toBe(500);
  });

  it('GET /task/:id/form-schema returns JSON; 415 for HTML; 404 on failure', async () => {
    svc.getDeployedTaskForm.mockResolvedValueOnce({
      data: '{"x":1}',
      contentType: 'application/json',
    });
    expect((await auth(request(app).get('/v1/m2m/task/t1/form-schema'))).status).toBe(200);
    svc.getDeployedTaskForm.mockResolvedValueOnce({ data: '<f/>', contentType: 'text/html' });
    expect((await auth(request(app).get('/v1/m2m/task/t1/form-schema'))).status).toBe(415);
    svc.getDeployedTaskForm.mockRejectedValueOnce(new Error('nope'));
    expect((await auth(request(app).get('/v1/m2m/task/t1/form-schema'))).status).toBe(404);
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
    expect((await auth(request(app).post('/v1/m2m/task/t1/claim')).send({})).status).toBe(500);
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
  });
});

describe('decision endpoints', () => {
  it('POST /decision/:key/evaluate evaluates with m2m tenant', async () => {
    svc.evaluateDecision.mockResolvedValue([{ result: 1 }]);
    const res = await auth(request(app).post('/v1/m2m/decision/Dec/evaluate')).send({
      variables: { x: 1 },
    });
    expect(res.status).toBe(200);
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
    expect(res.body.error.message).toBe('DMN broke');
  });

  it('GET /decision/:key returns the definition; 404 on failure', async () => {
    svc.getDecisionDefinition.mockResolvedValueOnce({ id: 'd' });
    expect((await auth(request(app).get('/v1/m2m/decision/Dec'))).status).toBe(200);
    svc.getDecisionDefinition.mockRejectedValueOnce(new Error('nope'));
    expect((await auth(request(app).get('/v1/m2m/decision/Dec'))).status).toBe(404);
  });
});
