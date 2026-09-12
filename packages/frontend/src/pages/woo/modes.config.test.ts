import { describe, expect, it } from 'vitest';
import { WOO_GATE_ROLE, WOO_TABS } from './modes.config';

describe('woo modes.config', () => {
  it('exposes the gate role used to guard the Woo dashboard', () => {
    expect(WOO_GATE_ROLE).toBe('woo-coordinatie');
  });

  it('lists all six tabs in display order with the expected ids', () => {
    expect(WOO_TABS.map((t) => t.id)).toEqual([
      'overzicht',
      'verzoeken',
      'tijdigheid',
      'proces',
      'publicatie',
      'bezwaar',
    ]);
  });

  it('gives bezwaar the combined "Bezwaar & beroep" label', () => {
    expect(WOO_TABS.find((t) => t.id === 'bezwaar')?.label).toBe('Bezwaar & beroep');
  });
});
