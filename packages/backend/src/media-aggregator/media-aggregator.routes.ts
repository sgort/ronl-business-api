/**
 * media-aggregator — HTTP surface. Mounts at /v1/media-aggregator.
 *
 * GET /search   → { articles: AggregatorArticle[] }   (the cockpit's only dependency)
 * GET /health   → { ok, cached }                       (ops)
 *
 * Auth: an optional M2M bearer key. When MEDIA_AGGREGATOR_ACCEPT_KEY is set, the
 * caller must send `Authorization: Bearer <key>`; the cockpit sends the value of
 * its own MEDIA_AGGREGATOR_API_KEY, so set both to the same secret. Unset in dev =
 * open (loopback only). This mirrors how every other connector authenticates to
 * its upstream, and keeps the HTTP seam intact so the aggregator can move to its
 * own deployment later without touching the cockpit.
 */

import express, { type Request, type Response } from 'express';
import { createLogger } from '@utils/logger';
import { searchArticles } from './search';
import { getArticles } from './store';

const router = express.Router();
const logger = createLogger('media-aggregator-routes');

function authorized(req: Request): boolean {
  const expected = process.env.MEDIA_AGGREGATOR_ACCEPT_KEY;
  if (!expected) return true; // open in dev
  const header = req.header('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token === expected;
}

router.get('/search', async (req: Request, res: Response) => {
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const articles = await searchArticles({
      region: typeof req.query.region === 'string' ? req.query.region : '',
      q: typeof req.query.q === 'string' ? req.query.q : '',
      sort: typeof req.query.sort === 'string' ? req.query.sort : 'published_at:desc',
      top: req.query.top != null ? Number(req.query.top) : 50,
    });
    res.json({ articles });
  } catch (err) {
    logger.error('search failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'search_failed' });
  }
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const articles = await getArticles();
    res.json({ ok: true, cached: articles.length });
  } catch {
    res.status(503).json({ ok: false });
  }
});

export default router;
