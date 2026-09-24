// packages/backend/src/middleware/version.middleware.ts

import { Request, Response, NextFunction } from 'express';

import packageJson from '../../package.json';

/**
 * Sets `API-Version` on every response.
 *
 * NL API Design Rules, API-57: return the full version number in a response
 * header. The ADR Spectral ruleset checks the DOCUMENT for it
 * (`nlgov:missing-header`), so publishing an OpenAPI description (#200) is what
 * surfaced its absence here -- the rule would otherwise have been satisfied by
 * a document that claimed a header nothing sent.
 *
 * The value is the released version from package.json, the same string
 * `/v1/health` and the banner report, so a consumer reading the header and a
 * consumer reading the body cannot disagree.
 *
 * Note the scheme is CalVer (`2026.09.11`), not semver -- which is why
 * `nlgov:semver` is switched off in openapi/.spectral.yaml rather than the
 * version being rewritten to satisfy it.
 */
export const versionMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  res.set('API-Version', packageJson.version);
  next();
};
