import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '@ronl/shared';
import { createLogger } from '@utils/logger';

const logger = createLogger('tenant-access');

/**
 * Tenant decisions for process and task access (#218, #219).
 *
 * The `municipality` process variable is the only tenant label any access
 * check reads. Operaton's own tenantId (the deployment's) is kept equal to it
 * by resolveStartTenant at start, and is never compared against directly.
 */

export const TENANT_MISMATCH_MESSAGE = 'Access denied: organisation mismatch';

/**
 * A citizen is a token carrying the `citizen` realm role. Everyone else is
 * staff -- including roles that are not `caseworker` (public-affairs,
 * woo-coordinatie) and a token with no roles claim at all, so an unexpected
 * role never gains a citizen's cross-tenant start.
 */
export function isCitizen(user: Pick<AuthenticatedUser, 'roles'>): boolean {
  return (user.roles ?? []).includes('citizen');
}

/**
 * True only for a non-empty string label exactly equal to the caller's tenant.
 * A missing label refuses: an instance started outside this backend carries
 * none, and must not be readable by every tenant that knows its id.
 */
export function tenantAllows(
  user: Pick<AuthenticatedUser, 'tenantId'>,
  municipality: unknown
): boolean {
  return typeof municipality === 'string' && municipality !== '' && municipality === user.tenantId;
}

/** Log a tenant refusal and answer 403 TENANT_MISMATCH. */
export function denyTenant(
  req: Request,
  res: Response,
  context: Record<string, unknown> = {}
): Response {
  logger.warn('Tenant mismatch', {
    userId: req.user?.userId,
    userTenant: req.user?.tenantId,
    path: req.originalUrl,
    ...context,
  });
  return res.status(403).json({
    success: false,
    error: { code: 'TENANT_MISMATCH', message: TENANT_MISMATCH_MESSAGE },
  });
}

/**
 * Process variables that decide access, set only at process start
 * (resolveStartTenant, addTenantToProcessVariables). A user may not
 * overwrite them afterwards -- a task completion that carried
 * `municipality` would relabel the whole instance, handing the case to
 * another tenant (or to none).
 */
export const RESERVED_PROCESS_VARIABLES: readonly string[] = [
  'municipality',
  'originTenantId',
  'applicantId',
];

/** The reserved keys present in a variables map, in the map's own order. */
export function reservedVariablesIn(variables: Record<string, unknown>): string[] {
  return Object.keys(variables).filter((key) => RESERVED_PROCESS_VARIABLES.includes(key));
}

export type StartTenant =
  { allowed: true; municipality: string; originTenantId: string } | { allowed: false };

/**
 * What a user start stamps. An untenanted deployment, or one under the
 * caller's own tenant, takes the caller's tenant. Under another tenant, a
 * citizen's case goes to the processing tenant (the rule AwbZorgtoeslagProcess
 * used to hardcode); staff are refused. originTenantId always records the
 * channel the case came in through.
 */
export function resolveStartTenant(
  user: Pick<AuthenticatedUser, 'tenantId' | 'roles'>,
  deployedTenant: string | null
): StartTenant {
  if (deployedTenant === null || deployedTenant === user.tenantId) {
    return { allowed: true, municipality: user.tenantId, originTenantId: user.tenantId };
  }
  if (isCitizen(user)) {
    return { allowed: true, municipality: deployedTenant, originTenantId: user.tenantId };
  }
  return { allowed: false };
}
