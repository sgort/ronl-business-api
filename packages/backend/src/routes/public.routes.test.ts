/**
 * Route tests for /v1/public (no auth): content feeds (nieuws, berichten,
 * producten-diensten, regelcatalogus), the ALTCHA challenge, and the GitLab-backed
 * use-case / use-cases / upload-file / feedback endpoints. The rate limiter is a
 * passthrough; services, axios, altcha, and config are mocked.
 */

// Passthrough middleware, but keep the options each limiter was built with so
// the keyGenerator can be exercised — the real library is what would call it.
const mockRateLimitOptions: Array<Record<string, unknown>> = [];
jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: (opts: Record<string, unknown>) => {
    mockRateLimitOptions.push(opts);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));
jest.mock('@utils/altcha', () => ({ createChallenge: jest.fn(), verifySolution: jest.fn() }));
jest.mock('@services/nieuws.service', () => ({ getNieuwsItems: jest.fn() }));
jest.mock('@services/berichten.service', () => ({
  getBerichtenItems: jest.fn(),
  getBerichtById: jest.fn(),
}));
jest.mock('@services/productenDiensten.service', () => ({ getProductenDienstenItems: jest.fn() }));
jest.mock('@services/regelcatalogus.service', () => ({
  getRegelcatalogusData: jest.fn(),
  getRegelcatalogusCacheInfo: jest.fn(() => ({ cached: false, fetchedAt: null, ageMs: null })),
}));
jest.mock('@services/lde.service', () => ({
  getPublicProcesses: jest.fn(),
  getPublicProcessByKey: jest.fn(),
}));
jest.mock('@services/search.service', () => ({
  getPublicIndex: jest.fn(),
  searchPublicIndex: jest.fn(),
  facetCounts: jest.fn(),
  getPublicItemBySlug: jest.fn(),
}));
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
import { getPublicProcesses, getPublicProcessByKey } from '@services/lde.service';
import {
  getPublicIndex,
  searchPublicIndex,
  facetCounts,
  getPublicItemBySlug,
} from '@services/search.service';

const mockAxios = axios as unknown as { post: jest.Mock; get: jest.Mock };
const m = {
  createChallenge: createChallenge as jest.Mock,
  verifySolution: verifySolution as jest.Mock,
  nieuws: getNieuwsItems as jest.Mock,
  berichten: getBerichtenItems as jest.Mock,
  berichtById: getBerichtById as jest.Mock,
  producten: getProductenDienstenItems as jest.Mock,
  regels: getRegelcatalogusData as jest.Mock,
  processenList: getPublicProcesses as jest.Mock,
  processByKey: getPublicProcessByKey as jest.Mock,
  index: getPublicIndex as jest.Mock,
  doSearch: searchPublicIndex as jest.Mock,
  facets: facetCounts as jest.Mock,
  bySlug: getPublicItemBySlug as jest.Mock,
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

  it('GET /regelcatalogus?refresh=true forces a cache-bypassing refresh', async () => {
    m.regels.mockResolvedValue({ services: [], organizations: [], concepts: [], rules: [] });
    await request(app).get('/v1/public/regelcatalogus?refresh=true');
    expect(m.regels).toHaveBeenCalledWith(true);
  });

  it('GET /regelcatalogus without refresh does not force', async () => {
    m.regels.mockResolvedValue({ services: [], organizations: [], concepts: [], rules: [] });
    await request(app).get('/v1/public/regelcatalogus');
    expect(m.regels).toHaveBeenCalledWith(false);
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

describe('GET /processen', () => {
  it('returns the public process list', async () => {
    m.processenList.mockResolvedValue([{ key: 'zorgtoeslag-process', naam: 'Zorgtoeslag' }]);
    const res = await request(app).get('/v1/public/processen');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ key: 'zorgtoeslag-process', naam: 'Zorgtoeslag' }]);
  });

  it('500 on failure', async () => {
    m.processenList.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/processen')).status).toBe(500);
  });
});

describe('GET /processen/:key', () => {
  it('returns a process or 404', async () => {
    m.processByKey.mockResolvedValueOnce({ key: 'zorgtoeslag-process', naam: 'Zorgtoeslag' });
    expect((await request(app).get('/v1/public/processen/zorgtoeslag-process')).status).toBe(200);
    m.processByKey.mockResolvedValueOnce(null);
    const res = await request(app).get('/v1/public/processen/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROCES_NOT_FOUND');
  });
});

