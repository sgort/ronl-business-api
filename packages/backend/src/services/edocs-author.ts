import type { AuthenticatedUser, OperatonVariable } from '@ronl/shared';
import { isCitizen } from '@auth/tenant-access';
import type { EdocsAuthor } from '@services/edocs.service';

/**
 * Who last acted on a process through RBA (spec §6). Background archiving runs
 * as the service account and records this employee as "namens …". Set only by
 * the backend, from the caller's token: reserved against client writes.
 */
export const EDOCS_AUTHOR_VARIABLES = ['edocsAuthor', 'edocsAuthorName'] as const;

/**
 * The variables to stamp when a person starts a process or completes a task.
 * Empty for a citizen (not an employee; their username may be a BSN) and for a
 * token that names nobody — the previous author then stays.
 */
export function edocsAuthorVariables(
  user: Pick<AuthenticatedUser, 'roles' | 'email' | 'preferredUsername' | 'displayName'>
): Record<string, OperatonVariable> {
  if (isCitizen(user)) return {};
  const author = user.email?.trim() || user.preferredUsername?.trim();
  if (!author) return {};
  const name = user.displayName?.trim();
  return {
    edocsAuthor: { value: author, type: 'String' },
    ...(name && { edocsAuthorName: { value: name, type: 'String' } }),
  };
}

/** The author recorded on a process, from its Operaton variables. */
export function edocsAuthorFrom(
  variables: Record<string, { value?: unknown } | undefined>
): EdocsAuthor | undefined {
  const email = variables.edocsAuthor?.value;
  if (typeof email !== 'string' || !email) return undefined;
  const name = variables.edocsAuthorName?.value;
  return typeof name === 'string' && name ? { email, name } : { email };
}
