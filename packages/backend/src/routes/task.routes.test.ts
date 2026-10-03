/**
 * Route tests for /v1/task (jwt + tenant): list, history, get, variables,
 * form-schema, claim, complete. operatonService, axios, and auditLog are mocked.
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
    req.user = {
      userId: 'u-1',
      tenantId: 'flevoland',
      roles: ['manager'],
    } as Request['user'];
    next();
  },
}));
jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@services/operaton.service', () => ({
  operatonService: {
    getUserTasks: jest.fn(),
    getCompletedTasks: jest.fn(),
    getTask: jest.fn(),
    getProcessVariables: jest.fn(),
    getDeployedTaskForm: jest.fn(),
    claimTask: jest.fn(),
    completeTask: jest.fn(),
  },
}));
jest.mock('@middleware/audit.middleware', () => ({ auditLog: jest.fn() }));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    isAxiosError: (e: unknown) => !!(e && (e as { isAxiosError?: boolean }).isAxiosError),
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import { versionMiddleware } from '@middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import taskRouter from './task.routes';
import { operatonService } from '@services/operaton.service';
import { auditLog } from '@middleware/audit.middleware';

const svc = operatonService as unknown as Record<string, jest.Mock>;
const mockAuditLog = auditLog as jest.Mock;

const app = express();
// versionMiddleware is app-wide in index.ts, not in the router, so a test
// app mounting the router alone answers without API-Version -- which
// expectToMatchOperation checks on every 2xx (ADR API-57). Mounting it here
// keeps the test app answering what the real one does (#269).
app.use(express.json());
app.use(versionMiddleware);
app.use('/v1/task', taskRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

// Operaton's own shapes, not the minimum an assertion happened to look at.
// These tests passed `{ id: 't1' }` for a Task until #269 -- satisfying every
// expectation in the file while matching nothing the frontend receives. The
// Task schema names five required fields; the conformance check enforces them.
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Beoordelen aanvraag',
  created: '2026-09-28T12:00:00.000Z',
  processInstanceId: 'pi-1',
  taskDefinitionKey: 'Task_Review',
  ...over,
});

const historicTask = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  processInstanceId: 'pi-1',
  taskDefinitionKey: 'Task_Review',
  startTime: '2026-09-28T11:00:00.000Z',
  ...over,
});

/** A form-js schema, which is what a deployed form is. */
const form = { id: 'task-form', type: 'default', components: [] };

/** Operaton-format process variables owned by the caller's tenant. */
const ownedVars = { municipality: { value: 'flevoland', type: 'String' } };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the task's process instance belongs to the caller's tenant.
  svc.getProcessVariables.mockResolvedValue(ownedVars);
});

describe('GET /v1/task', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/task');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/task');
  });

  it('lists tasks filtered by user roles + tenant and audits', async () => {
    svc.getUserTasks.mockResolvedValue([task()]);
    const res = await auth(request(app).get('/v1/task'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/task');
    expect(res.body.data).toEqual([task()]);
    expect(svc.getUserTasks).toHaveBeenCalledWith('u-1', 'flevoland', ['manager']);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'task.list',
      'success',
      expect.any(Object)
    );
  });

  it('500 on failure', async () => {
    svc.getUserTasks.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/task');
    expect(res.body.code).toBe('TASK_LIST_FAILED');
  });
});

describe('GET /v1/task/history', () => {
  it('returns completed tasks for the tenant', async () => {
    svc.getCompletedTasks.mockResolvedValue([historicTask()]);
    const res = await auth(request(app).get('/v1/task/history'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/task/history');
    expect(svc.getCompletedTasks).toHaveBeenCalledWith('flevoland');
  });

  it('500 on failure', async () => {
    svc.getCompletedTasks.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task/history'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/task/history');
    expect(res.body.code).toBe('TASK_HISTORY_FAILED');
  });
});

describe('GET /v1/task/:id', () => {
  it('returns a task in the caller tenant', async () => {
    svc.getTask.mockResolvedValue(task());
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/task/{id}');
    expect(res.body.data).toMatchObject({ id: 't1' });
  });

  it('403 TENANT_MISMATCH when the instance variable names another tenant', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/task/{id}');
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('opens a task whose Operaton tenant disagrees but whose variable is the caller tenant', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'utrecht' }));
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/task/{id}');
    expect(svc.getProcessVariables).toHaveBeenCalledWith('pi-1');
  });

  it('403 TENANT_MISMATCH when the instance carries no municipality', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({});
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/task/{id}');
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('404 when the task is not found', async () => {
    svc.getTask.mockRejectedValue(new Error('nope'));
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/task/{id}');
    expect(res.body.code).toBe('TASK_NOT_FOUND');
  });
});