describe('GET /zoeken', () => {
  it('returns hits + facets computed on the base (pre-facet-filter) query', async () => {
    const indexed = [{ id: 'a', type: 'regel', org: 'X', audience: ['Inwoner'] }];
    m.index.mockResolvedValue(indexed);
    m.doSearch.mockReturnValue(indexed);
    m.facets.mockReturnValue([['X', 1]]);

    const res = await request(app).get('/v1/public/zoeken?q=zorg&soort=regel');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual(indexed);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.facets).toHaveProperty('soort');
    expect(res.body.data.facets).toHaveProperty('bron');
    expect(res.body.data.facets).toHaveProperty('doelgroep');
    // facets are computed on the query WITHOUT the facet filters (base), called twice:
    // once for hits (with filters) and once for facets (sort-only)
    expect(m.doSearch).toHaveBeenCalledWith(indexed, 'zorg', { sort: undefined });
    expect(m.doSearch).toHaveBeenCalledWith(indexed, 'zorg', {
      types: ['regel'],
      orgs: undefined,
      audience: undefined,
      sort: undefined,
    });
  });

  it('500 on failure', async () => {
    m.index.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/zoeken')).status).toBe(500);
  });
});

describe('GET /nieuws/:slug, /producten/:slug, /regels/:slug', () => {
  it('returns the item when found', async () => {
    m.index.mockResolvedValue([]);
    m.bySlug.mockReturnValue({ id: 'nieuws-n1', slug: 'n1', type: 'nieuws', title: 'X' });
    const res = await request(app).get('/v1/public/nieuws/n1');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('X');
  });

  it('404 when not found', async () => {
    m.index.mockResolvedValue([]);
    m.bySlug.mockReturnValue(undefined);
    const res = await request(app).get('/v1/public/regels/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('500 on failure', async () => {
    m.index.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/producten/x')).status).toBe(500);
  });
});

describe('the public write rate limiter', () => {
  it('buckets submissions per client IP, with a shared bucket for unknown ones', () => {
    // express-rate-limit is a passthrough here, so the keyGenerator is only ever
    // reached through the captured options.
    const keyGenerator = mockRateLimitOptions[0]?.['keyGenerator'] as (r: {
      ip?: string;
    }) => string;
    expect(typeof keyGenerator).toBe('function');
    expect(keyGenerator({ ip: '203.0.113.7' })).toBe('203.0.113.7');
    expect(keyGenerator({})).toBe('unknown');
  });
});

describe('GET /zoeken facet selectors', () => {
  it('counts soort by type, bron by org and doelgroep by audience', async () => {
    const indexed = [{ id: 'a', type: 'regel', org: 'SVB', audience: ['Inwoner'] }];
    m.index.mockResolvedValue(indexed);
    m.doSearch.mockReturnValue(indexed);
    m.facets.mockReturnValue([]);

    await request(app).get('/v1/public/zoeken?q=zorg');

    // facetCounts is mocked, so the selectors it would apply are only reachable
    // through the recorded calls — one per facet, in declaration order.
    const [soort, bron, doelgroep] = m.facets.mock.calls.map(
      (c: unknown[]) => c[1] as (i: (typeof indexed)[number]) => unknown
    );
    expect(soort(indexed[0])).toBe('regel');
    expect(bron(indexed[0])).toBe('SVB');
    expect(doelgroep(indexed[0])).toEqual(['Inwoner']);
  });
});

describe('POST /use-case GitLab call options', () => {
  it('treats a GitLab 4xx as a response to inspect, not an exception', async () => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
    mockConfig.gitlab.token = 'tok';
    mockAxios.post.mockResolvedValue({ status: 201, data: { iid: 1, web_url: 'http://x/1' } });

    await request(app)
      .post('/v1/public/use-case')
      .send({ title: 'T', description: 'D', altcha: 'tok' });

    const options = mockAxios.post.mock.calls[0][2] as {
      validateStatus: (s: number) => boolean;
    };
    // The handler checks gitlabRes.status itself, so 4xx must resolve rather
    // than throw; 5xx stays an exception for the catch to log.
    expect(options.validateStatus(400)).toBe(true);
    expect(options.validateStatus(404)).toBe(true);
    expect(options.validateStatus(500)).toBe(false);
  });
});

describe('POST /feedback screenshot filtering', () => {
  beforeEach(() => {
    process.env.GITLAB_TOKEN = 'tok';
    process.env.GITLAB_PROJECT_PATH = 'proj';
  });

  it('uploads an attached image', async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: { markdown: '![shot](/uploads/a.png)' } })
      .mockResolvedValueOnce({ data: { iid: 9, web_url: 'http://x/9' } });

    const res = await request(app)
      .post('/v1/public/feedback')
      .field('name', 'Bob')
      .field('contact', 'bob@x.nl')
      .field('description', 'It broke')
      .attach('screenshots', Buffer.from('img'), {
        filename: 'shot.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    // One upload call for the screenshot, one create call for the issue.
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
    expect(mockAxios.post.mock.calls[0][0]).toContain('/uploads');
  });

  it('drops a non-image attachment instead of uploading it', async () => {
    mockAxios.post.mockResolvedValue({ data: { iid: 9, web_url: 'http://x/9' } });

    const res = await request(app)
      .post('/v1/public/feedback')
      .field('name', 'Bob')
      .field('contact', 'bob@x.nl')
      .field('description', 'It broke')
      .attach('screenshots', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    // Only the issue-creation call — the .txt never reached GitLab.
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(mockAxios.post.mock.calls[0][0]).not.toContain('/uploads');
  });
});
