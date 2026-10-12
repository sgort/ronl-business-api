import { useMemo } from 'react';
import keycloak from '../../services/keycloak';
import type { Viewer } from './processMarks';

/**
 * Who is looking at a process view: the Keycloak `sub` (the form a task's
 * `assignee` takes) and the realm roles. Read from the token directly rather
 * than through getUser(), which logs the whole token to the console.
 */
export function readViewer(): Viewer {
  const token = keycloak.tokenParsed as
    { sub?: string; realm_access?: { roles?: string[] } } | undefined;
  return { userId: token?.sub ?? null, roles: token?.realm_access?.roles ?? [] };
}

/** readViewer, memoised on the token's subject. */
export function useViewer(): Viewer {
  const sub = (keycloak.tokenParsed as { sub?: string } | undefined)?.sub;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the subject changes
  return useMemo(readViewer, [sub]);
}
