/**
 * Route tests for /v1/task (jwt + tenant): list, history, get, variables,
 * form-schema, claim, complete. operatonService, axios, and auditLog are mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
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
import taskRouter from './task.routes';
import { operatonService } from '@services/operaton.service';
import { auditLog } from '@middleware/audit.middleware';

const svc = operatonService as unknown as Record<string, jest.Mock>;
const mockAuditLog = auditLog as jest.Mock;

const app = express();
app.use(express.json());
app.use('/v1/task', taskRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('GET /v1/task', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/task');
    expect(res.status).toBe(401);
  });

  it('lists tasks filtered by user roles + tenant and audits', async () => {
    svc.getUserTasks.mockResolvedValue([{ id: 't1' }]);
    const res = await auth(request(app).get('/v1/task'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 't1' }]);
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
    expect(res.body.error.code).toBe('TASK_LIST_FAILED');
  });
});

describe('GET /v1/task/history', () => {
  it('returns completed tasks for the tenant', async () => {
    svc.getCompletedTasks.mockResolvedValue([{ id: 'h1' }]);
    const res = await auth(request(app).get('/v1/task/history'));
    expect(res.status).toBe(200);
    expect(svc.getCompletedTasks).toHaveBeenCalledWith('flevoland');
  });

  it('500 on failure', async () => {
    svc.getCompletedTasks.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task/history'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TASK_HISTORY_FAILED');
  });
});

describe('GET /v1/task/:id', () => {
  it('returns a task in the caller tenant', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', processInstanceId: 'pi-1' });
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 't1' });
  });

  it('403 on a tenant mismatch', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'utrecht' });
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('404 when the task is not found', async () => {
    svc.getTask.mockRejectedValue(new Error('nope'));
    const res = await auth(request(app).get('/v1/task/t1'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });
});

describe('GET /v1/task/:id/variables', () => {
  it('flattens process variables to plain values', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', processInstanceId: 'pi-1' });
    svc.getProcessVariables.mockResolvedValue({ amount: { value: 42, type: 'Integer' } });
    const res = await auth(request(app).get('/v1/task/t1/variables'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ amount: 42 });
    expect(svc.getProcessVariables).toHaveBeenCalledWith('pi-1');
  });

  it('403 on a tenant mismatch', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'utrecht', processInstanceId: 'pi-1' });
    const res = await auth(request(app).get('/v1/task/t1/variables'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('500 when variables cannot be retrieved', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', processInstanceId: 'pi-1' });
    svc.getProcessVariables.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task/t1/variables'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TASK_VARIABLES_FAILED');
  });
});

describe('GET /v1/task/:id/form-schema', () => {
  beforeEach(() => svc.getTask.mockResolvedValue({ id: 't1' }));

  it('403 on a tenant mismatch', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'utrecht' });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('parses and returns a Camunda (JSON) form', async () => {
    svc.getDeployedTaskForm.mockResolvedValue({
      data: '{"components":[]}',
      contentType: 'application/json',
    });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ components: [] });
  });

  it('415 for an embedded HTML form', async () => {
    svc.getDeployedTaskForm.mockResolvedValue({ data: '<form/>', contentType: 'text/html' });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FORM_TYPE');
  });

  it('404 when the upstream returns a 404/400', async () => {
    svc.getDeployedTaskForm.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FORM_NOT_FOUND');
  });

  it('500 for other failures', async () => {
    svc.getDeployedTaskForm.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/task/t1/form-schema'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('FORM_FETCH_FAILED');
  });
});

describe('POST /v1/task/:id/claim', () => {
  it('403 on a tenant mismatch', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'utrecht' });
    const res = await auth(request(app).post('/v1/task/t1/claim'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('claims the task for the caller and audits', async () => {
    svc.getTask.mockResolvedValue({ id: 't1' });
    svc.claimTask.mockResolvedValue(undefined);
    const res = await auth(request(app).post('/v1/task/t1/claim'));
    expect(res.status).toBe(200);
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
    svc.getTask.mockResolvedValue({ id: 't1' });
    svc.claimTask.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/task/t1/claim'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TASK_CLAIM_FAILED');
  });
});

describe('POST /v1/task/:id/complete', () => {
  it('403 on a tenant mismatch', async () => {
    svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'utrecht' });
    const res = await auth(request(app).post('/v1/task/t1/complete')).send({ variables: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('infers variable types, completes the task, and audits', async () => {
    svc.getTask.mockResolvedValue({ id: 't1' });
    svc.completeTask.mockResolvedValue(undefined);

    const res = await auth(request(app).post('/v1/task/t1/complete')).send({
      variables: { amount: 5, name: 'x', done: true },
    });

    expect(res.status).toBe(200);
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
    svc.getTask.mockResolvedValue({ id: 't1' });
    svc.completeTask.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/task/t1/complete')).send({ variables: {} });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TASK_COMPLETE_FAILED');
  });
});