describe('GET /v1/task/:id/variables', () => {
  it('flattens process variables to plain values', async () => {
    svc.getTask.mockResolvedValue(task());
    svc.getProcessVariables.mockResolvedValue({
      amount: { value: 42, type: 'Integer' },
      municipality: { value: 'flevoland', type: 'String' },
    });
    const res = await auth(request(app).get('/v1/task/t1/variables'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/task/{id}/variables');
    expect(res.body.data).toEqual({ amount: 42, municipality: 'flevoland' });
    expect(svc.getProcessVariables).toHaveBeenCalledWith('pi-1');
  });

  it('reads the variables once, for both the check and the response', async () => {
    svc.getTask.mockResolvedValue(task());
    await auth(request(app).get('/v1/task/t1/variables'));
    expect(svc.getProcessVariables).toHaveBeenCalledTimes(1);
  });

  it('403 TENANT_MISMATCH when the instance variable names another tenant', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    const res = await auth(request(app).get('/v1/task/t1/variables'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/task/{id}/variables');
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('500 when variables cannot be retrieved', async () => {
    svc.getTask.mockResolvedValue(task());
    svc.getProcessVariables.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task/t1/variables'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/task/{id}/variables');
    expect(res.body.code).toBe('TASK_VARIABLES_FAILED');
  });
});

describe('GET /v1/task/:id/form-schema', () => {
  beforeEach(() => svc.getTask.mockResolvedValue(task()));

  it('403 TENANT_MISMATCH when the instance variable names another tenant', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/task/{id}/form-schema');
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('parses and returns a Camunda (JSON) form', async () => {
    svc.getDeployedTaskForm.mockResolvedValue({
      data: JSON.stringify(form),
      contentType: 'application/json',
    });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/task/{id}/form-schema');
    expect(res.body.data).toEqual(form);
  });

  it('415 for an embedded HTML form', async () => {
    svc.getDeployedTaskForm.mockResolvedValue({ data: '<form/>', contentType: 'text/html' });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(415);
    expectToMatchOperation(res, 'get', '/task/{id}/form-schema');
    expect(res.body.code).toBe('UNSUPPORTED_FORM_TYPE');
  });

  it('404 when the upstream returns a 404/400', async () => {
    svc.getDeployedTaskForm.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/task/{id}/form-schema');
    expect(res.body.code).toBe('FORM_NOT_FOUND');
  });

  it('500 for other failures', async () => {
    svc.getDeployedTaskForm.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/task/{id}/form-schema');
    expect(res.body.code).toBe('FORM_FETCH_FAILED');
  });
});

describe('POST /v1/task/:id/claim', () => {
  it('403 TENANT_MISMATCH when the instance variable names another tenant', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    const res = await auth(request(app).post('/v1/task/t1/claim'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'post', '/task/{id}/claim');
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(svc.claimTask).not.toHaveBeenCalled();
  });

  it('claims the task for the caller and audits', async () => {
    svc.getTask.mockResolvedValue(task());
    svc.claimTask.mockResolvedValue(undefined);
    const res = await auth(request(app).post('/v1/task/t1/claim'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/task/{id}/claim');
    expect(res.body.data).toEqual({ taskId: 't1', assignee: 'u-1' });
    expect(svc.claimTask).toHaveBeenCalledWith('t1', 'u-1');
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'task.claim',
      'success',
      expect.any(Object)
    );
  });

  it('500 on failure', async () => {
    svc.getTask.mockResolvedValue(task());
    svc.claimTask.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/task/t1/claim'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/task/{id}/claim');
    expect(res.body.code).toBe('TASK_CLAIM_FAILED');
  });
});

describe('POST /v1/task/:id/complete', () => {
  it('403 TENANT_MISMATCH when the instance variable names another tenant', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });
    const res = await auth(request(app).post('/v1/task/t1/complete')).send({ variables: {} });
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'post', '/task/{id}/complete');
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(svc.completeTask).not.toHaveBeenCalled();
  });

  it.each(['municipality', 'originTenantId', 'applicantId'])(
    '400 RESERVED_VARIABLE when the body variables include %s',
    async (key) => {
      svc.getTask.mockResolvedValue(task());

      const res = await auth(request(app).post('/v1/task/t1/complete')).send({
        variables: { [key]: 'x', decision: 'granted' },
      });

      expect(res.status).toBe(400);
      expectToMatchOperation(res, 'post', '/task/{id}/complete');
      expect(res.body.code).toBe('RESERVED_VARIABLE');
      expect(res.body.detail).toBe(`Variables set at process start cannot be changed: ${key}`);
      expect(svc.completeTask).not.toHaveBeenCalled();
    }
  );

  it('400 RESERVED_VARIABLE lists two offending keys in body order', async () => {
    svc.getTask.mockResolvedValue(task());

    const res = await auth(request(app).post('/v1/task/t1/complete')).send({
      variables: { applicantId: 'u', decision: 'granted', municipality: 'utrecht' },
    });

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/task/{id}/complete');
    expect(res.body.code).toBe('RESERVED_VARIABLE');
    expect(res.body.detail).toBe(
      'Variables set at process start cannot be changed: applicantId, municipality'
    );
    expect(res.body.reserved).toEqual(['applicantId', 'municipality']);
    expect(svc.completeTask).not.toHaveBeenCalled();
  });

  it('403 TENANT_MISMATCH wins over a reserved key on a foreign-tenant task', async () => {
    svc.getTask.mockResolvedValue(task({ tenantId: 'flevoland' }));
    svc.getProcessVariables.mockResolvedValue({
      municipality: { value: 'utrecht', type: 'String' },
    });

    const res = await auth(request(app).post('/v1/task/t1/complete')).send({
      variables: { municipality: 'flevoland' },
    });

    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'post', '/task/{id}/complete');
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(svc.completeTask).not.toHaveBeenCalled();
  });

  it('infers variable types, completes the task, and audits', async () => {
    svc.getTask.mockResolvedValue(task());
    svc.completeTask.mockResolvedValue(undefined);

    const res = await auth(request(app).post('/v1/task/t1/complete')).send({
      variables: { amount: 5, name: 'x', done: true },
    });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/task/{id}/complete');
    expect(res.body.data).toEqual({ taskId: 't1', status: 'completed' });
    expect(svc.completeTask).toHaveBeenCalledWith('t1', {
      variables: {
        amount: { value: 5, type: 'Integer' },
        name: { value: 'x', type: 'String' },
        done: { value: true, type: 'Boolean' },
      },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'task.complete',
      'success',
      expect.any(Object)
    );
  });

  it('500 on failure', async () => {
    svc.getTask.mockResolvedValue(task());
    svc.completeTask.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/task/t1/complete')).send({ variables: {} });
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/task/{id}/complete');
    expect(res.body.code).toBe('TASK_COMPLETE_FAILED');
  });
});

describe('handler guards for an authenticated request without a user', () => {
  // jwtMiddleware always attaches req.user or rejects, so these guards are
  // defensive; they still have to answer 401 rather than crash on req.user.x.
  const noUser = (r: request.Test) => r.set('x-test-no-user', '1');

  it.each([
    ['get', '/v1/task'],
    ['get', '/v1/task/history'],
    ['get', '/v1/task/t-1'],
    ['get', '/v1/task/t-1/variables'],
    ['get', '/v1/task/t-1/form-schema'],
    ['post', '/v1/task/t-1/claim'],
    ['post', '/v1/task/t-1/complete'],
  ] as const)('%s %s -> 401 UNAUTHORIZED', async (method, path) => {
    const res = await noUser(request(app)[method](path));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

describe('inferType, via the variables submitted on task completion', () => {
  it('tags each JSON value with the Operaton type Operaton expects', async () => {
    svc.getTask.mockResolvedValue({ id: 't-1', tenantId: 'flevoland' });
    svc.completeTask.mockResolvedValue(undefined);

    await auth(
      request(app)
        .post('/v1/task/t-1/complete')
        .send({
          variables: {
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

describe('non-Error rejections', () => {
  // Operaton failures surface as bare strings often enough that the
  // 'Unknown error' fallback in each catch is a real path, not a formality.
  it.each([
    ['getUserTasks', 'get', '/v1/task', 500],
    ['getCompletedTasks', 'get', '/v1/task/history', 500],
    ['getTask', 'get', '/v1/task/t-1', 404],
    ['getProcessVariables', 'get', '/v1/task/t-1/variables', 500],
    ['getDeployedTaskForm', 'get', '/v1/task/t-1/form-schema', 500],
    ['claimTask', 'post', '/v1/task/t-1/claim', 500],
    ['completeTask', 'post', '/v1/task/t-1/complete', 500],
  ] as const)('%s rejecting with a string still answers %s', async (fn, method, path, status) => {
    svc.getTask.mockResolvedValue({ id: 't-1', tenantId: 'flevoland' });
    svc.getProcessVariables.mockResolvedValue(ownedVars);
    svc[fn].mockRejectedValue('socket hang up');
    const res = await auth(request(app)[method](path));
    expect(res.status).toBe(status);
    expect(res.body.status).toBe(status);
  });
});

describe('GET /:id/form-schema error mapping', () => {
  it('maps an Operaton 400 to 404, the same as a 404', async () => {
    // Operaton answers 400 — not 404 — when a task exists but has no deployed
    // form, which for the caller means the same thing: there is no form.
    svc.getTask.mockResolvedValue({ id: 't-1', tenantId: 'flevoland' });
    svc.getDeployedTaskForm.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400 },
    });
    const res = await auth(request(app).get('/v1/task/t-1/form-schema'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/task/{id}/form-schema');
  });
});

describe('POST /:id/complete without a variables key', () => {
  it('completes the task with no variables rather than rejecting the body', async () => {
    svc.getTask.mockResolvedValue({ id: 't-1', tenantId: 'flevoland' });
    svc.completeTask.mockResolvedValue(undefined);
    const res = await auth(request(app).post('/v1/task/t-1/complete').send({}));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/task/{id}/complete');
    expect(svc.completeTask).toHaveBeenCalledWith('t-1', { variables: {} });
  });
});
