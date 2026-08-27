/**
 * Everything about the demo's role switch that is not the provider component:
 * the role vocabulary, the context object itself, and the hook that reads it.
 *
 * Split out of DemoRoleContext.tsx rather than living beside the provider
 * because a module that exports both a component and non-components defeats
 * React Fast Refresh — the whole module re-executes on edit, so the provider
 * remounts and every consumer loses its state. That is what
 * `react-refresh/only-export-components` was warning about, and it is the same
 * split this repo already applies elsewhere (see the frontend's
 * `kompas.ts` / `Kompas.tsx` and `dossierbeheer.data.ts` pairs).
 *
 * Consumers import the hook and the options from here; only `DemoRoleProvider`
 * comes from DemoRoleContext.tsx. Re-exporting them from there for
 * convenience would put the non-component exports straight back into the
 * component module and reinstate the warning.
 */
import { createContext, useContext } from 'react';
import type { DossierRole } from '../vendor/pages/public-affairs-v2/dossierbeheer.data';

export type DemoRoleId = 'auteur' | 'redacteur' | 'beheerder' | 'geen';

/** Keycloak role each position grants; `geen` grants none. */
export const KEYCLOAK_ROLE: Record<DemoRoleId, string | null> = {
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

export interface DemoRoleValue {
  roleId: DemoRoleId;
  setRoleId: (id: DemoRoleId) => void;
  role: DossierRole;
}

export const DemoRoleCtx = createContext<DemoRoleValue | null>(null);

export function useDemoRole(): DemoRoleValue {
  const ctx = useContext(DemoRoleCtx);
  if (!ctx) throw new Error('useDemoRole must be used inside DemoRoleProvider');
  return ctx;
}
