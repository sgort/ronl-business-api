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

import { RIP_STAGES, RIP_PHASES } from './rip-phases.catalog';

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
    groups: [{ items: [{ id: 'portfolio', label: 'Alle projecten', authRequired: true }] }],
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
      {
        label: 'Projecten',
        items: [
          { id: 'faseladder', label: 'Faseladder', authRequired: true },
          ...RIP_STAGES.flatMap((stage) =>
            RIP_PHASES.filter((p) => p.stage === stage.code).map((p) => ({
              id: `fase-${p.code.toLowerCase().replace('.', '-')}`,
              label: `${p.code} · ${p.name}`,
              authRequired: true,
              requiredRoles: [INFRA_GATE_ROLE],
            }))
          ),
          { id: 'archief', label: 'Archief', authRequired: true },
        ],
      },
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
