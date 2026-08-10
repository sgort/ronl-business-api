/**
 * Infra-board — mode + section configuration.
 *
 * Three modes, mirroring the V2 caseworker shell pattern:
 *   1. mijn-dag   — personal landing (live to-dos)
 *   2. portfolio  — all projects (Gantt + kanban)
 *   3. beheer     — RIP admin (reuses existing RipFase1*Section components)
 *
 * The whole dashboard is gated on the `infra-projectteam` realm role. Per the
 * PO, every section is visible to the single team-infra-flevoland user for now;
 * `requiredRoles` is wired so sections can be split per user later.
 */

import { RIP_PHASES } from './rip-phases.catalog';

export type InfraModeId = 'mijn-dag' | 'portfolio' | 'beheer';

export interface InfraRailItem {
  id: string;
  label: string;
  authRequired?: boolean;
  requiredRoles?: string[];
}
export interface InfraRailGroup {
  label?: string;
  items: InfraRailItem[];
}
export interface InfraModeConfig {
  id: InfraModeId;
  label: string;
  defaultSectionId: string;
  groups: InfraRailGroup[];
}

export const INFRA_GATE_ROLE = 'infra-projectteam';

export const INFRA_MODES: InfraModeConfig[] = [
  {
    id: 'mijn-dag',
    label: 'Mijn dag',
    defaultSectionId: 'overzicht',
    groups: [
      {
        items: [
          { id: 'overzicht', label: 'Overzicht', authRequired: true },
          { id: 'project-updates', label: 'Project-updates', authRequired: true },
        ],
      },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    defaultSectionId: 'portfolio',
    // No rail nav item — the design's Portfolio rail is stats-only
    // (stage-grouped phase counts, Overgangen, Gezondheid). The top-nav
    // "Portfolio" tab still routes here via setMode('portfolio');
    // InfraSectionRouter switches on `mode`, not `section`, so this is
    // unaffected. See rail-stats-panel spec, Section 4.
    groups: [],
  },
  {
    id: 'beheer',
    label: 'Beheer',
    defaultSectionId: 'faseladder',
    groups: [
      {
        label: 'Account',
        items: [
          { id: 'profiel', label: 'Profiel', authRequired: true },
          { id: 'rollen', label: 'Rollen & rechten', authRequired: true },
        ],
      },
      // Faseladder, the 12 phase items, and Archief are intentionally not
      // listed here — the reference (pb-shell.reference.jsx:71-110) groups
      // the phase items by stage (a header per RIP_STAGES entry, matching
      // Portfolio's rail treatment), which this flat items[] shape can't
      // express. InfraBoardDashboard.tsx hand-renders that whole section
      // (Faseladder button, stage-grouped phase buttons via
      // beheerRailPhaseGroups(), Archief button) directly, gated the same
      // way these items were (isAuth for Faseladder/Archief, hasGateRole
      // for the phase items).
      {
        label: 'IOU',
        items: [
          { id: 'iou-gebruiksscenario', label: 'Gebruiksscenario indienen', authRequired: true },
          { id: 'iou-feedback', label: 'Feedback geven', authRequired: true },
          { id: 'iou-actieve-zaken', label: 'Actieve zaken', authRequired: true },
          { id: 'iou-archief', label: 'Archief', authRequired: true },
        ],
      },
      {
        label: 'Hulpmiddelen',
        items: [{ id: 'gereedschap-overzicht', label: 'Gereedschap', authRequired: true }],
      },
    ],
  },
];

export function findModeForSection(sectionId: string): InfraModeId | null {
  for (const m of INFRA_MODES) {
    for (const g of m.groups) if (g.items.some((i) => i.id === sectionId)) return m.id;
  }
  return null;
}

export function phaseSectionId(code: string): string {
  return `fase-${code.toLowerCase().replace('.', '-')}`;
}

export function phaseCodeFromSectionId(id: string): string | undefined {
  return RIP_PHASES.find((p) => phaseSectionId(p.code) === id)?.code;
}

export interface InfraGateContext {
  isAuthenticated: boolean;
  userRoles: string[];
}
export function isRailItemVisible(item: InfraRailItem, ctx: InfraGateContext): boolean {
  if (item.authRequired && !ctx.isAuthenticated) return false;
  if (item.requiredRoles?.length && !item.requiredRoles.some((r) => ctx.userRoles.includes(r)))
    return false;
  return true;
}
