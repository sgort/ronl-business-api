/**
 * Route tests for /v1/public (no auth): content feeds (nieuws, berichten,
 * producten-diensten, regelcatalogus), the ALTCHA challenge, and the GitLab-backed
 * use-case / use-cases / upload-file / feedback endpoints. The rate limiter is a
 * passthrough; services, axios, altcha, and config are mocked.
 */

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('@utils/altcha', () => ({ createChallenge: jest.fn(), verifySolution: jest.fn() }));
jest.mock('@services/nieuws.service', () => ({ getNieuwsItems: jest.fn() }));
jest.mock('@services/berichten.service', () => ({
  getBerichtenItems: jest.fn(),
  getBerichtById: jest.fn(),
}));
jest.mock('@services/productenDiensten.service', () => ({ getProductenDienstenItems: jest.fn() }));
jest.mock('@services/regelcatalogus.service', () => ({ getRegelcatalogusData: jest.fn() }));
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), isAxiosError: () => false },
}));

const mockConfig = {
  altcha: { hmacKey: '' },
  gitlab: { token: '', baseUrl: 'https://git', projectPath: 'proj', ucLabel: 'uc::submitted' },
};
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import axios from 'axios';
import publicRouter from './public.routes';
import { createChallenge, verifySolution } from '@utils/altcha';
import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems, getBerichtById } from '@services/berichten.service';
import { getProductenDienstenItems } from '@services/productenDiensten.service';
import { getRegelcatalogusData } from '@services/regelcatalogus.service';

const mockAxios = axios as unknown as { post: jest.Mock; get: jest.Mock };
const m = {
  createChallenge: createChallenge as jest.Mock,
  verifySolution: verifySolution as jest.Mock,
  nieuws: getNieuwsItems as jest.Mock,
  berichten: getBerichtenItems as jest.Mock,
  berichtById: getBerichtById as jest.Mock,
  producten: getProductenDienstenItems as jest.Mock,
  regels: getRegelcatalogusData as jest.Mock,
};

const app = express();
app.use(express.json());
app.use('/v1/public', publicRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.altcha.hmacKey = '';
  mockConfig.gitlab.token = '';
  delete process.env.GITLAB_TOKEN;
  delete process.env.GITLAB_PROJECT_PATH;
});

describe('content feeds', () => {
  it('GET /nieuws returns items + pagination', async () => {
    m.nieuws.mockResolvedValue({ items: [{ id: '1' }], total: 1 });
    const res = await request(app).get('/v1/public/nieuws');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([{ id: '1' }]);
    expect(res.body.data.pagination).toMatchObject({ limit: 10, offset: 0, total: 1 });
  });

  it('GET /nieuws → 500 on failure', async () => {
    m.nieuws.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/nieuws')).status).toBe(500);
  });

  it('GET /berichten returns items', async () => {
    m.berichten.mockResolvedValue({ items: [{ id: 'b' }], total: 1 });
    const res = await request(app).get('/v1/public/berichten');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });

  it('GET /berichten → 500 on failure', async () => {
    m.berichten.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/berichten')).status).toBe(500);
  });

  it('GET /berichten/:id returns a bericht or 404', async () => {
    m.berichtById.mockReturnValueOnce({ id: 'b1', subject: 'Hi' });
    expect((await request(app).get('/v1/public/berichten/b1')).status).toBe(200);
    m.berichtById.mockReturnValueOnce(null);
    const res = await request(app).get('/v1/public/berichten/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BERICHT_NOT_FOUND');
  });

  it('GET /producten-diensten returns items', async () => {
    m.producten.mockResolvedValue({ items: [{ id: 'p' }], total: 1 });
    expect((await request(app).get('/v1/public/producten-diensten')).status).toBe(200);
  });

  it('GET /producten-diensten → 500 on failure', async () => {
    m.producten.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/producten-diensten')).status).toBe(500);
  });

  it('GET /regelcatalogus returns data', async () => {
    m.regels.mockResolvedValue({ services: [], organizations: [], concepts: [], rules: [] });
    const res = await request(app).get('/v1/public/regelcatalogus');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('services');
  });

  it('GET /regelcatalogus → 500 on failure', async () => {
    m.regels.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/regelcatalogus')).status).toBe(500);
  });
});

describe('GET /altcha/challenge', () => {
  it('503 when ALTCHA is not configured', async () => {
    const res = await request(app).get('/v1/public/altcha/challenge');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ALTCHA_NOT_CONFIGURED');
  });

  it('returns a challenge when configured', async () => {
    mockConfig.altcha.hmacKey = 'secret';
    m.createChallenge.mockResolvedValue({ challenge: 'abc', salt: 's' });
    const res = await request(app).get('/v1/public/altcha/challenge');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ challenge: 'abc', salt: 's' });
  });

  it('500 when challenge generation fails', async () => {
    mockConfig.altcha.hmacKey = 'secret';
    m.createChallenge.mockRejectedValue(new Error('boom'));
    expect((await request(app).get('/v1/public/altcha/challenge')).status).toBe(500);
  });
});

