export type WooTabId =
  | 'overzicht'
  | 'verzoeken'
  | 'tijdigheid'
  | 'proces'
  | 'publicatie'
  | 'bezwaar';

export const WOO_GATE_ROLE = 'woo-coordinatie';

export interface WooTab {
  id: WooTabId;
  label: string;
}

export const WOO_TABS: WooTab[] = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'verzoeken', label: 'Verzoeken' },
  { id: 'tijdigheid', label: 'Tijdigheid' },
  { id: 'proces', label: 'Proces' },
  { id: 'publicatie', label: 'Publicatie' },
  { id: 'bezwaar', label: 'Bezwaar & beroep' },
];
