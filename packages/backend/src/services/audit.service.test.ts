/**
 * Unit tests for audit.service — the durable half of the audit trail that
 * audit.middleware delegates to. pg-promise is mocked so no real DB is touched;
 * we assert the SQL parameter mapping and the resilience contract (a DB failure
 * is swallowed, never thrown).
 */

const mockDb = { none: jest.fn(), connect: jest.fn() };

jest.mock('pg-promise', () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn(() => mockDb)),
}));
jest.mock('@utils/config', () => ({
  config: { database: { url: 'postgres://x', poolMin: 2, poolMax: 10 } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { persistAuditLog, initDb } from './audit.service';
import type { AuditLogEntry } from '@/types/audit.types';

const baseEntry: AuditLogEntry = {
  timestamp: new Date('2026-01-01T00:00:00Z'),
  tenantId: 'flevoland',
  userId: 'u-1',
  action: 'POST /edocs/documents',
  result: 'success',
  requestId: 'req-1',
};

beforeEach(() => jest.clearAllMocks());

describe('persistAuditLog', () => {
  it('inserts a row with the mapped parameters', async () => {
    mockDb.none.mockResolvedValueOnce(undefined);
    await persistAuditLog({
      ...baseEntry,
      resourceType: 'documents',
      resourceId: 'doc-1',
      details: { statusCode: 200 },
      ipAddress: '9.9.9.9:54321',
      userAgent: 'jest',
    });

    expect(mockDb.none).toHaveBeenCalledTimes(1);
    const params = mockDb.none.mock.calls[0][1];
    expect(params).toMatchObject({
      tenantId: 'flevoland',
      userId: 'u-1',
      action: 'POST /edocs/documents',
      resourceType: 'documents',
      resourceId: 'doc-1',
      result: 'success',
    });
    // ipAddress has its :port stripped
    expect(params.ipAddress).toBe('9.9.9.9');
  });

  it('falls back tenantId to azp then to "unknown", and nulls optional fields', async () => {
    mockDb.none.mockResolvedValueOnce(undefined);
    await persistAuditLog({
      timestamp: new Date(),
      tenantId: undefined as unknown as string,
      azp: 'ronl-frontend',
      userId: 'u-1',
      action: 'X',
      result: 'success',
    });
    let params = mockDb.none.mock.calls[0][1];
    expect(params.tenantId).toBe('ronl-frontend');
    expect(params.resourceType).toBeNull();
    expect(params.resourceId).toBeNull();
    expect(params.userAgent).toBeNull();
    expect(params.ipAddress).toBeNull();

    mockDb.none.mockResolvedValueOnce(undefined);
    await persistAuditLog({
      timestamp: new Date(),
      tenantId: undefined as unknown as string,
      userId: 'u-1',
      action: 'X',
      result: 'success',
    });
    params = mockDb.none.mock.calls[1][1];
    expect(params.tenantId).toBe('unknown');
  });

  it('swallows a DB error instead of throwing', async () => {
    mockDb.none.mockRejectedValueOnce(new Error('connection refused'));
    await expect(persistAuditLog(baseEntry)).resolves.toBeUndefined();
  });
});

describe('initDb', () => {
  it('acquires and releases a connection on success', async () => {
    const done = jest.fn();
    mockDb.connect.mockResolvedValueOnce({ done });
    await initDb();
    expect(mockDb.connect).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the database is unavailable', async () => {
    mockDb.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(initDb()).resolves.toBeUndefined();
  });
});
