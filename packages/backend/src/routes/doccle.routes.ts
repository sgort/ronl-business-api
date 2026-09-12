import { Router, Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { createLogger } from '@utils/logger';
import {
  doccleService,
  DoccleDocumentPayload,
  DoccleReceiverPayload,
} from '@services/doccle.service';

const router = Router();
const logger = createLogger('doccle-routes');

router.use(jwtMiddleware);

/**
 * GET /v1/doccle/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  const health = await doccleService.healthCheck();
  logger.info('Doccle status requested', { ...health });
  res.json({
    success: true,
    data: {
      status: health.status,
      stubMode: health.status === 'stub',
      reachable: health.reachable,
      ...(health.latency !== undefined && { latencyMs: health.latency }),
      ...(health.error !== undefined && { error: health.error }),
      ...(health.note !== undefined && { note: health.note }),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * PUT /v1/doccle/senders/:senderName/receivers/:externalReference
 * Body: DoccleReceiverPayload
 */
router.put(
  '/senders/:senderName/receivers/:externalReference',
  async (req: Request, res: Response) => {
    const { senderName, externalReference } = req.params;
    const receiver = req.body as DoccleReceiverPayload;

    if (!receiver?.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'receiver.id is required.' },
      });
    }

    try {
      const result = await doccleService.createOrUpdateReceiver(
        senderName,
        externalReference,
        receiver
      );
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('createOrUpdateReceiver failed', {
        senderName,
        externalReference,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({
        success: false,
        error: { code: 'DOCCLE_ERROR', message: 'Failed to create or update Doccle receiver.' },
      });
    }
  }
);

/**
 * POST /v1/doccle/senders/:senderName/receivers/:externalReferenceId/documents/:documentId
 * Body: DoccleDocumentPayload
 */
router.post(
  '/senders/:senderName/receivers/:externalReferenceId/documents/:documentId',
  async (req: Request, res: Response) => {
    const { senderName, externalReferenceId, documentId } = req.params;
    const document = req.body as DoccleDocumentPayload;

    if (!document?.documentFile?.contentBase64 || !document?.documentFile?.mimeType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'documentFile.contentBase64 and documentFile.mimeType are required.',
        },
      });
    }

    try {
      const result = await doccleService.putDocument(
        senderName,
        externalReferenceId,
        documentId,
        document
      );
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('putDocument failed', {
        senderName,
        externalReferenceId,
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({
        success: false,
        error: { code: 'DOCCLE_ERROR', message: 'Failed to send document to Doccle.' },
      });
    }
  }
);

/**
 * POST /v1/doccle/senders/:senderName/receivers/:externalReferenceId/documents/:documentId/paid
 */
router.post(
  '/senders/:senderName/receivers/:externalReferenceId/documents/:documentId/paid',
  async (req: Request, res: Response) => {
    const { senderName, externalReferenceId, documentId } = req.params;

    try {
      await doccleService.markDocumentPaid(senderName, externalReferenceId, documentId);
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('markDocumentPaid failed', {
        senderName,
        externalReferenceId,
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({
        success: false,
        error: { code: 'DOCCLE_ERROR', message: 'Failed to mark Doccle document as paid.' },
      });
    }
  }
);

export default router;
