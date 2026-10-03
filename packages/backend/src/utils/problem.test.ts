import type { Request, Response } from 'express';

import { buildProblem, sendProblem, titleFromCode } from './problem';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const mockReq = (originalUrl: string) => ({ originalUrl }) as Request;
const body = (res: Response) => (res.json as jest.Mock).mock.calls[0][0];

describe('sendProblem', () => {
  it('sets the status, content type, and the RFC 9457 members', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/process/K/start'), {
      status: 500,
      code: 'PROCESS_START_FAILED',
      detail: 'Failed to start process',
    });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(body(res)).toEqual({
      type: 'about:blank',
      status: 500,
      title: 'Process start failed',
      detail: 'Failed to start process',
      instance: '/v1/process/K/start',
      code: 'PROCESS_START_FAILED',
    });
  });

  it('strips the query string from instance', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/process/history?applicantId=x'), {
      status: 400,
      code: 'MISSING_PARAM',
      detail: 'applicantId is required',
    });
    expect(body(res).instance).toBe('/v1/process/history');
  });

  it('falls back to req.url, then to an empty instance', () => {
    const viaUrl = mockRes();
    sendProblem(viaUrl, { url: '/x?y=1' } as Request, { status: 404, detail: 'd' });
    expect(body(viaUrl).instance).toBe('/x');

    const none = mockRes();
    sendProblem(none, {} as Request, { status: 404, detail: 'd' });
    expect(body(none).instance).toBe('');
  });

  it('keeps extensions, but never lets them replace an RFC member', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/task/t/complete'), {
      status: 400,
      code: 'RESERVED_VARIABLE',
      detail: 'real detail',
      extensions: { reserved: ['municipality'], status: 999, detail: 'forged', code: 'X' },
    });
    expect(body(res)).toMatchObject({
      status: 400,
      detail: 'real detail',
      code: 'RESERVED_VARIABLE',
      reserved: ['municipality'],
    });
  });

  it('omits code when none is given, and titles by the status instead', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/x'), { status: 404, detail: 'gone' });
    expect(body(res)).not.toHaveProperty('code');
    expect(body(res).title).toBe('Not Found');
  });

  it('an explicit title and type win', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/x'), {
      status: 502,
      code: 'UPSTREAM',
      title: 'Upstream request failed',
      type: 'https://example.test/problems/upstream',
      detail: 'd',
    });
    expect(body(res)).toMatchObject({
      title: 'Upstream request failed',
      type: 'https://example.test/problems/upstream',
    });
  });

  it('titles a status Node does not know as "Error"', () => {
    expect(buildProblem('/x', { status: 599, detail: 'd' }).title).toBe('Error');
  });
});

describe('titleFromCode', () => {
  it.each([
    ['PROCESS_START_FAILED', 'Process start failed'],
    ['NOT_FOUND', 'Not found'],
    ['M2M_CLIENT_NOT_ALLOWED', 'M2m client not allowed'],
    ['UNAUTHORIZED', 'Unauthorized'],
    ['__ODD__CODE_', 'Odd code'],
  ])('%s -> %s', (code, title) => {
    expect(titleFromCode(code)).toBe(title);
  });

  it('is the same for the same code, every time', () => {
    expect(titleFromCode('TASK_COMPLETE_FAILED')).toBe(titleFromCode('TASK_COMPLETE_FAILED'));
  });
});
