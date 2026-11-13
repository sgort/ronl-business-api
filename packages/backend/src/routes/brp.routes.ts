import express, { Request, Response } from 'express';
import axios from 'axios';
import jwtMiddleware from '../auth/jwt.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { createLogger } from '../utils/logger';
import { sendProblem } from '../utils/problem';
import { BRP_API_BASE_URL, transportErrorCode } from '../services/brp-upstream';

const router = express.Router();
const logger = createLogger('brp-routes');

/**
 * POST /v1/brp/personen
 * Proxy to BRP API to avoid CORS issues in frontend
 *
 * WHAT IT DOES AND DOES NOT CHECK, as of #312 item 6. It requires a valid
 * token (jwtMiddleware) and nothing else: no requireAssuranceLevel, unlike
 * decision evaluation (basis) and process start (midden), and no check that
 * the BSN in the body is the caller's. It forwards whatever BSN it is given.
 *
 * A subject check is not possible yet, not merely missing: the token carries
 * no BSN. The frontend picks the BSN from a demo table (services/bsn.mapping.ts)
 * that maps test users to test BSNs, and the upstream is the BRP mock with test
 * data. Documentation that claimed LoA "hoog" and "own data only" was removed
 * because this code never enforced either.
 *
 * The intended policy is an open question for the business owners (#312):
 * before this proxies a real BRP, it needs an assurance level, and either a
 * BSN claim to compare against or an explicit role for caseworkers who look
 * up any applicant.
 */
router.post('/personen', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    // Never log req.body or an upstream body: both carry BSNs (#241). The audit
    // log below records the subject on purpose; the application log must not.
    const query = req.body as { type?: string; burgerservicenummer?: unknown };
    logger.info('BRP personen request', {
      userId: req.user?.userId,
      tenantId: req.user?.tenantId,
      queryType: query?.type,
      bsnCount: Array.isArray(query?.burgerservicenummer) ? query.burgerservicenummer.length : 0,
    });

    // Forward request to BRP API - match curl headers exactly
    const response = await axios.post(`${BRP_API_BASE_URL}/personen`, req.body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json', // ✅ BE EXPLICIT
      },
      timeout: 10000,
      validateStatus: (status) => status < 500, // ✅ Don't throw on 4xx
    });

    // Check if response was successful
    if (response.status >= 400) {
      const upstreamCode = (response.data as { code?: unknown } | undefined)?.code;
      logger.error('BRP API returned error', {
        status: response.status,
        upstreamCode: typeof upstreamCode === 'string' ? upstreamCode : undefined,
      });

      return sendProblem(res, req, {
        status: response.status,
        code: 'BRP_API_ERROR',
        detail: 'BRP API returned an error',
        extensions: { details: response.data },
      });
    }

    // Log successful request
    auditLog(req, 'brp.personen.fetch', 'success', {
      bsn: req.body.burgerservicenummer?.[0],
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    // An axios error WITHOUT a response never reached the upstream's HTTP
    // layer: DNS, TCP, the TLS handshake or the timeout failed. That used to
    // fall through to a bare 500, which is how a certificate the upstream's
    // proxy stopped presenting (ERR_TLS_CERT_ALTNAME_INVALID, 13 November
    // 2026) blanked the citizen timeline on ACC and PROD with nothing in the
    // response to say why. It is a gateway failure, so: 502 with its own code,
    // and the transport error code in the log. Not in the response body --
    // the client cannot act on it and it describes infrastructure.
    const unreachable = axios.isAxiosError(error) && !error.response;

    logger.error('BRP API request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.userId,
      upstreamStatus: axios.isAxiosError(error) ? error.response?.status : undefined,
      ...(unreachable ? { transportError: transportErrorCode(error) } : {}),
    });

    auditLog(req, 'brp.personen.fetch', 'error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (unreachable) {
      return sendProblem(res, req, {
        status: 502,
        code: 'BRP_UPSTREAM_UNREACHABLE',
        detail: 'The BRP API could not be reached',
      });
    }

    const statusCode = axios.isAxiosError(error) ? error.response?.status || 500 : 500;
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : 'BRP API request failed';

    sendProblem(res, req, { status: statusCode, code: 'BRP_API_ERROR', detail: message });
  }
});

export default router;
