import { Router, Request, Response } from 'express';
import { createLogger } from '@utils/logger';
import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems, getBerichtById } from '@services/berichten.service';
import { getRegelcatalogusData } from '@services/regelcatalogus.service';
import { getProductenDienstenItems } from '@services/productenDiensten.service';

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
 * Public announcements from Provincie Flevoland RSS — no authentication required.
 */
router.get('/berichten', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 20);
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

  try {
    const { items, total } = await getBerichtenItems(limit, offset);
    res.json({
      success: true,
      data: {
        items,
        pagination: { limit, offset, total, hasMore: offset + limit < total },
      },
      meta: meta(),
    });
  } catch (error) {
    logger.error('Failed to serve berichten', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'BERICHTEN_FETCH_FAILED', message: 'Berichten konden niet worden opgehaald.' },
    });
  }
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

/**
 * GET /v1/public/producten-diensten
 * Provincie Flevoland products & services from SC4.0 feed — no authentication required.
 */
router.get('/producten-diensten', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

  try {
    const { items, total } = await getProductenDienstenItems(limit, offset);
    res.json({
      success: true,
      data: {
        items,
        pagination: { limit, offset, total, hasMore: offset + limit < total },
      },
      meta: meta(),
    });
  } catch (error) {
    logger.error('Failed to serve producten-diensten', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'PRODUCTEN_DIENSTEN_FETCH_FAILED',
        message: 'Producten & diensten konden niet worden opgehaald.',
      },
    });
  }
});

/**
 * GET /v1/public/regelcatalogus
 * Linked Data catalog — services, organisations, and concepts from TriplyDB.
 * No authentication required. Cached 5 minutes server-side.
 */
router.get('/regelcatalogus', async (_req: Request, res: Response) => {
  try {
    const data = await getRegelcatalogusData();
    res.json({
      success: true,
      data,
      meta: meta(),
    });
  } catch (error) {
    logger.error('Failed to serve regelcatalogus', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'REGELCATALOGUS_FETCH_FAILED',
        message: 'Regelcatalogus kon niet worden opgehaald.',
      },
    });
  }
});

export default router;
