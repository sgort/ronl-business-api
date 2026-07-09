/**
 * Unit tests for audit.middleware — the res.end wrapper that records audit
 * entries, plus createAuditLog / auditLog / getAuditLogs helpers.
 *
 * Note: the module registers a setInterval(pruneAuditQueue) at load. We enable
 * fake timers *before* requiring it so that timer never keeps Jest alive.
 */

import type { Request, Response } from 'express';

const mockConfig = { audit: { enabled: true, includeIp: true } };
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@services/audit.service', () => ({
  persistAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.useFakeTimers();
// require (not import) so the module — and its module-level setInterval — loads
// only after fake timers are active. eslint-disable is deliberate here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const audit = require('./audit.middleware') as typeof import('./audit.middleware');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { persistAuditLog } = require('@services/audit.service') as {
  persistAuditLog: jest.Mock;
};

afterAll(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.audit.enabled = true;
  mockConfig.audit.includeIp = true;
});

/** Minimal res double whose end/json the middleware will wrap. */
function makeRes(statusCode = 200) {
  return {
    statusCode,
    end: jest.fn(),
    json: jest.fn(),
  } as unknown as Response & { end: jest.Mock; json: jest.Mock };
}

const authCtx = {
  userId: 'u-1',
  tenantId: 'flevoland',
  azp: 'ronl-frontend',
  requestId: 'req-1',
  ipAddress: '9.9.9.9',
  userAgent: 'jest',
};

describe('createAuditLog', () => {
  it('is a no-op when auditing is disabled', () => {
    mockConfig.audit.enabled = false;
    audit.createAuditLog({ tenantId: 't', userId: 'u', action: 'X', result: 'success' });
    expect(persistAuditLog).not.toHaveBeenCalled();
  });

  it('queues the entry, stamps a timestamp, and persists it when enabled', () => {
    audit.createAuditLog({ tenantId: 't', userId: 'u', action: 'ACT', result: 'success' });
    expect(persistAuditLog).toHaveBeenCalledTimes(1);
    const last = audit.getAuditLogs(1)[0];
    expect(last).toMatchObject({ action: 'ACT' });
    expect(last.timestamp).toBeInstanceOf(Date);
  });
});

describe('auditMiddleware', () => {
  it('does not wrap the response when auditing is disabled', () => {
    mockConfig.audit.enabled = false;
    const req = {} as Request;
    const res = makeRes();
    const originalEnd = res.end;
    const next = jest.fn();
    audit.auditMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.end).toBe(originalEnd); // unwrapped
  });

  it('records a success entry with resourceType/resourceId derived from the path', () => {
    const req = {
      method: 'GET',
      path: '/edocs/workspaces/ws-1',
      query: {},
      user: { userId: 'u-1' },
      auth: authCtx,
    } as unknown as Request;
    const res = makeRes(200);
    audit.auditMiddleware(req, res, jest.fn());

    res.json({ ok: true });
    res.end();

    expect(persistAuditLog).toHaveBeenCalledTimes(1);
    expect(persistAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'GET /edocs/workspaces/ws-1',
      resourceType: 'workspaces',
      resourceId: 'ws-1',
      result: 'success',
      ipAddress: '9.9.9.9',
    });
  });

  it('marks 4xx as failure and extracts the error message from the body', () => {
    const req = {
      method: 'POST',
      path: '/edocs/documents',
      query: {},
      user: { userId: 'u-1' },
      auth: authCtx,
    } as unknown as Request;
    const res = makeRes(400);
    audit.auditMiddleware(req, res, jest.fn());

    res.json({ error: { message: 'MISSING_FIELDS' } });
    res.end();

    expect(persistAuditLog.mock.calls[0][0]).toMatchObject({
      result: 'failure',
      errorMessage: 'MISSING_FIELDS',
    });
  });

  it('leaves errorMessage undefined when a 5xx body has no error object', () => {
    const req = {
      method: 'GET',
      path: '/edocs/status',
      query: {},
      user: { userId: 'u-1' },
      auth: authCtx,
    } as unknown as Request;
    const res = makeRes(500);
    audit.auditMiddleware(req, res, jest.fn());
    res.json('plain string body');
    res.end();
    expect(persistAuditLog.mock.calls[0][0]).toMatchObject({
      result: 'error',
      errorMessage: undefined,
    });
  });

  it('omits ipAddress when includeIp is false', () => {
    mockConfig.audit.includeIp = false;
    const req = {
      method: 'GET',
      path: '/edocs/status',
      query: {},
      user: { userId: 'u-1' },
      auth: authCtx,
    } as unknown as Request;
    const res = makeRes(200);
    audit.auditMiddleware(req, res, jest.fn());
    res.end();
    expect(persistAuditLog.mock.calls[0][0].ipAddress).toBeUndefined();
  });

  it('skips auditing for /audit and /chat paths', () => {
    const req = {
      method: 'GET',
      path: '/chat',
      query: {},
      user: { userId: 'u-1' },
      auth: authCtx,
    } as unknown as Request;
    const res = makeRes(200);
    audit.auditMiddleware(req, res, jest.fn());
    res.end();
    expect(persistAuditLog).not.toHaveBeenCalled();
  });

  it('does not audit when the request is unauthenticated', () => {
    const req = { method: 'GET', path: '/edocs/status', query: {} } as unknown as Request;
    const res = makeRes(200);
    audit.auditMiddleware(req, res, jest.fn());
    res.end();
    expect(persistAuditLog).not.toHaveBeenCalled();
  });
});

describe('auditLog helper', () => {
  it('is a no-op without req.auth', () => {
    audit.auditLog({} as Request, 'ACTION', 'success');
    expect(persistAuditLog).not.toHaveBeenCalled();
  });

  it('records an explicit audit entry when req.auth is present', () => {
    const req = { auth: authCtx } as unknown as Request;
    audit.auditLog(req, 'MANUAL_ACTION', 'error', { extra: 1 });
    expect(persistAuditLog).toHaveBeenCalledTimes(1);
    expect(persistAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'MANUAL_ACTION',
      result: 'error',
    });
  });
});

describe('getAuditLogs', () => {
  it('returns at most the requested number of most-recent entries', () => {
    audit.createAuditLog({ tenantId: 't', userId: 'u', action: 'A1', result: 'success' });
    audit.createAuditLog({ tenantId: 't', userId: 'u', action: 'A2', result: 'success' });
    const last = audit.getAuditLogs(1);
    expect(last).toHaveLength(1);
    expect(last[0].action).toBe('A2');
  });
});

describe('pruneAuditQueue', () => {
  it('caps the in-memory queue at 1000 entries', () => {
    // Overfill past the cap (queue is module-level and may already hold entries).
    for (let i = 0; i < 1100; i++) {
      audit.createAuditLog({ tenantId: 't', userId: 'u', action: `bulk-${i}`, result: 'success' });
    }
    audit.pruneAuditQueue();
    expect(audit.getAuditLogs(5000).length).toBeLessThanOrEqual(1000);
    // Newest entry survives the prune.
    expect(audit.getAuditLogs(1)[0].action).toBe('bulk-1099');
  });
});
