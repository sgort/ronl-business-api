/**
 * Route tests for /v1/media-aggregator — the optional bearer-key gate, GET /search
 * (query forwarding + 500), and GET /health. searchArticles and getArticles are mocked.
 */

jest.mock('./search', () => ({ searchArticles: jest.fn() }));
jest.mock('./store', () => ({ getArticles: jest.fn() }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import mediaRouter from './media-aggregator.routes';
import { searchArticles } from './search';
import { getArticles } from './store';

const mockSearch = searchArticles as jest.Mock;
const mockGetArticles = getArticles as jest.Mock;

const app = express();
app.use('/v1/media-aggregator', mediaRouter);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MEDIA_AGGREGATOR_ACCEPT_KEY;
});

describe('GET /search — auth gate', () => {
  it('is open when no accept key is configured', async () => {
    mockSearch.mockResolvedValue([{ id: 'a' }]);
    const res = await request(app).get('/v1/media-aggregator/search');
    expect(res.status).toBe(200);
    expect(res.body.articles).toEqual([{ id: 'a' }]);
  });

  it('401s a missing/incorrect bearer when a key is configured', async () => {
    process.env.MEDIA_AGGREGATOR_ACCEPT_KEY = 'secret';
    expect((await request(app).get('/v1/media-aggregator/search')).status).toBe(401);
    const wrong = await request(app)
      .get('/v1/media-aggregator/search')
      .set('Authorization', 'Bearer nope');
    expect(wrong.status).toBe(401);
  });

  it('accepts the correct bearer', async () => {
    process.env.MEDIA_AGGREGATOR_ACCEPT_KEY = 'secret';
    mockSearch.mockResolvedValue([]);
    const res = await request(app)
      .get('/v1/media-aggregator/search')
      .set('Authorization', 'Bearer secret');
    expect(res.status).toBe(200);
  });
});

describe('GET /search — behaviour', () => {
  it('forwards the parsed query params to searchArticles', async () => {
    mockSearch.mockResolvedValue([]);
    await request(app).get(
      '/v1/media-aggregator/search?region=Flevoland&q=stikstof&sort=published_at:desc&top=25'
    );
    expect(mockSearch).toHaveBeenCalledWith({
      region: 'Flevoland',
      q: 'stikstof',
      sort: 'published_at:desc',
      top: 25,
    });
  });

  it('500s when the search fails', async () => {
    mockSearch.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/v1/media-aggregator/search');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('search_failed');
  });
});

describe('GET /health', () => {
  it('reports the cached article count', async () => {
    mockGetArticles.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const res = await request(app).get('/v1/media-aggregator/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cached: 2 });
  });

  it('503s when the store fails', async () => {
    mockGetArticles.mockRejectedValue(new Error('down'));
    const res = await request(app).get('/v1/media-aggregator/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false });
  });
});
