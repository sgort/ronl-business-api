import type { AssuranceLevel, AuthenticatedUser } from '@ronl/shared';

/**
 * Who may look up whom in the BRP (#319), decided by the repository owner on
 * 16-17 November 2026:
 *
 * - **brp-raadpleger** may look up anyone, at assurance level substantieel or
 *   higher. The role is a composite member of `caseworker`, so every
 *   caseworker holds it; substantieel is what an Entra ID login carries.
 * - **Everyone else** may look up only their own record: assurance level hoog,
 *   a `bsn` claim on the token, and a query whose `burgerservicenummer` list
 *   names that BSN and nothing else. A query that is not by BSN (by name, by
 *   address) can return anyone, so it is refused too.
 *
 * Every lookup, allowed or refused, stays in the audit log with its subject.
 */
export const BRP_RAADPLEGER_ROLE = 'brp-raadpleger';

export type BrpAccess =
  | { allowed: true; via: 'brp-raadpleger' | 'own-record' }
  | {
      allowed: false;
      code: 'INSUFFICIENT_ASSURANCE' | 'BSN_CLAIM_MISSING' | 'BRP_SUBJECT_MISMATCH';
      detail: string;
    };

// The same order requireAssuranceLevel uses (jwt.middleware.ts).
const LEVELS: AssuranceLevel[] = ['basis', 'midden', 'substantieel', 'hoog'];

function atLeast(actual: AssuranceLevel | undefined, required: AssuranceLevel): boolean {
  return actual !== undefined && LEVELS.indexOf(actual) >= LEVELS.indexOf(required);
}

export function brpAccess(
  user: Pick<AuthenticatedUser, 'roles' | 'assuranceLevel' | 'bsn'>,
  requested: unknown
): BrpAccess {
  if ((user.roles ?? []).includes(BRP_RAADPLEGER_ROLE)) {
    return atLeast(user.assuranceLevel, 'substantieel')
      ? { allowed: true, via: 'brp-raadpleger' }
      : {
          allowed: false,
          code: 'INSUFFICIENT_ASSURANCE',
          detail: "Assurance level 'substantieel' or higher required",
        };
  }
  if (!atLeast(user.assuranceLevel, 'hoog')) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_ASSURANCE',
      detail: "Assurance level 'hoog' required to look up your own record",
    };
  }
  if (!user.bsn) {
    return {
      allowed: false,
      code: 'BSN_CLAIM_MISSING',
      detail: 'Your login carries no BSN, so no record can be looked up for you',
    };
  }
  const ownOnly =
    Array.isArray(requested) && requested.length > 0 && requested.every((bsn) => bsn === user.bsn);
  return ownOnly
    ? { allowed: true, via: 'own-record' }
    : {
        allowed: false,
        code: 'BRP_SUBJECT_MISMATCH',
        detail: 'You may only look up your own record, by your own BSN',
      };
}
