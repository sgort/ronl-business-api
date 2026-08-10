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

export type OrgTypeGate = 'municipality' | 'province' | 'national' | 'commercial';

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
  /**
   * Required organisation types (any-of), read from `user.organisation_type`.
   * Empty/undefined = no org-type gate. Use sparingly — prefer the tenant
   * gate (via tenants.json) for tenant-specific features. This is for
   * cross-tenant rules like "all government" or "not commercial".
   */
  requiredOrgTypes?: OrgTypeGate[];
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
        // DVTP is a demonstration-only flow scoped to municipality
        // caseworkers (e.g. utrecht, amsterdam). Out of scope for
        // Flevoland (province) and the national tenants. Gate by
        // organisation type — `municipality` only.
        label: 'DVTP',
        items: [
          {
            id: 'dvtp-start',
            label: 'DVTP starten',
            authRequired: true,
            requiredOrgTypes: ['municipality'],
          },
          {
            id: 'dvtp-taken',
            label: 'DVTP taken',
            authRequired: true,
            requiredOrgTypes: ['municipality'],
          },
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
        // **Public library** — these six sections are accessible to
        // anonymous users via the "Verken openbare bibliotheek"
        // entry under the login wall, AND to all signed-in caseworkers.
        // No `authRequired`, no `requiredOrgTypes` (the org-type gate
        // would block anonymous users since `userOrgType` is null).
        // Civil-servant-only intent is enforced at the shell level
        // (commercial tenants don't have a caseworker dashboard at all).
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
          {
            id: 'hr-onboarding',
            label: 'Medewerker onboarden',
            authRequired: true,
            requiredRoles: ['hr-medewerker'],
          },
          {
            id: 'onboarding-archief',
            label: 'Afgeronde onboardingen',
            authRequired: true,
            requiredRoles: ['hr-medewerker'],
          },
        ],
      },
      {
        // V1 "Persoonlijke info" → Capaciteit (Flevoland-specific)
        label: 'Capaciteit',
        items: [
          {
            id: 'capacity-claim',
            label: 'Start capacity claim',
            authRequired: true,
            requiredRoles: ['manager'],
          },
          {
            id: 'capacity-claim-archief',
            label: 'Completed capacity claims',
            authRequired: true,
            // Any participant in the capacity-claim process. Mirrors
            // AUTHORISED_ROLES in CapacityClaimArchiefSection.tsx.
            requiredRoles: [
              'manager',
              'board-secretary',
              'board-director',
              'hrm-unit',
              'procurement-unit',
              'planning-control-officer',
              'financial-controller',
              'hr-business-partner',
              'personnel-controller',
            ],
          },
        ],
      },
      {
        // V1 "Projecten" — RIP flows + Actieve zaken + Archief
        label: 'Projecten',
        items: [
          {
            id: 'rip-fase1-wip',
            label: 'RIP Fase 1 WIP',
            authRequired: true,
            requiredRoles: ['infra-projectteam'],
          },
          {
            id: 'rip-fase1-gereed',
            label: 'RIP Fase 1 gereed',
            authRequired: true,
            requiredRoles: ['infra-projectteam'],
          },
          { id: 'archief', label: 'Archief', authRequired: true },
        ],
      },
      {
        // V1 "IOU" tab
        label: 'IOU',
        items: [
          { id: 'iou-gebruiksscenario', label: 'Gebruiksscenario indienen', authRequired: true },
          { id: 'iou-feedback', label: 'Feedback geven', authRequired: true },
          {
            id: 'iou-actieve-zaken',
            label: 'Actieve zaken',
            badgeKey: 'iouCount',
            authRequired: true,
          },
          { id: 'iou-archief', label: 'Archief', authRequired: true },
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
          {
            id: 'audit-details',
            label: 'Audit details',
            authRequired: true,
            requiredRoles: ['admin'],
          },
        ],
      },
    ],
  },
];

/**
 * Decide whether a rail item is visible to the given user/tenant context.
 *
 * Three gates, all must pass:
 *   1. Auth gate         — if `authRequired`, the user must be signed in
 *   2. Tenant gate       — the section id must appear in the tenant's
 *                          `leftPanelSections` (across any top-nav page).
 *                          Sections with no tenant entry anywhere
 *                          (`audit-*`, `gereedschap-overzicht`) are
 *                          considered shell-global and pass automatically.
 *   3. Role gate         — if `requiredRoles` is set, user.roles must
 *                          intersect (any-of)
 *   4. Org-type gate     — if `requiredOrgTypes` is set,
 *                          user.organisation_type must be in the list
 *
 * The same predicate is used by the rail filter AND the command palette,
 * so what's hidden is hidden everywhere. SectionRouter applies the role +
 * org-type checks again as defence-in-depth for stale URLs.
 */
export interface GateContext {
  isAuthenticated: boolean;
  userRoles: string[];
  userOrgType: OrgTypeGate | null | undefined;
  /** Section ids the active tenant lists in tenants.json (any page). */
  tenantSectionIds: ReadonlySet<string> | null;
}

/**
 * Section ids that V1 hardcodes in `CaseworkerDashboard.tsx` rather than
 * reading from `tenants.json`. They appear for every tenant and therefore
 * bypass the tenant gate.
 */
const SHELL_GLOBAL_SECTION_IDS: ReadonlySet<string> = new Set([
  'audit-overzicht',
  'audit-details',
  'gereedschap-overzicht',
  // V2-native, not in V1 tenants.json:
  'taken',
  'filter-overdue',
  'filter-waiting',
  'filter-today',
  'filter-week',
  'dvtp-start',
  'dvtp-taken',
]);

export function isRailItemVisible(item: RailItem, ctx: GateContext): boolean {
  if (item.authRequired && !ctx.isAuthenticated) return false;

  // Tenant gate — only applied if we know the tenant's section list.
  // Before tenants.json has loaded, ctx.tenantSectionIds is null and we
  // skip this gate so the rail isn't empty during the first render.
  if (ctx.tenantSectionIds && !SHELL_GLOBAL_SECTION_IDS.has(item.id)) {
    if (!ctx.tenantSectionIds.has(item.id)) return false;
  }

  if (item.requiredRoles && item.requiredRoles.length > 0) {
    if (!item.requiredRoles.some((r) => ctx.userRoles.includes(r))) return false;
  }

  if (item.requiredOrgTypes && item.requiredOrgTypes.length > 0) {
    if (!ctx.userOrgType || !item.requiredOrgTypes.includes(ctx.userOrgType)) return false;
  }

  return true;
}

/**
 * Build the tenant section-id set from a TenantConfig-like shape. Lives
 * here (not in services/tenant) to avoid a circular import; modes.config
 * is the lowest-level layer.
 */
export function tenantSectionIdsFrom(
  leftPanelSections: Record<string, { id: string }[]> | undefined | null
): ReadonlySet<string> | null {
  if (!leftPanelSections) return null;
  const out = new Set<string>();
  for (const page of Object.values(leftPanelSections)) {
    for (const s of page) out.add(s.id);
  }
  return out;
}

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
