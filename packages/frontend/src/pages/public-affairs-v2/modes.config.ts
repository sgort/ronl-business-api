/**
 * PA-Cockpit V2 — mode + section configuration.
 *
 * Mirrors the caseworker `caseworker-v2/modes.config.ts` gate model so the
 * shell, rail and command palette share one visibility predicate. The PA
 * shell groups work into four modes:
 *
 *   1. Vandaag     — 30-second start screen (top-issues, interventies, agenda)
 *   2. Dossiers    — the spine; each dossier opens an Issuekaart with sub-tabs
 *   3. Monitoring  — curated signals per source (politiek/europa/regionaal/media)
 *   4. Voortgang   — lobbydoelen, Kompas-log, interventie-log
 *
 * Static sections (vandaag, monitoring tabs, voortgang views) live here.
 * Dossier rail items are DATA-driven (built from pa.data at render time),
 * so adding a dossier never touches this file.
 *
 * The whole cockpit is gated on the `public-affairs` realm role and the
 * `province` org-type at the shell level (see PADashboardV2). Per-item
 * gates below are for future fine-graining.
 */

export type PaModeId = 'vandaag' | 'dossiers' | 'monitoring' | 'voortgang' | 'beheer';

export type OrgTypeGate = 'municipality' | 'province' | 'national' | 'commercial';

export interface PaRailItem {
  /** Section id (the shell's activeSection string). */
  id: string;
  label: string;
  /** Optional count badge, filled at render time. */
  badgeKey?: 'dossierCount' | 'signalCount';
  authRequired?: boolean;
  requiredRoles?: string[];
  requiredOrgTypes?: OrgTypeGate[];
}

export interface PaRailGroup {
  label?: string;
  items: PaRailItem[];
}

export interface PaModeConfig {
  id: PaModeId;
  label: string;
  defaultSectionId: string;
  /** Static groups. The 'dossiers' mode fills its rail from data. */
  groups: PaRailGroup[];
  /** When true, the shell builds the rail from the dossier list. */
  dossierDriven?: boolean;
}

export const PA_MODES: PaModeConfig[] = [
  {
    id: 'vandaag',
    label: 'Vandaag',
    defaultSectionId: 'vandaag',
    groups: [
      {
        items: [{ id: 'vandaag', label: 'Vandaag', authRequired: true }],
      },
      {
        label: 'Sortering top-issues',
        items: [
          { id: 'sort-kompas', label: 'Kompas-prioriteit', authRequired: true },
          { id: 'sort-momentum', label: 'Momentum-prioriteit', authRequired: true },
        ],
      },
    ],
  },
  {
    id: 'dossiers',
    label: 'Dossiers',
    defaultSectionId: '', // filled from data (first active dossier)
    dossierDriven: true,
    groups: [],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    defaultSectionId: 'politiek',
    groups: [
      {
        label: 'Tweede Kamer',
        items: [{ id: 'agenda', label: 'Agenda', authRequired: true }],
      },
      {
        label: 'Signaalbronnen',
        items: [
          { id: 'politiek', label: 'Politiek (NL)', badgeKey: 'signalCount', authRequired: true },
          { id: 'europa', label: 'Europa (EU)', badgeKey: 'signalCount', authRequired: true },
          { id: 'regionaal', label: 'Regionaal', badgeKey: 'signalCount', authRequired: true },
          { id: 'media', label: 'Media & omgeving', badgeKey: 'signalCount', authRequired: true },
        ],
      },
    ],
  },
  {
    id: 'voortgang',
    label: 'Voortgang',
    defaultSectionId: 'voortgang',
    groups: [
      {
        label: 'Weergave',
        items: [
          { id: 'voortgang', label: 'Lobbydoelen', authRequired: true },
          { id: 'kompas-log', label: 'Kompas-log', authRequired: true },
          { id: 'interventie-log', label: 'Interventie-log', authRequired: true },
        ],
      },
    ],
  },
  {
    id: 'beheer',
    label: 'Beheer',
    defaultSectionId: 'profiel',
    groups: [
      {
        label: 'Account',
        items: [
          { id: 'profiel', label: 'Profiel', authRequired: true },
          { id: 'rollen', label: 'Rollen & rechten', authRequired: true },
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

/** Sentinel ids used by Vandaag's rail (they set a sort, not a section). */
export const SORT_SECTION_IDS: ReadonlySet<string> = new Set(['sort-kompas', 'sort-momentum']);

export interface PaGateContext {
  isAuthenticated: boolean;
  userRoles: string[];
  userOrgType: OrgTypeGate | null | undefined;
}

export function isPaItemVisible(item: PaRailItem, ctx: PaGateContext): boolean {
  if (item.authRequired && !ctx.isAuthenticated) return false;
  if (item.requiredRoles && item.requiredRoles.length > 0) {
    if (!item.requiredRoles.some((r) => ctx.userRoles.includes(r))) return false;
  }
  if (item.requiredOrgTypes && item.requiredOrgTypes.length > 0) {
    if (!ctx.userOrgType || !item.requiredOrgTypes.includes(ctx.userOrgType)) return false;
  }
  return true;
}

/** Which mode owns a (static) section id — for ⌘K jumps. */
export function findPaModeForSection(sectionId: string): PaModeId | null {
  for (const mode of PA_MODES) {
    for (const group of mode.groups) {
      if (group.items.some((i) => i.id === sectionId)) return mode.id;
    }
  }
  return null;
}

/** Static searchable sections (excludes sort sentinels; dossiers added separately). */
export function allStaticSections(): PaRailItem[] {
  const out: PaRailItem[] = [];
  for (const mode of PA_MODES) {
    for (const group of mode.groups) {
      for (const item of group.items) {
        if (!SORT_SECTION_IDS.has(item.id)) out.push(item);
      }
    }
  }
  return out;
}
