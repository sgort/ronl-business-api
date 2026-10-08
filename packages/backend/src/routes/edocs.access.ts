import type { NextFunction, Request, Response } from 'express';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';
import {
  entraTokenService,
  ReauthRequiredError,
  UserTokenUnavailableError,
} from '@auth/entra-token.service';
import { EdocsAccessDeniedError, edocsService, type EdocsService } from '@services/edocs.service';

const logger = createLogger('edocs-access');

type UserProblem = 'EDOCS_USER_TOKEN_UNAVAILABLE' | 'EDOCS_REAUTH_REQUIRED';

declare module 'express-serve-static-core' {
  interface Request {
    /** The eDOCS client for this request: the person, or the service account. */
    edocs?: EdocsService;
    edocsActingAs?: 'user' | 'service';
    /** Why a person has no client of their own (set by edocsAccess, acted on by requireEdocsPrincipal). */
    edocsUserProblem?: UserProblem;
    /** Keycloak or Entra could not be asked (5xx, network): not a fact about the person. */
    edocsLookupError?: unknown;
  }
}

const PERSON_ROLES = ['caseworker', 'admin'];

/** Every refusal is an RFC 9457 problem detail, like the rest of the API. */
const fail = (req: Request, res: Response, status: number, code: string, detail: string) =>
  sendProblem(res, req, { status, code, detail });

/**
 * Who may call /v1/edocs, and as whom eDOCS sees the call (spec §4).
 *
 * - A machine client (token `azp` other than the frontend's) must be on
 *   EDOCS_ALLOWED_CLIENTS and acts as the service account.
 * - A person (azp = the frontend client) needs caseworker or admin and acts as
 *   themselves, with the Entra ID token Keycloak brokered at their login. When
 *   they have none, the reason is recorded and requireEdocsPrincipal decides.
 * - In stub mode nobody talks to eDOCS, so a person gets the stub service client.
 */
export async function edocsAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const azp = req.auth?.azp;
  if (azp !== config.keycloak.clientId) {
    if (azp && config.edocs.allowedClients.includes(azp)) {
      req.edocs = edocsService;
      req.edocsActingAs = 'service';
      return next();
    }
    logger.warn('eDOCS request from a client not on the allow-list', { azp, path: req.path });
    fail(
      req,
      res,
      403,
      'EDOCS_CLIENT_NOT_ALLOWED',
      'This API is only available to registered eDOCS clients.'
    );
    return;
  }

  const user = req.user;
  if (!user || !user.roles.some((role) => PERSON_ROLES.includes(role))) {
    fail(req, res, 403, 'FORBIDDEN', 'eDOCS requires the caseworker or admin role.');
    return;
  }

  if (config.edocs.stubMode) {
    req.edocs = edocsService;
    req.edocsActingAs = 'service';
    return next();
  }

  const sub = user.userId;
  const keycloakToken = req.auth?.token ?? '';
  try {
    await entraTokenService.getIdToken(sub, keycloakToken);
  } catch (err) {
    if (err instanceof UserTokenUnavailableError || err instanceof ReauthRequiredError) {
      req.edocsUserProblem = err.code as UserProblem;
      return next();
    }
    // An outage, not a decision about the person. /status reports it in
    // data.user; every other route fails on it in requireEdocsPrincipal (#326).
    logger.warn('Could not look up the person’s Entra token', {
      error: err instanceof Error ? err.message : String(err),
    });
    req.edocsLookupError = err;
    return next();
  }

  req.edocs = edocsService.forUser({
    sub,
    email: user.email ?? user.preferredUsername,
    getIdToken: (opts) => entraTokenService.getIdToken(sub, keycloakToken, opts),
  });
  req.edocsActingAs = 'user';
  next();
}

/**
 * The eDOCS client requireEdocsPrincipal resolved for this request. Throws when
 * that middleware did not run — a wiring mistake, never a caller's fault.
 */
export function edocsOf(req: Request): EdocsService {
  if (!req.edocs) throw new Error('edocsOf() called before requireEdocsPrincipal');
  return req.edocs;
}

/** Data routes need a client. A person without one is refused — or, where allowed, falls back visibly. */
export function requireEdocsPrincipal(req: Request, res: Response, next: NextFunction): void {
  if (req.edocs) return next();
  // Never a fallback to the service for an outage: the person is unknown, not refused.
  if (req.edocsLookupError) return next(req.edocsLookupError);

  if (req.edocsUserProblem === 'EDOCS_REAUTH_REQUIRED') {
    fail(
      req,
      res,
      401,
      'EDOCS_REAUTH_REQUIRED',
      'Sign in again with your Flevoland account to use eDOCS.'
    );
    return;
  }

  if (config.edocs.allowServiceFallback) {
    logger.warn('eDOCS service fallback for a person without an Entra token', {
      audit: true,
      userId: req.user?.userId,
      actingAs: config.edocs.userId,
      path: req.path,
    });
    req.edocs = edocsService;
    req.edocsActingAs = 'service';
    return next();
  }

  fail(
    req,
    res,
    403,
    'EDOCS_USER_TOKEN_UNAVAILABLE',
    'eDOCS is available after signing in with your Flevoland account.'
  );
}

/** Maps an eDOCS call's failure to a response; anything unrecognised stays the route's 502. */
export function sendEdocsError(req: Request, res: Response, error: unknown, message: string): void {
  if (error instanceof ReauthRequiredError) {
    fail(
      req,
      res,
      401,
      'EDOCS_REAUTH_REQUIRED',
      'Sign in again with your Flevoland account to use eDOCS.'
    );
  } else if (error instanceof UserTokenUnavailableError) {
    fail(
      req,
      res,
      403,
      'EDOCS_USER_TOKEN_UNAVAILABLE',
      'eDOCS is available after signing in with your Flevoland account.'
    );
  } else if (error instanceof EdocsAccessDeniedError) {
    fail(req, res, 403, 'EDOCS_ACCESS_DENIED', 'eDOCS refused access for this account.');
  } else {
    fail(req, res, 502, 'EDOCS_ERROR', message);
  }
}
