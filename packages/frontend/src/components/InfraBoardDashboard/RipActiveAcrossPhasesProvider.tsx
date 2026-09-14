import { useEffect, useRef, type ReactNode } from 'react';
import {
  RipActiveAcrossPhasesContext,
  useRipActiveAcrossPhasesResource,
} from '../../services/infra.api';

/**
 * Fetches active RIP instances across every modelled phase ONCE and shares
 * the result with every consumer under it, instead of each one calling
 * `useRipActiveAcrossPhases` and firing its own request — the fan-out this
 * whole change removes (see infra.api.ts's `fetchActiveAcrossPhases`).
 *
 * Shape follows this repo's existing precedent for exactly this,
 * `PaDataProvider` (pa-cockpit/src/pages/public-affairs-v2/PaDataProvider.tsx):
 * a context whose consuming hook (`useRipActiveAcrossPhases`, `usePaData`)
 * throws when read outside its provider rather than silently falling back to
 * a private fetch of its own.
 *
 * Mounted once, at the Infra-board root (InfraBoardDashboard.tsx), wrapping
 * its whole tree. That covers every real consumer: Portfolio.tsx and
 * ProjectDetail.tsx only ever render via InfraSectionRouter, which only
 * InfraBoardDashboard.tsx imports (`grep -rln` for their importers turns up
 * nothing else), and InfraCommandPalette.tsx is mounted directly by
 * InfraBoardDashboard.tsx too. So all four of today's callers —
 * Portfolio, InfraCommandPalette, ProjectDetail and the page root itself —
 * end up under this one provider and share its one request.
 *
 * Fetching once must not mean fetching once per page load. Instances start
 * outside the board -- a script, another tab, another user -- so the shared
 * request is repeated when the tab becomes visible again, and the board
 * repeats it on every mode switch (InfraBoardDashboard.tsx). Each refresh is
 * the same single aggregate request, never one per consumer or per phase.
 */
export function RipActiveAcrossPhasesProvider({ children }: { children: ReactNode }) {
  const resource = useRipActiveAcrossPhasesResource();

  // `reload` is a new function on every render; the listener reads the latest
  // through a ref so it is attached once rather than on every render.
  const reloadRef = useRef(resource.reload);
  reloadRef.current = resource.reload;
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reloadRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return (
    <RipActiveAcrossPhasesContext.Provider value={resource}>
      {children}
    </RipActiveAcrossPhasesContext.Provider>
  );
}
