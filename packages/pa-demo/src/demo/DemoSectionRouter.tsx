/**
 * DemoSectionRouter — packages/pa-demo's `host.SectionRouter` (see
 * pa-cockpit-host.tsx). The demo's counterpart to packages/frontend's
 * PASectionRouter, and, like it, a permanent host seam.
 *
 * It handles exactly what is this host's business and nothing else:
 *
 *   profiel / rollen — demo-owned pages. In the product these render
 *     ProfielSection and RollenSection from the caseworker dashboard;
 *     rebuilding them here is what keeps that dashboard (and businessApi with
 *     it) out of this public bundle entirely. See Profiel.tsx and
 *     RollenRechten.tsx for why each is a rebuild rather than a reuse.
 *
 *   the deny list — the four IOU sections and Gereedschap render nothing. The
 *     package's terminal branch would otherwise treat an unrecognised id as a
 *     dossier id and offer a "this dossier is no longer available, go to
 *     another one" panel, which is not what a dropped section is. buildAllowedModes
 *     already keeps these out of the rail and out of ⌘K; this is the belt to
 *     that pair of braces, for a stale deep link.
 *
 * Everything else — Vandaag, Issuekaart, Monitoring, Voortgang, Agenda,
 * Feiten, Dossierbeheer, the package's own "beheer" panels and the
 * dossier-lookup fallthrough — is package-owned section-id grammar, dispatched
 * by PaSectionsRouter. This file used to restate all of it: identical
 * MONITORING_IDS / VOORTGANG_IDS / BEHEER_IDS sets and an identical
 * db-overzicht/db-nieuw key-remount branch, hand-kept in step with the
 * frontend's copy. That duplication is what the package removed.
 *
 * Order matters: this file's own cases run FIRST and PaSectionsRouter is the
 * unconditional tail. Calling it first would send 'profiel' into its
 * dossier-or-placeholder branch and this file's cases would never run — and
 * "call it, and if it returns something use that" does not work either, since
 * a JSX element is always truthy.
 *
 * Role propagation: this component calls useDemoRole() purely so it becomes a
 * *consumer* of DemoRoleContext, and passes `user={getUser()}` rather than
 * forwarding the `user` prop. The shell (PADashboardV2.tsx) snapshots
 * getUser() into React state once at mount and never refreshes it, so the
 * `user` prop this component receives is permanently stale after the demo role
 * switches. Both halves are required together: being a context consumer is
 * what makes THIS component re-render when the role changes at all — a
 * non-consuming ancestor whose own element is unchanged causes React to bail
 * out of re-rendering its subtree — and calling getUser() fresh is what makes
 * that re-render actually pick up the new roles. The `user={getUser()}` after
 * the spread below is therefore load-bearing: do not "simplify" it to a plain
 * `<PaSectionsRouter {...props} />`, which forwards the stale snapshot to
 * Dossierbeheer and makes the demo's role selector silently do nothing (see
 * DemoSectionRouter.test.tsx's role-propagation test, which exists to catch
 * exactly that regression).
 */
import { PaSectionsRouter, type PaSectionRouterProps } from '@ronl/pa-cockpit';
import Profiel from './Profiel';
import RollenRechten from './RollenRechten';
import { DROPPED_SECTION_IDS } from './sections.allow';
import { useDemoRole } from './demo-role';
import { getUser } from './shims/keycloak';

const DROPPED = new Set<string>(DROPPED_SECTION_IDS);

export default function DemoSectionRouter(props: PaSectionRouterProps) {
  const { sectionId } = props;

  // Registers this component as a DemoRoleContext consumer — see the file
  // header. The value itself isn't needed here; getUser() below is what
  // actually reads the current roles.
  useDemoRole();

  switch (sectionId) {
    case 'profiel':
      return (
        <div className="v2-main-pad">
          <Profiel />
        </div>
      );
    case 'rollen':
      return (
        <div className="v2-main-pad">
          <RollenRechten />
        </div>
      );
  }

  // Reached only by a stale ⌘K entry or a deep link: these ids are absent from
  // the rail and the palette. Rendering nothing, rather than delegating, is
  // deliberate — see the file header.
  if (DROPPED.has(sectionId)) return null;

  return <PaSectionsRouter {...props} user={getUser()} />;
}
