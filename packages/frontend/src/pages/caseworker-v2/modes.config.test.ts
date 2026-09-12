import { describe, expect, it } from 'vitest';
import {
  allSearchableSections,
  findModeForSection,
  isRailItemVisible,
  MODES,
  tenantSectionIdsFrom,
  type GateContext,
  type RailItem,
} from './modes.config';

function ctx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    isAuthenticated: true,
    userRoles: [],
    userOrgType: null,
    tenantSectionIds: null,
    ...overrides,
  };
}

describe('isRailItemVisible', () => {
  const plainAuth: RailItem = { id: 'profiel', label: 'Profiel', authRequired: true };

  it('hides an auth-required item from an unauthenticated user', () => {
    expect(isRailItemVisible(plainAuth, ctx({ isAuthenticated: false }))).toBe(false);
  });

  it('shows an auth-required item to an authenticated user with no other gates', () => {
    expect(isRailItemVisible(plainAuth, ctx())).toBe(true);
  });

  it('skips the tenant gate while tenantSectionIds is null (not loaded yet)', () => {
    expect(isRailItemVisible(plainAuth, ctx({ tenantSectionIds: null }))).toBe(true);
  });

  it("hides an item missing from the tenant's section list once it has loaded", () => {
    expect(
      isRailItemVisible(plainAuth, ctx({ tenantSectionIds: new Set(['some-other-section']) }))
    ).toBe(false);
  });

  it("shows an item present in the tenant's section list", () => {
    expect(isRailItemVisible(plainAuth, ctx({ tenantSectionIds: new Set(['profiel']) }))).toBe(
      true
    );
  });

  it('lets shell-global sections (e.g. "taken") bypass the tenant gate entirely', () => {
    const taken: RailItem = { id: 'taken', label: 'Taken', authRequired: true };
    expect(isRailItemVisible(taken, ctx({ tenantSectionIds: new Set(['unrelated']) }))).toBe(true);
  });

  it('hides a role-gated item from a user without any of the required roles', () => {
    const item: RailItem = { id: 'x', label: 'X', requiredRoles: ['admin'] };
    expect(isRailItemVisible(item, ctx({ userRoles: ['caseworker'] }))).toBe(false);
  });

  it('shows a role-gated item to a user with one of several required roles', () => {
    const item: RailItem = { id: 'x', label: 'X', requiredRoles: ['admin', 'manager'] };
    expect(isRailItemVisible(item, ctx({ userRoles: ['manager'] }))).toBe(true);
  });

  it('hides an org-type-gated item when the user has no organisation type', () => {
    const item: RailItem = { id: 'x', label: 'X', requiredOrgTypes: ['municipality'] };
    expect(isRailItemVisible(item, ctx({ userOrgType: null }))).toBe(false);
  });

  it("hides an org-type-gated item when the user's type is not in the list", () => {
    const item: RailItem = { id: 'x', label: 'X', requiredOrgTypes: ['municipality'] };
    expect(isRailItemVisible(item, ctx({ userOrgType: 'province' }))).toBe(false);
  });

  it("shows an org-type-gated item when the user's type matches", () => {
    const item: RailItem = { id: 'x', label: 'X', requiredOrgTypes: ['municipality'] };
    expect(isRailItemVisible(item, ctx({ userOrgType: 'municipality' }))).toBe(true);
  });
});

describe('tenantSectionIdsFrom', () => {
  it('returns null for undefined or null input', () => {
    expect(tenantSectionIdsFrom(undefined)).toBeNull();
    expect(tenantSectionIdsFrom(null)).toBeNull();
  });

  it('flattens section ids across every page into one set', () => {
    const result = tenantSectionIdsFrom({
      home: [{ id: 'berichten' }, { id: 'nieuws' }],
      persoonlijk: [{ id: 'profiel' }],
    });

    expect(result).toEqual(new Set(['berichten', 'nieuws', 'profiel']));
  });
});

describe('findModeForSection', () => {
  it('resolves section ids to their owning mode', () => {
    expect(findModeForSection('taken')).toBe('werk');
    expect(findModeForSection('berichten')).toBe('zoeken');
    expect(findModeForSection('profiel')).toBe('beheer');
  });

  it('returns null for an unknown section id', () => {
    expect(findModeForSection('does-not-exist')).toBeNull();
  });
});

describe('allSearchableSections', () => {
  it('excludes quick-filter sections but includes everything else', () => {
    const ids = allSearchableSections().map((s) => s.id);

    expect(ids.some((id) => id.startsWith('filter-'))).toBe(false);
    expect(ids).toContain('taken');
    expect(ids).toContain('berichten');
    expect(ids).toContain('profiel');
  });
});

describe('simulatie mode', () => {
  it('exists between zoeken and beheer', () => {
    const ids = MODES.map((m) => m.id);
    const zoekenIdx = ids.indexOf('zoeken');
    const beheerIdx = ids.indexOf('beheer');
    const simIdx = ids.indexOf('simulatie');
    expect(simIdx).toBeGreaterThan(zoekenIdx);
    expect(simIdx).toBeLessThan(beheerIdx);
  });

  it('has a single regelsimulatie rail item as its default section', () => {
    const mode = MODES.find((m) => m.id === 'simulatie')!;
    expect(mode.defaultSectionId).toBe('regelsimulatie');
    const allIds = mode.groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).toEqual(['regelsimulatie']);
  });

  it('regelsimulatie requires authentication', () => {
    const item = MODES.find((m) => m.id === 'simulatie')!.groups[0].items[0];
    expect(item.authRequired).toBe(true);
  });

  it('regelsimulatie is visible to a signed-in user regardless of tenant config, and hidden when signed out', () => {
    const item = MODES.find((m) => m.id === 'simulatie')!.groups[0].items[0];
    // tenantSectionIds loaded, but doesn't list 'regelsimulatie' (as no real
    // tenants.json does yet) — must still be visible because it's shell-global.
    const tenantSectionIds = new Set(['berichten', 'nieuws']);
    expect(
      isRailItemVisible(item, {
        isAuthenticated: true,
        userRoles: [],
        userOrgType: null,
        tenantSectionIds,
      })
    ).toBe(true);
    expect(
      isRailItemVisible(item, {
        isAuthenticated: false,
        userRoles: [],
        userOrgType: null,
        tenantSectionIds,
      })
    ).toBe(false);
  });

  it('findModeForSection resolves regelsimulatie to simulatie', () => {
    expect(findModeForSection('regelsimulatie')).toBe('simulatie');
  });
});
