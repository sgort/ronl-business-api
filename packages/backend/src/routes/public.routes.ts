import { Router, Request, Response } from 'express';
import { createLogger } from '@utils/logger';
import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems, getBerichtById } from '@services/berichten.service';
import { getRegelcatalogusData } from '@services/regelcatalogus.service';
import axios from 'axios';
import { config } from '@utils/config';
import { getProductenDienstenItems } from '@services/productenDiensten.service';
import multer from 'multer';
import FormData from 'form-data';
import rateLimit from 'express-rate-limit';

// Used by /feedback — images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

// Allowed MIME types for use-case attachments (documents, images, diagrams)
const ALLOWED_UPLOAD_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/xml',
  'text/xml',
]);
const ALLOWED_UPLOAD_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|pdf|txt|docx?|odt|xlsx?|xml)$/i;

// Used by /upload-file — document/image types only (no executables, scripts, or HTML)
const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const mimeOk = ALLOWED_UPLOAD_MIMETYPES.has(file.mimetype);
    const extOk = ALLOWED_UPLOAD_EXTENSIONS.test(file.originalname);
    cb(null, mimeOk && extOk);
  },
});

// Strict rate limiter for unauthenticated write endpoints that touch GitLab
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many submissions, please try again later.',
    },
  },
  keyGenerator: (req) => req.ip || 'unknown',
});

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
router.post('/use-case', publicWriteLimiter, async (req: Request, res: Response) => {
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

/**
 * POST /v1/public/upload-file
 * Uploads a single file to the GitLab project and returns the markdown reference.
 * Used by the use-case form to pre-upload attachments before JSON submission.
 * No authentication required.
 */
router.post(
  '/upload-file',
  publicWriteLimiter,
  uploadAny.single('file'),
  async (req: Request, res: Response) => {
    const token = process.env.GITLAB_TOKEN;
    const projectPath = process.env.GITLAB_PROJECT_PATH;
    const gitlabBase = process.env.GITLAB_BASE_URL ?? 'https://git.open-regels.nl';

    if (!token || !projectPath) {
      return res.status(503).json({
        success: false,
        error: { code: 'GITLAB_NOT_CONFIGURED', message: 'GitLab integration is not configured.' },
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided.' },
      });
    }

    try {
      const form = new FormData();
      form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
      const uploadRes = await axios.post(
        `${gitlabBase}/api/v4/projects/${projectPath}/uploads`,
        form,
        { headers: { 'PRIVATE-TOKEN': token, ...form.getHeaders() }, timeout: 15_000 }
      );
      const { markdown } = uploadRes.data as { markdown: string };
      return res.json({ success: true, data: { markdown } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to upload file to GitLab', { error: message });
      return res.status(502).json({
        success: false,
        error: { code: 'GITLAB_UNREACHABLE', message: `Could not reach GitLab: ${message}` },
      });
    }
  }
);

/**
 * GET /v1/public/use-cases
 * List GitLab issues for the IOU Architecture project.
 * Query param: state=opened (default) | closed
 * No authentication required — read-only public view.
 */
router.get('/use-cases', async (req: Request, res: Response) => {
  const token = process.env.GITLAB_TOKEN;
  const projectPath = process.env.GITLAB_PROJECT_PATH;
  const gitlabBase = process.env.GITLAB_BASE_URL ?? 'https://git.open-regels.nl';

  if (!token || !projectPath) {
    logger.error('GitLab env vars missing for use-cases listing');
    return res.status(503).json({
      success: false,
      error: { code: 'GITLAB_NOT_CONFIGURED', message: 'GitLab integration is not configured.' },
    });
  }

  const state = req.query.state === 'closed' ? 'closed' : 'opened';

  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(`${gitlabBase}/api/v4/projects/${projectPath}/issues`, {
      params: {
        state,
        per_page: 100,
        order_by: 'created_at',
        sort: 'desc',
      },
      headers: { 'PRIVATE-TOKEN': token },
      timeout: 10_000,
    });

    const items = (response.data as Record<string, unknown>[]).map((issue) => ({
      iid: issue['iid'],
      title: issue['title'],
      state: issue['state'],
      created_at: issue['created_at'],
      updated_at: issue['updated_at'],
      web_url: issue['web_url'],
      labels: issue['labels'],
      assignees: (issue['assignees'] as { name: string }[] | undefined)?.map((a) => a.name) ?? [],
      description: issue['description'] ?? '',
    }));

    res.json({ success: true, data: items, meta: meta() });
  } catch (error) {
    logger.error('Failed to list GitLab use-case issues', {
      state,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'USE_CASES_FETCH_FAILED',
        message: "Gebruiksscenario's konden niet worden opgehaald.",
      },
    });
  }
});

/**
 * POST /v1/public/feedback
 * Submit feedback with optional screenshots as a GitLab work item.
 * Accepts multipart/form-data: { name, org, role, contact, description } + up to 5 image files.
 * No authentication required.
 */
router.post(
  '/feedback',
  publicWriteLimiter,
  upload.array('screenshots', 5),
  async (req: Request, res: Response) => {
    const token = process.env.GITLAB_TOKEN;
    const projectPath = process.env.GITLAB_PROJECT_PATH;
    const gitlabBase = process.env.GITLAB_BASE_URL ?? 'https://git.open-regels.nl';

    if (!token || !projectPath) {
      logger.error('GitLab env vars missing for feedback submission');
      return res.status(503).json({
        success: false,
        error: { code: 'GITLAB_NOT_CONFIGURED', message: 'GitLab integration is not configured.' },
      });
    }

    const { name, org, role, contact, description } = req.body as Record<string, string>;

    if (!name?.trim() || !contact?.trim() || !description?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'name, contact, and description are required.' },
      });
    }

    const axios = (await import('axios')).default;
    const files = (req.files ?? []) as Express.Multer.File[];

    try {
      // ── Upload each screenshot to GitLab and collect markdown references ──
      const imageMarkdown: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
        const uploadRes = await axios.post(
          `${gitlabBase}/api/v4/projects/${projectPath}/uploads`,
          form,
          {
            headers: {
              'PRIVATE-TOKEN': token,
              ...form.getHeaders(),
            },
            timeout: 15_000,
          }
        );
        // GitLab returns { markdown: "![filename](/uploads/...)" }
        imageMarkdown.push((uploadRes.data as { markdown: string }).markdown);
      }

      // ── Build issue description ──
      const today = new Date().toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const screenshotsSection =
        imageMarkdown.length > 0
          ? `\n\n---\n\n## Screenshots\n\n${imageMarkdown.join('\n\n')}`
          : '';

      const markdownBody = `## Indiener · Submitter

| Veld · Field | Waarde · Value |
|---|---|
| Naam · Name | ${name.trim()} |
| Organisatie · Organisation | ${(org ?? '').trim() || '—'} |
| Functie · Role | ${(role ?? '').trim() || '—'} |
| Contact | ${contact.trim()} |
| Datum · Date | ${today} |

---

## Beschrijving · Description

${description.trim()}${screenshotsSection}`;

      const issueRes = await axios.post(
        `${gitlabBase}/api/v4/projects/${projectPath}/issues`,
        {
          title: `[Feedback] ${name.trim()}`,
          description: markdownBody,
          labels: 'Feedback',
        },
        {
          headers: { 'PRIVATE-TOKEN': token },
          timeout: 10_000,
        }
      );

      const { iid, web_url } = issueRes.data as { iid: number; web_url: string };
      res.json({ success: true, data: { iid, web_url } });
    } catch (error) {
      logger.error('Failed to submit feedback', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: { code: 'FEEDBACK_SUBMIT_FAILED', message: 'Feedback kon niet worden ingediend.' },
      });
    }
  }
);

export default router;
