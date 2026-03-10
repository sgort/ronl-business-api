import { Router, Request, Response } from 'express';
import { createLogger } from '@utils/logger';
import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems, getBerichtById } from '@services/berichten.service';

const router = Router();
const logger = createLogger('public-routes');

function meta() {
  return {
    generatedAt: new Date().toISOString(),
  };
}

/**
 * GET /v1/public/nieuws
 * Public national news from Rijksoverheid — no authentication required.
 */
router.get('/nieuws', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 20);
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

  try {
    const { items, total } = await getNieuwsItems(limit, offset);
    res.json({
      success: true,
      data: {
        items,
        pagination: { limit, offset, total, hasMore: offset + limit < total },
      },
      meta: meta(),
    });
  } catch (error) {
    logger.error('Failed to serve nieuws', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'NIEUWS_FETCH_FAILED', message: 'Nieuws kon niet worden opgehaald.' },
    });
  }
});

/**
 * GET /v1/public/berichten
 * Public platform announcements — no authentication required.
 */
router.get('/berichten', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 20);
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

  const { items, total } = getBerichtenItems(limit, offset);
  res.json({
    success: true,
    data: {
      items,
      pagination: { limit, offset, total, hasMore: offset + limit < total },
    },
    meta: meta(),
  });
});

/**
 * GET /v1/public/berichten/:id
 */
router.get('/berichten/:id', (req: Request, res: Response) => {
  const item = getBerichtById(req.params.id);
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'BERICHT_NOT_FOUND', message: 'Bericht niet gevonden.' },
    });
  }
  res.json({ success: true, data: item, meta: meta() });
});

export default router;
