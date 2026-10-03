import { describe, it, expect } from 'vitest';
import { isProblem, toApiResponse, problemMessage } from './problem';

const problem = {
  type: 'about:blank',
  status: 403,
  title: 'Tenant mismatch',
  detail: 'Access denied',
  instance: '/v1/task/abc',
  code: 'TENANT_MISMATCH',
  details: 'task belongs to another municipality',
  engine: 'https://engine.example/engine-rest',
};

describe('isProblem', () => {
  it('accepts an RFC 9457 body', () => {
    expect(isProblem(problem)).toBe(true);
  });

  it('accepts a problem whose detail is present but undefined', () => {
    expect(isProblem({ status: 500, title: 'Internal error', detail: undefined })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'Access denied'],
    ['a number', 403],
    ['the legacy envelope', { success: false, error: { code: 'X', message: 'y' } }],
    ['a string status', { status: '403', title: 't', detail: 'd' }],
    ['a missing title', { status: 403, detail: 'd' }],
    ['a missing detail', { status: 403, title: 't' }],
  ])('rejects %s', (_label, body) => {
    expect(isProblem(body)).toBe(false);
  });
});

describe('toApiResponse', () => {
  it('maps a problem onto the legacy ApiResponse error', () => {
    const result = toApiResponse(problem) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toEqual({
      code: 'TENANT_MISMATCH',
      message: 'Access denied',
      details: 'task belongs to another municipality',
      instance: 'https://engine.example/engine-rest',
    });
  });

  it('keeps the problem members and extension members alongside', () => {
    const health = { data: { name: 'api', status: 'unhealthy' } };
    const result = toApiResponse({ ...problem, ...health }) as Record<string, unknown>;
    expect(result.data).toEqual(health.data);
    expect(result.status).toBe(403);
    expect(result.instance).toBe('/v1/task/abc');
  });

  it('defaults the code to ERROR when the problem has none', () => {
    const result = toApiResponse({ status: 500, title: 'Internal', detail: 'boom' }) as {
      error: { code: string; details?: string; instance?: string };
    };
    expect(result.error.code).toBe('ERROR');
    expect(result.error.details).toBeUndefined();
    expect(result.error.instance).toBeUndefined();
  });

  it('passes a non-problem body through unchanged', () => {
    const legacy = { success: false, error: { code: 'X', message: 'y' } };
    expect(toApiResponse(legacy)).toBe(legacy);
    expect(toApiResponse('<html>Bad gateway</html>')).toBe('<html>Bad gateway</html>');
    expect(toApiResponse(undefined)).toBeUndefined();
  });
});

describe('problemMessage', () => {
  it("returns a problem's detail", () => {
    expect(problemMessage(problem, 'fallback')).toBe('Access denied');
  });

  it("returns a legacy envelope's error.message", () => {
    expect(problemMessage({ success: false, error: { message: 'Server fout' } }, 'x')).toBe(
      'Server fout'
    );
  });

  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['an empty problem detail', { status: 500, title: 't', detail: '' }],
    ['a non-string problem detail', { status: 500, title: 't', detail: 42 }],
    ['an envelope without error', { success: false }],
    ['an envelope with a null error', { success: false, error: null }],
    ['an envelope with a non-string message', { error: { message: 7 } }],
    ['an envelope with an empty message', { error: { message: '' } }],
  ])('falls back for %s', (_label, body) => {
    expect(problemMessage(body, 'HTTP 500')).toBe('HTTP 500');
  });
});
