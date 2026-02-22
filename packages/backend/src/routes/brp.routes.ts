import express, { Request, Response } from 'express';
import axios from 'axios';
import jwtMiddleware from '../auth/jwt.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger('brp-routes');

const BRP_API_BASE_URL = 'https://brp-api-mock.open-regels.nl/haalcentraal/api/brp';

/**
 * POST /v1/brp/personen
 * Proxy to BRP API to avoid CORS issues in frontend
 */
router.post('/personen', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    logger.info('BRP personen request', {
      userId: req.user?.userId,
      tenantId: req.user?.tenantId,
      requestBody: req.body,
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
      logger.error('BRP API returned error', {
        status: response.status,
        data: response.data,
      });

      return res.status(response.status).json({
        success: false,
        error: {
          code: 'BRP_API_ERROR',
          message: 'BRP API returned an error',
          details: response.data,
        },
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
    logger.error('BRP API request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.userId,
      axiosError: axios.isAxiosError(error)
        ? {
            status: error.response?.status,
            data: error.response?.data,
          }
        : null,
    });

    auditLog(req, 'brp.personen.fetch', 'error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const statusCode = axios.isAxiosError(error) ? error.response?.status || 500 : 500;
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : 'BRP API request failed';

    res.status(statusCode).json({
      success: false,
      error: {
        code: 'BRP_API_ERROR',
        message,
      },
    });
  }
});

export default router;
