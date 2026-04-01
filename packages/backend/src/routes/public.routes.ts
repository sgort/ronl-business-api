import { Router, Request, Response } from 'express';
import { createLogger } from '@utils/logger';
import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems, getBerichtById } from '@services/berichten.service';
import { getRegelcatalogusData } from '@services/regelcatalogus.service';
import axios from 'axios';
import { config } from '@utils/config';
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

/**
 * POST /v1/public/use-case
 * Receives a use-case submission from the IOU Architecture documentation site
 * and creates a GitLab work item. No authentication required — contributors
 * are external users without GitLab accounts.
 *
 * Body (JSON):
 *   title       string  — issue title (required)
 *   description string  — full markdown body (required)
 *
 * Response 201: { success: true, data: { iid, web_url } }
 * Response 400: missing required fields
 * Response 502: GitLab API unreachable or rejected the request
 */
router.post('/use-case', async (req: Request, res: Response) => {
  const { title, description } = req.body as { title?: string; description?: string };

  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'USE_CASE_INVALID',
        message: 'Both title and description are required.',
      },
    });
  }

  if (!config.gitlab.token) {
    logger.error('GitLab token not configured — cannot create use-case issue');
    return res.status(500).json({
      success: false,
      error: {
        code: 'GITLAB_NOT_CONFIGURED',
        message: 'Use-case submission is not configured on this server.',
      },
    });
  }

  try {
    const gitlabRes = await axios.post(
      `${config.gitlab.baseUrl}/api/v4/projects/${config.gitlab.projectPath}/issues`,
      {
        title: `[Use Case] ${title.trim()}`,
        description: description.trim(),
        labels: config.gitlab.ucLabel,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'PRIVATE-TOKEN': config.gitlab.token,
        },
        timeout: 10000,
        validateStatus: (status) => status < 500,
      }
    );

    if (gitlabRes.status !== 201) {
      logger.error('GitLab rejected use-case issue creation', {
        status: gitlabRes.status,
        response: gitlabRes.data,
      });
      return res.status(502).json({
        success: false,
        error: {
          code: 'GITLAB_ERROR',
          message: `GitLab returned ${gitlabRes.status}: ${JSON.stringify(gitlabRes.data)}`,
        },
      });
    }

    const { iid, web_url } = gitlabRes.data as { iid: number; web_url: string };

    logger.info('Use-case work item created', { iid, web_url });

    return res.status(201).json({
      success: true,
      data: { iid, web_url },
      meta: { generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create use-case work item', { error: message });
    return res.status(502).json({
      success: false,
      error: {
        code: 'GITLAB_UNREACHABLE',
        message: `Could not reach GitLab: ${message}`,
      },
    });
  }
});

export default router;
