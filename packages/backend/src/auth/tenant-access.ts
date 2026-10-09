import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '@ronl/shared';
import { isCrossTenantProcess } from './citizen-services';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';

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

/**
 * Who may READ a process instance (#229): its owning tenant, or the
 * applicant themselves -- a citizen whose case went to another tenant's
 * deployment (an AWB claim under toeslagen) still follows it. Reads only:
 * deleting, and every task operation, stay with the owning tenant.
 */
export function caseReadAllowed(
  user: Pick<AuthenticatedUser, 'tenantId' | 'userId'>,
  municipality: unknown,
  applicantId: unknown
): boolean {
  const isApplicant =
    typeof applicantId === 'string' && applicantId !== '' && applicantId === user.userId;
  return tenantAllows(user, municipality) || isApplicant;
}

/** Log a tenant refusal and answer 403 TENANT_MISMATCH. */
export function denyTenant(
  req: Request,
  res: Response,
  context: Record<string, unknown> = {}
): void {
  logger.warn('Tenant mismatch', {
    userId: req.user?.userId,
    userTenant: req.user?.tenantId,
    path: req.originalUrl,
    ...context,
  });
  return sendProblem(res, req, {
    status: 403,
    code: 'TENANT_MISMATCH',
    detail: TENANT_MISMATCH_MESSAGE,
  });
}

/**
 * Process variables that decide access, set only at process start
 * (resolveStartTenant, addTenantToProcessVariables), plus the eDOCS author the
 * backend stamps from the caller's token (services/edocs-author.ts). A user may
 * not write them -- a task completion that carried `municipality` would
 * relabel the whole instance, handing the case to another tenant (or to
 * none), and one that carried `edocsAuthor` would archive documents in
 * another employee's name.
 */
export const RESERVED_PROCESS_VARIABLES: readonly string[] = [
  'municipality',
  'originTenantId',
  'applicantId',
  'edocsAuthor',
  'edocsAuthorName',
];

/** The reserved keys present in a variables map, in the map's own order. */
export function reservedVariablesIn(variables: Record<string, unknown>): string[] {
  return Object.keys(variables).filter((key) => RESERVED_PROCESS_VARIABLES.includes(key));
}

export type StartTenant =
  { allowed: true; municipality: string; originTenantId: string } | { allowed: false };

/**
 * What a user start stamps (#218, #344). Under the caller's own tenant: the
 * caller's tenant. Under another tenant: refused, except a citizen starting a
 * cross-tenant citizen service (Zorgtoeslag), whose case goes to the deploying
 * tenant, with originTenantId recording the channel. With no deployed tenant
 * (an untenanted deployment, or a lookup that failed) a citizen is refused --
 * tenant is mandatory -- while staff keep stamping their own tenant, because
 * HR onboarding still runs untenanted.
 */
export function resolveStartTenant(
  user: Pick<AuthenticatedUser, 'tenantId' | 'roles'>,
  deployedTenant: string | null,
  processKey: string
): StartTenant {
  if (deployedTenant === user.tenantId) {
    return { allowed: true, municipality: user.tenantId, originTenantId: user.tenantId };
  }
  if (deployedTenant === null) {
    return isCitizen(user)
      ? { allowed: false }
      : { allowed: true, municipality: user.tenantId, originTenantId: user.tenantId };
  }
  if (isCitizen(user) && isCrossTenantProcess(processKey)) {
    return { allowed: true, municipality: deployedTenant, originTenantId: user.tenantId };
  }
  return { allowed: false };
}