describe('POST /use-case', () => {
  it('400 when title/description are missing', async () => {
    const res = await request(app).post('/v1/public/use-case').send({ title: 'only title' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('USE_CASE_INVALID');
  });

  it('500 when GitLab is not configured', async () => {
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('GITLAB_NOT_CONFIGURED');
  });

  it('201 with the created issue', async () => {
    mockConfig.gitlab.token = 'tok';
    mockAxios.post.mockResolvedValue({ status: 201, data: { iid: 5, web_url: 'http://x/5' } });
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ iid: 5, web_url: 'http://x/5' });
  });

  it('502 when GitLab rejects the creation', async () => {
    mockConfig.gitlab.token = 'tok';
    mockAxios.post.mockResolvedValue({ status: 400, data: { message: 'bad' } });
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GITLAB_ERROR');
  });

  it('502 when GitLab is unreachable', async () => {
    mockConfig.gitlab.token = 'tok';
    mockAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GITLAB_UNREACHABLE');
  });
});

describe('GET /use-cases', () => {
  it('503 when GitLab env is missing', async () => {
    const res = await request(app).get('/v1/public/use-cases');
    expect(res.status).toBe(503);
  });

  it('maps GitLab issues when configured', async () => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
    mockAxios.get.mockResolvedValue({
      data: [
        {
          iid: 1,
          title: 'Issue',
          state: 'opened',
          assignees: [{ name: 'Alice' }],
        },
      ],
    });
    const res = await request(app).get('/v1/public/use-cases?state=opened');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ iid: 1, assignees: ['Alice'], description: '' });
  });

  it('500 when the GitLab listing fails', async () => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
    mockAxios.get.mockRejectedValue(new Error('boom'));
    expect((await request(app).get('/v1/public/use-cases')).status).toBe(500);
  });
});

describe('verifyAltcha (via /use-case, hmacKey set)', () => {
  beforeEach(() => {
    mockConfig.altcha.hmacKey = 'secret';
    mockConfig.gitlab.token = 'tok';
  });

  it('400 ALTCHA_MISSING when the token is absent', async () => {
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALTCHA_MISSING');
  });

  it('400 ALTCHA_INVALID when verification fails', async () => {
    m.verifySolution.mockResolvedValue(false);
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D', altcha: 'tok' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALTCHA_INVALID');
  });

  it('400 ALTCHA_ERROR when verification throws', async () => {
    m.verifySolution.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D', altcha: 'tok' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALTCHA_ERROR');
  });

  it('passes through to the handler when the solution is valid', async () => {
    m.verifySolution.mockResolvedValue(true);
    mockAxios.post.mockResolvedValue({ status: 201, data: { iid: 7, web_url: 'http://x/7' } });
    const res = await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D', altcha: 'tok' });
    expect(res.status).toBe(201);
  });
});

describe('GitLab upload success paths', () => {
  beforeEach(() => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
  });

  it('upload-file returns the GitLab markdown for an uploaded image', async () => {
    mockAxios.post.mockResolvedValue({ data: { markdown: '![test](/uploads/x.png)' } });
    const res = await request(app)
      .post('/v1/public/upload-file')
      .attach('file', Buffer.from('img'), { filename: 'test.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.markdown).toBe('![test](/uploads/x.png)');
  });

  it('feedback creates an issue from the submitted fields', async () => {
    mockAxios.post.mockResolvedValue({ data: { iid: 9, web_url: 'http://x/9' } });
    const res = await request(app)
      .post('/v1/public/feedback')
      .send({ name: 'Bob', contact: 'bob@x.nl', description: 'It broke' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ iid: 9, web_url: 'http://x/9' });
  });

  it('feedback → 500 when GitLab submission fails', async () => {
    mockAxios.post.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/v1/public/feedback')
      .send({ name: 'Bob', contact: 'bob@x.nl', description: 'It broke' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('FEEDBACK_SUBMIT_FAILED');
  });
});

describe('POST /upload-file and /feedback (validation branches)', () => {
  it('upload-file → 503 when GitLab env is missing', async () => {
    const res = await request(app).post('/v1/public/upload-file').send({});
    expect(res.status).toBe(503);
  });

  it('upload-file → 400 when no file is provided', async () => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
    const res = await request(app).post('/v1/public/upload-file').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
  });

  it('feedback → 503 when GitLab env is missing', async () => {
    const res = await request(app).post('/v1/public/feedback').send({});
    expect(res.status).toBe(503);
  });

  it('feedback → 400 when required fields are missing', async () => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
    const res = await request(app).post('/v1/public/feedback').send({ name: 'Bob' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
  });
});
