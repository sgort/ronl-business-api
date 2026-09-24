// packages/backend/src/routes/openapi.routes.ts
//
// GET /v1/openapi.json: this API's OpenAPI description, at the location the
// NL API Design Rules' /core/publish-openapi prescribes (#200).
//
// This is the endpoint the root banner advertises again. It promised
// documentation at /v1/docs from the initial commit and nothing ever served
// it, so #67 removed the field rather than leave it pointing at a 404. This
// restores the promise with something behind it.

import { Request, Response, Router } from 'express';
import cors from 'cors';

import { OpenApiDocument, readOpenApiDocument } from '../openapi/document';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';

export function createOpenApiRouter(load: () => OpenApiDocument = readOpenApiDocument): Router {
  const router = Router();

  // Read ONCE, at module load, rather than on first request.
  //
  // A zip deploy overwrites files BEFORE it restarts the process, so a lazy
  // `cached ??= load()` lets the OLD process serve a document from the NEW
  // artifact -- it is not running that artifact, and says nothing about the
  // code actually answering. linked-data-explorer hit exactly this on its
  // v2026.09.6 promotion, where /v1/openapi.json reported one version while
  // /v1/health, bound at module load, reported the previous one. Two answers,
  // one process, two seconds apart.
  //
  // Binding here means the document and everything else read at module load
  // are bound at the same moment, so a stale process reports itself as stale.
  //
  // The read is NOT allowed to throw at import. A missing document means a
  // broken build, which should be loud -- but crashing at module load takes
  // the whole service down for one endpoint, and this endpoint is
  // documentation. The failure is remembered and answered per request instead.
  let document: OpenApiDocument | undefined;
  let loadError: unknown;
  try {
    document = load();
  } catch (err) {
    loadError = err;
    logger.error('[openapi] document could not be read at startup', {
      error: getErrorMessage(err),
    });
  }

  // Fully open CORS: /core/publish-openapi requires any origin to be able to
  // fetch the document, so a browser-based viewer can load it. Public,
  // read-only, no credentials.
  // nosemgrep: javascript.express.web.cors-permissive-express.cors-permissive-express
  router.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

  router.get('/', (req: Request, res: Response) => {
    if (!document) {
      logger.error('[openapi] document unavailable', { error: getErrorMessage(loadError) });
      res.status(500).json({
        success: false,
        error: {
          code: 'OPENAPI_UNAVAILABLE',
          message: 'The OpenAPI description is not available',
        },
      });
      return;
    }

    res.json(document);
  });

  return router;
}

export default createOpenApiRouter();
