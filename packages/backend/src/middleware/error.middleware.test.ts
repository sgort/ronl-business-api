jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@utils/config', () => ({ config: { nodeEnv: 'development' } }));

import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import { config } from '@utils/config';
import { errorHandler, notFoundHandler, rateLimitHandler } from './error.middleware';

function appWith(route: (app: express.Express) => void) {
  const app = express();
  app.use(express.json({ limit: '100b' }));
  route(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const problem = (res: request.Response) => {
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  return res.body;
};

describe('notFoundHandler', () => {
  it('answers 404 NOT_FOUND for a path nothing serves', async () => {
    const res = await request(appWith(() => {})).get('/v1/nowhere?x=1');
    expect(res.status).toBe(404);
    expect(problem(res)).toEqual({
      type: 'about:blank',
      status: 404,
      title: 'Not found',
      detail: 'Endpoint not found',
      instance: '/v1/nowhere',
      code: 'NOT_FOUND',
    });
  });
});

describe('errorHandler', () => {
  const echo = (app: express.Express) => app.post('/echo', (req, res) => res.json(req.body));

  it('answers 400 MALFORMED_BODY for JSON that does not parse, not 500', async () => {
    const res = await request(appWith(echo))
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"not json');
    expect(res.status).toBe(400);
    expect(problem(res)).toMatchObject({ code: 'MALFORMED_BODY', instance: '/echo' });
  });

  it('answers 413 PAYLOAD_TOO_LARGE for a body over the limit', async () => {
    const res = await request(appWith(echo))
      .post('/echo')
      .send({ big: 'x'.repeat(500) });
    expect(res.status).toBe(413);
    expect(problem(res).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('keeps the status body-parser chose for the rarer body errors', async () => {
    const res = await request(appWith(echo))
      .post('/echo')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');
    expect(res.status).toBe(415);
    expect(problem(res).code).toBe('INVALID_BODY');
  });

  it('falls back to statusCode, then 400, for a body error without status', () => {
    const json = jest.fn();
    const res = { status: jest.fn(), type: jest.fn(), json } as unknown as Response;
    (res.status as jest.Mock).mockReturnValue(res);
    (res.type as jest.Mock).mockReturnValue(res);
    const req = { originalUrl: '/x', path: '/x' } as Request;
    const next = jest.fn() as NextFunction;

    errorHandler(
      Object.assign(new Error('a'), { type: 'request.aborted', statusCode: 413 }),
      req,
      res,
      next
    );
    errorHandler(Object.assign(new Error('b'), { type: 'request.aborted' }), req, res, next);
    expect((res.status as jest.Mock).mock.calls).toEqual([[413], [400]]);
  });

  it('does not let an arbitrary error choose its status', async () => {
    const res = await request(
      appWith((app) =>
        app.get('/boom', () => {
          throw Object.assign(new Error('kaboom'), { status: 418 });
        })
      )
    ).get('/boom');
    expect(res.status).toBe(500);
    expect(problem(res)).toMatchObject({ code: 'INTERNAL_ERROR', detail: 'kaboom' });
  });

  it('hides the message in production', async () => {
    (config as { nodeEnv: string }).nodeEnv = 'production';
    try {
      const res = await request(
        appWith((app) =>
          app.get('/boom', () => {
            throw new Error('secret internals');
          })
        )
      ).get('/boom');
      expect(problem(res).detail).toBe('Internal server error');
    } finally {
      (config as { nodeEnv: string }).nodeEnv = 'development';
    }
  });
});

describe('rateLimitHandler', () => {
  it('answers 429 RATE_LIMIT_EXCEEDED', async () => {
    const res = await request(appWith((app) => app.get('/limited', rateLimitHandler))).get(
      '/limited'
    );
    expect(res.status).toBe(429);
    expect(problem(res)).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', status: 429 });
  });
});
