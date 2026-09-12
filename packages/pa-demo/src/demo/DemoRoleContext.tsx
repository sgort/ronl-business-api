/**
 * The demo's one permission control.
 *
 * In the product the role is not switchable — Dossierbeheer's role bar is
 * rendered `disabled` with the title "De rol volgt uit je Keycloak-rechten",
 * because you obviously cannot grant yourself rights. plato is the one context
 * where that inverts: there are no real rights to escalate, and showing a
 * prospect how the permission model behaves is the point.
 *
 * It is implemented by rewriting the synthetic token rather than by patching
 * components, so the cockpit's own permission UI — caps chips, the 🔒 hints in
 * DossierEditor, every disabled action — follows on its own.
 *
 * This module deliberately exports the provider and nothing else: the role
 * vocabulary, the context object and `useDemoRole` live in ./demo-role, so
 * that Fast Refresh can swap this component without re-running them. See that
 * file's header for why the split exists.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { deriveDossierRole, type DossierRole } from '@ronl/pa-cockpit';
import { getUser, setDemoRoles } from './shims/keycloak';
import { DemoRoleCtx, KEYCLOAK_ROLE, type DemoRoleId, type DemoRoleValue } from './demo-role';

export function DemoRoleProvider({ children }: { children: ReactNode }) {
  // Beheerder first: a visitor should see the whole product before being
  // shown what a narrower role loses.
  const [roleId, setRoleId] = useState<DemoRoleId>('beheerder');

  // The shim is a module-level mirror of "the synthetic token", not React
  // state, so a reducer alone can't keep it in step. This write has to happen
  // in the render body, not in an effect (layout or passive): children render
  // before any effect fires, in the same commit, and the shim is read fresh
  // during render in more than one place (DemoSectionRouter passes
  // getUser() straight through to PaSectionsRouter, for one) — those reads need to
  // see the new value in the same pass that produced it. A write in an
  // effect would still be one render behind for any sibling that reads the
  // shim during its own render. The write is idempotent, so re-running it on
  // a render that never commits (e.g. React re-invoking this function without
  // committing) is harmless.
  setDemoRoles(KEYCLOAK_ROLE[roleId]);

  // Derived through the product's own function, from the same roles array
  // the cockpit reads (getUser().roles, post-write above) — not a
  // hand-rebuilt array — so the demo cannot drift from real behaviour if
  // getUser()'s composition or deriveDossierRole's inputs ever change.
  // roleId isn't read directly in the callback below, but it's what the
  // write above just used to update the shim; recomputing once that write
  // has happened is the whole reason this depends on roleId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const role = useMemo<DossierRole>(() => deriveDossierRole(getUser().roles), [roleId]);

  const value = useMemo<DemoRoleValue>(
    () => ({ roleId, setRoleId, role }),
    [roleId, setRoleId, role]
  );

  return <DemoRoleCtx.Provider value={value}>{children}</DemoRoleCtx.Provider>;
}
