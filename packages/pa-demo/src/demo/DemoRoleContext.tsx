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
 * components, so the vendored permission UI — caps chips, the 🔒 hints in
 * DossierEditor, every disabled action — follows on its own.
 */
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  deriveDossierRole,
  type DossierRole,
} from '../vendor/pages/public-affairs-v2/dossierbeheer.data';
import { setDemoRoles } from './shims/keycloak';

export type DemoRoleId = 'auteur' | 'redacteur' | 'beheerder' | 'geen';

/** Keycloak role each position grants; `geen` grants none. */
const KEYCLOAK_ROLE: Record<DemoRoleId, string | null> = {
  auteur: 'pa-author',
  redacteur: 'pa-editor',
  beheerder: 'pa-admin',
  geen: null,
};

export const DEMO_ROLE_OPTIONS: { id: DemoRoleId; label: string }[] = [
  { id: 'auteur', label: 'Auteur' },
  { id: 'redacteur', label: 'Redacteur' },
  { id: 'beheerder', label: 'Beheerder' },
  { id: 'geen', label: 'Geen dossierrol' },
];

interface DemoRoleValue {
  roleId: DemoRoleId;
  setRoleId: (id: DemoRoleId) => void;
  role: DossierRole;
}

const DemoRoleCtx = createContext<DemoRoleValue | null>(null);

export function DemoRoleProvider({ children }: { children: ReactNode }) {
  // Beheerder first: a visitor should see the whole product before being
  // shown what a narrower role loses.
  const [roleId, setRoleId] = useState<DemoRoleId>('beheerder');

  // The shim is a module-level mirror of "the synthetic token", not React
  // state, so a reducer alone can't keep it in step. Writing it here, plainly,
  // during render, means the mirror can never lag behind `roleId` — not on
  // the first render, not on any later one — and there is exactly one call
  // site instead of splitting it between an effect and a setter. The write is
  // idempotent, so re-running it on a render that never commits is harmless.
  // (An effect looks more idiomatic but only fires after commit, which is one
  // render later than a click handler needs when a test asserts synchronously
  // inside `act()`.)
  setDemoRoles(KEYCLOAK_ROLE[roleId]);

  // Derived through the product's own function, from the same roles array
  // the cockpit reads, so the demo cannot drift from real behaviour.
  const role = useMemo<DossierRole>(() => {
    const kc = KEYCLOAK_ROLE[roleId];
    return deriveDossierRole(kc ? [kc] : []);
  }, [roleId]);

  const value = useMemo<DemoRoleValue>(
    () => ({ roleId, setRoleId, role }),
    [roleId, setRoleId, role]
  );

  return <DemoRoleCtx.Provider value={value}>{children}</DemoRoleCtx.Provider>;
}

export function useDemoRole(): DemoRoleValue {
  const ctx = useContext(DemoRoleCtx);
  if (!ctx) throw new Error('useDemoRole must be used inside DemoRoleProvider');
  return ctx;
}
