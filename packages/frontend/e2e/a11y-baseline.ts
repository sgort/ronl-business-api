/**
 * Known accessibility findings, per page (#409). accessibility.spec.ts fails
 * on any critical or serious axe violation not listed here, and on an entry
 * here that no longer occurs: fix a finding, then remove its entry.
 *
 * Measured 2026-11-03 on the local stack (axe-core 4.13, WCAG 2.0–2.2 A/AA),
 * before step 2 of the Flevoland look (#405). Every entry says why it is
 * here and where it gets fixed.
 */
export type PageName =
  | 'landing'
  | 'sign-in screen'
  | 'keycloak medewerker'
  | 'keycloak prefilled'
  | 'keycloak plain'
  | 'caseworker v2'
  | 'infra-board'
  | 'woo'
  | 'pa-cockpit'
  | 'caseworker v2 heusden';

export type KnownFinding = { rule: string; target: string; reason: string };

/** The ⌘K hint in the search box: one shared rule in packages/shared/styles/v2-chrome.css. */
const KEY_HINT =
  '⌘K hint in the top-bar search: 88% white on 18% white over the brand, 3.78:1. Fixed in #405, which restyles the chrome';
/** Heusden's theme and the default neutrals; Flevoland passes on these elements. */
const ON_ACCENT = 'white text on the tenant accent fill (Heusden #7ab929), 2.38:1. Fixed in #412';
const MUTED = 'default --rba-ink-3 on --rba-bg, 4.43:1. Fixed in #412';

export const BASELINE: Record<PageName, KnownFinding[]> = {
  landing: [],
  'sign-in screen': [],
  'keycloak medewerker': [],
  'keycloak prefilled': [],
  'keycloak plain': [],
  'caseworker v2': [{ rule: 'color-contrast', target: '.v2-key', reason: KEY_HINT }],
  'infra-board': [{ rule: 'color-contrast', target: '.v2-key', reason: KEY_HINT }],
  woo: [{ rule: 'color-contrast', target: '.v2-key', reason: KEY_HINT }],
  'pa-cockpit': [{ rule: 'color-contrast', target: '.pac-key', reason: KEY_HINT }],
  'caseworker v2 heusden': [
    { rule: 'color-contrast', target: '.v2-key', reason: KEY_HINT },
    { rule: 'color-contrast', target: '.v2-rail-card', reason: ON_ACCENT },
    { rule: 'color-contrast', target: '.v2-dock-toggle', reason: ON_ACCENT },
    { rule: 'color-contrast', target: '.v2-rail-group-label', reason: MUTED },
    { rule: 'color-contrast', target: '.v2-taken-filters-title', reason: MUTED },
    { rule: 'color-contrast', target: '.v2-taken-refresh', reason: MUTED },
  ],
};
