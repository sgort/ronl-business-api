/**
 * Node status vocabulary for process diagrams: what a node's status key
 * means and how it is drawn. Moved from pages/infra-board/rip-model.ts so
 * the shared process view does not depend on one dashboard; rip-model
 * re-exports both names for its own importers.
 *
 * Colours are the shared tokens (packages/shared/styles/tokens.css), so they
 * follow the Flevoland tenant's status colours (#374); consumers use them in
 * style props only, where var() works. wachtend has no status token: a data
 * colour.
 */
export type StatusKey = 'done' | 'active' | 'wachtend' | 'risk' | 'overdue' | 'action' | 'todo';

export const STATUS: Record<
  StatusKey,
  { label: string; short: string; color: string; glyph: string }
> = {
  done: { label: 'Afgerond', short: 'Afgerond', color: 'var(--rba-ok)', glyph: '✓' },
  active: { label: 'Loopt', short: 'Loopt', color: 'var(--rba-flevoland-blue)', glyph: '●' },
  wachtend: { label: 'Wachtend', short: 'Wacht', color: '#7a5af0', glyph: '○' },
  risk: { label: 'Risico', short: 'Risico', color: 'var(--rba-warn)', glyph: '▲' },
  overdue: { label: 'Te laat', short: 'Te laat', color: 'var(--rba-bad)', glyph: '■' },
  action: { label: 'Actie nodig', short: 'Actie', color: 'var(--rba-flevoland-pink)', glyph: '!' },
  todo: { label: 'Niet gestart', short: 'Gepland', color: 'var(--rba-idle)', glyph: '' },
};
