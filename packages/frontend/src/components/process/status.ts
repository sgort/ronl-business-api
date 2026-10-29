/**
 * Node status vocabulary for process diagrams: what a node's status key
 * means and how it is drawn. Moved from pages/infra-board/rip-model.ts so
 * the shared process view does not depend on one dashboard; rip-model
 * re-exports both names for its own importers.
 */
export type StatusKey = 'done' | 'active' | 'wachtend' | 'risk' | 'overdue' | 'action' | 'todo';

export const STATUS: Record<
  StatusKey,
  { label: string; short: string; color: string; glyph: string }
> = {
  done: { label: 'Afgerond', short: 'Afgerond', color: '#3fa535', glyph: '✓' },
  active: { label: 'Loopt', short: 'Loopt', color: '#0046ad', glyph: '●' },
  wachtend: { label: 'Wachtend', short: 'Wacht', color: '#7a5af0', glyph: '○' },
  risk: { label: 'Risico', short: 'Risico', color: '#e5b700', glyph: '▲' },
  overdue: { label: 'Te laat', short: 'Te laat', color: '#b0103c', glyph: '■' },
  action: { label: 'Actie nodig', short: 'Actie', color: '#e70077', glyph: '!' },
  todo: { label: 'Niet gestart', short: 'Gepland', color: '#c2c7d0', glyph: '' },
};
