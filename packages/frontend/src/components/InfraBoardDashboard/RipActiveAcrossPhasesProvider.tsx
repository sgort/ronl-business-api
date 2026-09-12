import type { ReactNode } from 'react';
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
 */
export function RipActiveAcrossPhasesProvider({ children }: { children: ReactNode }) {
  const resource = useRipActiveAcrossPhasesResource();
  return (
    <RipActiveAcrossPhasesContext.Provider value={resource}>
      {children}
    </RipActiveAcrossPhasesContext.Provider>
  );
}
