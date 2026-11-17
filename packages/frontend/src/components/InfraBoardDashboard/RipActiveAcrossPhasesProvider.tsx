import { useEffect, useRef, type ReactNode } from 'react';
import {
  DeployedProcessKeysContext,
  LivePhaseCountsContext,
  RipActiveAcrossPhasesContext,
  RipCompletedAcrossPhasesContext,
  useDeployedProcessKeysResource,
  useLivePhaseCountsResource,
  useRipActiveAcrossPhasesResource,
  useRipCompletedAcrossPhasesResource,
} from '../../services/infra.api';

/**
 * Fetches active RIP instances across every modelled phase ONCE and shares
 * (together with the finished instances, the deployment status and the live
 * phase counts, each likewise fetched once)
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
  const active = useRipActiveAcrossPhasesResource();
  // The finished instances ride along: a project between phases has no
  // running instance, so the portfolio needs both lists, refreshed together.
  const completed = useRipCompletedAcrossPhasesResource();
  // The Faseladder's deployment status and live counts, read by the page root,
  // FaseladderOverview and PhaseDetail, which each fetched their own (#78).
  const deployment = useDeployedProcessKeysResource();
  const counts = useLivePhaseCountsResource();
  // A reload of the running list (e.g. the board's mode switch) refreshes
  // the finished list and the counts too, so none of them disagree about a
  // project. Before #78 the counts were refetched whenever the Faseladder
  // mounted; this keeps them as fresh. The deployment status only changes
  // with a deploy, so it is refreshed with the tab instead (below).
  const resource = {
    ...active,
    reload: () => {
      active.reload();
      completed.reload();
      counts.reload();
    },
  };

  // `reload` is a new function on every render; the listener reads the latest
  // through a ref so it is attached once rather than on every render.
  const reloadAll = () => {
    resource.reload();
    deployment.reload();
  };
  const reloadRef = useRef(reloadAll);
  reloadRef.current = reloadAll;
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reloadRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return (
    <RipActiveAcrossPhasesContext.Provider value={resource}>
      <RipCompletedAcrossPhasesContext.Provider value={completed}>
        <DeployedProcessKeysContext.Provider value={deployment}>
          <LivePhaseCountsContext.Provider value={counts}>
            {children}
          </LivePhaseCountsContext.Provider>
        </DeployedProcessKeysContext.Provider>
      </RipCompletedAcrossPhasesContext.Provider>
    </RipActiveAcrossPhasesContext.Provider>
  );
}
