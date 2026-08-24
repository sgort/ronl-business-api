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
import m2mRouter, { M2M_ALLOWED_OPERATIONS } from './m2m.routes';
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

/** Every curated operation, with the route that fronts it and how it fails. */
const OPERATIONS = [
  ['process.list', 'get', '/v1/m2m/process', 'listProcessInstances', 500],
  ['process.start', 'post', '/v1/m2m/process/K/start', 'startProcess', 500],
  ['process.history', 'get', '/v1/m2m/process/history', 'queryProcessHistory', 500],
  ['process.status', 'get', '/v1/m2m/process/pi-1/status', 'getProcessInstance', 404],
  ['process.variables', 'get', '/v1/m2m/process/pi-1/variables', 'getProcessVariables', 404],
  [
    'process.historic-variables',
    'get',
    '/v1/m2m/process/pi-1/historic-variables',
    'getHistoricVariables',
    404,
  ],
  [
    'process.decision-document',
    'get',
    '/v1/m2m/process/pi-1/decision-document',
    'getDecisionDocument',
    404,
  ],
  ['process.start-form', 'get', '/v1/m2m/process/K/start-form', 'getDeployedStartForm', 404],
  ['process.variable-hints', 'get', '/v1/m2m/process/K/variable-hints', 'getVariableHints', 500],
  ['process.delete', 'delete', '/v1/m2m/process/pi-1', 'deleteProcessInstance', 500],
  ['task.list', 'get', '/v1/m2m/task', 'getUserTasks', 500],
  ['task.get', 'get', '/v1/m2m/task/t-1', 'getTask', 404],
  ['task.variables', 'get', '/v1/m2m/task/t-1/variables', 'getTaskVariables', 500],
  ['task.form-schema', 'get', '/v1/m2m/task/t-1/form-schema', 'getDeployedTaskForm', 404],
  ['task.claim', 'post', '/v1/m2m/task/t-1/claim', 'claimTask', 500],
  ['task.complete', 'post', '/v1/m2m/task/t-1/complete', 'completeTask', 500],
  ['decision.evaluate', 'post', '/v1/m2m/decision/K/evaluate', 'evaluateDecision', 500],
  ['decision.get', 'get', '/v1/m2m/decision/K', 'getDecisionDefinition', 404],
] as const;

describe('the curation gate', () => {
  it('covers exactly the operations the routes ask about', () => {
    expect([...M2M_ALLOWED_OPERATIONS].sort()).toEqual(OPERATIONS.map(([op]) => op).sort());
  });

  it.each(OPERATIONS)(
    'answers 403 OPERATION_NOT_PERMITTED for %s once it is de-listed',
    async (op, method, path) => {
      // The gate is operated by removing an entry from the list; do exactly that,
      // rather than asserting against a hard-coded copy of it.
      const index = M2M_ALLOWED_OPERATIONS.indexOf(op);
      M2M_ALLOWED_OPERATIONS.splice(index, 1);
      try {
        const res = await auth(request(app)[method](path));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('OPERATION_NOT_PERMITTED');
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
      expect(res.body.success).toBe(false);
    }
  );
});

describe('request bodies that leave fields out', () => {
  it('starts a process with no variables when the body omits them', async () => {
    svc.startProcess.mockResolvedValue({ id: 'pi-1' });
    const res = await auth(request(app).post('/v1/m2m/process/K/start').send({}));
    expect(res.status).toBe(200);
    expect(svc.startProcess).toHaveBeenCalledWith(
      'K',
      expect.objectContaining({ variables: {} }),
      'm2m'
    );
  });

  it('queries history with an empty filter when there is no body at all', async () => {
    svc.queryProcessHistory.mockResolvedValue([]);
    const res = await auth(request(app).get('/v1/m2m/process/history'));
    expect(res.status).toBe(200);
    expect(svc.queryProcessHistory).toHaveBeenCalledWith({});
  });

  it('completes a task with no variables when the body omits them', async () => {
    svc.completeTask.mockResolvedValue(undefined);
    const res = await auth(request(app).post('/v1/m2m/task/t-1/complete').send({}));
    expect(res.status).toBe(200);
    expect(svc.completeTask).toHaveBeenCalledWith('t-1', { variables: {} });
  });

  it('evaluates a decision with no variables when the body omits them', async () => {
    svc.evaluateDecision.mockResolvedValue([]);
    const res = await auth(request(app).post('/v1/m2m/decision/K/evaluate').send({}));
    expect(res.status).toBe(200);
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
