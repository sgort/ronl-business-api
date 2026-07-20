import { describe, expect, it } from 'vitest';
import {
  WOO_FILTERS,
  WOO_REGISTER,
  wooAnyActive,
  wooDefaultFilters,
  wooFilterRows,
} from './woo.data';

describe('WOO_REGISTER (deterministic seeded fixture)', () => {
  it('generates exactly 218 rows with unique, correctly formatted ids', () => {
    expect(WOO_REGISTER).toHaveLength(218);
    const ids = WOO_REGISTER.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^WOO-2026-\d{5}$/);
  });

  it('is sorted ascending by ontvangen date (dd-mm)', () => {
    const key = (dd: string) => {
      const [d, m] = dd.split('-').map(Number);
      return m * 100 + d; // coarse but sufficient for a within-half-year ordering check
    };
    const keys = WOO_REGISTER.map((r) => key(r.ontvangen));
    // Allow same-day ties, but never a later row appearing before an earlier one.
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).toBeGreaterThanOrEqual(keys[i - 1]);
    }
  });

  it('only ever marks bezwaar true for closed (Gesloten) requests', () => {
    expect(WOO_REGISTER.every((r) => !r.bezwaar || r.status === 'Gesloten')).toBe(true);
  });

  it('gives every row a positive dagen count', () => {
    expect(WOO_REGISTER.every((r) => r.dagen > 0)).toBe(true);
  });
});

describe('wooDefaultFilters', () => {
  it('maps every filter id to its first (default) option', () => {
    const defaults = wooDefaultFilters();
    for (const filter of WOO_FILTERS) {
      expect(defaults[filter.id]).toBe(filter.opts[0]);
    }
  });
});

describe('wooAnyActive', () => {
  it('is false for the default filter set', () => {
    expect(wooAnyActive(wooDefaultFilters())).toBe(false);
  });

  it('is false for an empty filters object', () => {
    expect(wooAnyActive({})).toBe(false);
  });

  it('is true once a single filter deviates from its default', () => {
    const filters = { ...wooDefaultFilters(), status: 'Gesloten' };
    expect(wooAnyActive(filters)).toBe(true);
  });
});

describe('wooFilterRows', () => {
  it('returns every row unchanged under the default filters', () => {
    expect(wooFilterRows(WOO_REGISTER, wooDefaultFilters())).toHaveLength(WOO_REGISTER.length);
  });

  it('excludes every row when jaar is set to anything other than 2026 (all rows are 2026)', () => {
    const filters = { ...wooDefaultFilters(), jaar: '2025' };
    expect(wooFilterRows(WOO_REGISTER, filters)).toHaveLength(0);
  });

  it('filters by status: "Gesloten" keeps only closed requests', () => {
    const filters = { ...wooDefaultFilters(), status: 'Gesloten' };
    const result = wooFilterRows(WOO_REGISTER, filters);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.status === 'Gesloten')).toBe(true);
  });

  it('filters by status: "In behandeling" excludes both Gesloten and Over termijn', () => {
    const filters = { ...wooDefaultFilters(), status: 'In behandeling' };
    const result = wooFilterRows(WOO_REGISTER, filters);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.status !== 'Gesloten' && r.status !== 'Over termijn')).toBe(true);
  });

  it('filters by an actual afdeling present in the register', () => {
    const afdeling = WOO_REGISTER[0].afdeling;
    const filters = { ...wooDefaultFilters(), afdeling };
    const result = wooFilterRows(WOO_REGISTER, filters);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.afdeling === afdeling)).toBe(true);
  });

  it('filters by bron', () => {
    const bron = WOO_REGISTER[0].bron;
    const filters = { ...wooDefaultFilters(), bron };
    const result = wooFilterRows(WOO_REGISTER, filters);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.bron === bron)).toBe(true);
  });

  it('filters by kwartaal, matching the quarter derived from the ontvangen month', () => {
    const monthOf = (ontvangen: string) => parseInt(ontvangen.split('-')[1], 10);
    const qOf = (m: number) => (m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4');
    const targetQ = qOf(monthOf(WOO_REGISTER[0].ontvangen));

    const filters = { ...wooDefaultFilters(), kwartaal: targetQ };
    const result = wooFilterRows(WOO_REGISTER, filters);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => qOf(monthOf(r.ontvangen)) === targetQ)).toBe(true);
  });
});
