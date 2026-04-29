/**
 * Caseworker Dashboard V2 — mode + section configuration
 *
 * The V2 shell groups the existing ~25 sections into 3 modes:
 *
 *   1. Werk    — daily work surface (Taken inbox is default landing)
 *   2. Zoeken  — reference / lookup library
 *   3. Beheer  — admin, profile, IOU meta, projects (RIP)
 *
 * Section ids match the `activeSection` strings used in the existing
 * `CaseworkerDashboard.tsx`, so the same SectionRouter can dispatch to the
 * existing components without changes.
 */

export type ModeId = 'werk' | 'zoeken' | 'beheer';

export interface RailItem {
  /** Section id (matches existing activeSection strings) */
  id: string;
  /** Display label (Dutch) */
  label: string;
  /** Optional badge — count, "nieuw", etc. Filled at render time, not here. */
  badgeKey?: 'taskCount' | 'iouCount' | 'unread';
  /** Visible only when authenticated */
  authRequired?: boolean;
  /** Required Keycloak realm roles (any-of). Empty/undefined = no role gate. */
  requiredRoles?: string[];
  /** Subtle visual variant */
  variant?: 'default' | 'overdue';
}

export interface RailGroup {
  /** Group label, e.g. "Snel filter". Optional — omit for the main group. */
  label?: string;
  items: RailItem[];
}

export interface ModeConfig {
  id: ModeId;
  label: string;
  /** Default section id when the mode is opened with no memory */
  defaultSectionId: string;
  /** Sidebar groups, top to bottom */
  groups: RailGroup[];
}

/**
 * Default mode definitions. Tenants may override the items in each group via
 * a future `tenants.json` extension; for now this is the canonical layout.
 *
 * Mapping derived from V1's `tenants.flevoland.leftPanelSections`:
 *   - Werk    ← (no V1 equivalent — V2-native; daily-work surface for Taken)
 *   - Zoeken  ← V1 "Home" tab (public reference + Berichten)
 *   - Beheer  ← V1 "Persoonlijke info" + "Projecten" + "IOU" + "Audit log" + "Gereedschap"
 */
export const MODES: ModeConfig[] = [
  {
    id: 'werk',
    label: 'Werk',
    defaultSectionId: 'taken',
    groups: [
      {
        items: [{ id: 'taken', label: 'Taken', badgeKey: 'taskCount', authRequired: true }],
      },
      {
        label: 'Snel filter',
        items: [
          { id: 'filter-overdue', label: 'Te laat', authRequired: true, variant: 'overdue' },
          { id: 'filter-waiting', label: 'Wacht op mij', authRequired: true },
          { id: 'filter-today', label: 'Vandaag', authRequired: true },
          { id: 'filter-week', label: 'Deze week', authRequired: true },
        ],
      },
      {
        // DVTP exists as components but isn't wired in V1's Flevoland config —
        // gated by tenant feature flag (`features.dvtp`) in V1. Phase 2 will
        // verify and port the gate; for now keep visible but auth-required.
        label: 'DVTP',
        items: [
          { id: 'dvtp-start', label: 'DVTP starten', authRequired: true },
          { id: 'dvtp-taken', label: 'DVTP taken', authRequired: true },
        ],
      },
    ],
  },
  {
    id: 'zoeken',
    label: 'Zoeken',
    defaultSectionId: 'berichten',
    groups: [
      {
        // V1 Home order: Berichten → Nieuws → Producten → Regels → Processen → Woordenboek
        items: [
          { id: 'berichten', label: 'Berichten', badgeKey: 'unread' },
          { id: 'nieuws', label: 'Nieuws' },
          { id: 'producten-diensten', label: 'Producten & Diensten' },
          { id: 'regelcatalogus', label: 'Regelcatalogus' },
          { id: 'procesbibliotheek', label: 'Procesbibliotheek' },
          { id: 'gegevenswoordenboek', label: 'Gegevenswoordenboek' },
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
        // V1 "Persoonlijke info" → Account
        label: 'Account',
        items: [
          { id: 'profiel', label: 'Profiel', authRequired: true },
          { id: 'rollen', label: 'Rollen & rechten', authRequired: true },
        ],
      },
      {
        // V1 "Persoonlijke info" → Onboarding
        label: 'Onboarding',
        items: [
          { id: 'hr-onboarding', label: 'Medewerker onboarden', authRequired: true },
          { id: 'onboarding-archief', label: 'Afgeronde onboardingen', authRequired: true },
        ],
      },
      {
        // V1 "Persoonlijke info" → Capaciteit (Flevoland-specific)
        label: 'Capaciteit',
        items: [
          { id: 'capacity-claim', label: 'Start capacity claim', authRequired: true },
          { id: 'capacity-claim-archief', label: 'Completed capacity claims', authRequired: true },
        ],
      },
      {
        // V1 "Projecten" — RIP flows + Actieve zaken + Archief
        label: 'Projecten',
        items: [
          { id: 'rip-fase1', label: 'RIP Fase 1 starten', authRequired: true },
          { id: 'rip-fase1-wip', label: 'RIP Fase 1 WIP', authRequired: true },
          { id: 'rip-fase1-gereed', label: 'RIP Fase 1 gereed', authRequired: true },
          { id: 'archief', label: 'Archief', authRequired: true },
        ],
      },
      {
        // V1 "IOU" tab
        label: 'IOU',
        items: [
          { id: 'iou-gebruiksscenario', label: 'Gebruiksscenario indienen', authRequired: true },
          { id: 'iou-feedback', label: 'Feedback geven', authRequired: true },
          { id: 'iou-actieve-zaken', label: 'Actieve zaken', badgeKey: 'iouCount' },
          { id: 'iou-archief', label: 'Archief' },
        ],
      },
      {
        // V1 "Gereedschap" + "Audit log" tabs collapsed under one header
        label: 'Hulpmiddelen',
        items: [
          { id: 'gereedschap-overzicht', label: 'Gereedschap', authRequired: true },
          {
            id: 'audit-overzicht',
            label: 'Audit log',
            authRequired: true,
            requiredRoles: ['admin'],
          },
        ],
      },
    ],
  },
];

/** Find which mode owns a given section id (for ⌘K jumps). */
export function findModeForSection(sectionId: string): ModeId | null {
  for (const mode of MODES) {
    for (const group of mode.groups) {
      if (group.items.some((i) => i.id === sectionId)) return mode.id;
    }
  }
  return null;
}

/** All non-filter section ids — used by the command palette to search. */
export function allSearchableSections(): RailItem[] {
  const out: RailItem[] = [];
  for (const mode of MODES) {
    for (const group of mode.groups) {
      for (const item of group.items) {
        if (!item.id.startsWith('filter-')) out.push(item);
      }
    }
  }
  return out;
}
