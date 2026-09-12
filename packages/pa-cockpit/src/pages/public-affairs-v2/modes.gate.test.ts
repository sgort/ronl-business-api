// packages/pa-cockpit/src/pages/public-affairs-v2/modes.gate.test.ts
import { describe, it, expect } from 'vitest';
import { isPaItemVisible, type PaGateContext, type PaRailItem } from './modes.config';

// The shell already gates the whole cockpit on the public-affairs realm role
// and the province org type (see PADashboardV2), so no shipped rail item sets
// these fields yet. That is exactly why they need their own tests: the gate is
// the mechanism a future fine-grained item will rely on, and nothing else
// exercises its three deny paths.
const ctx = (over: Partial<PaGateContext> = {}): PaGateContext => ({
  isAuthenticated: true,
  userRoles: ['public-affairs'],
  userOrgType: 'province',
  ...over,
});

const item = (over: Partial<PaRailItem> = {}): PaRailItem => ({
  id: 'vandaag',
  label: 'Vandaag',
  ...over,
});

describe('isPaItemVisible', () => {
  it('shows an ungated item to anyone, signed in or not', () => {
    expect(isPaItemVisible(item(), ctx())).toBe(true);
    expect(isPaItemVisible(item(), ctx({ isAuthenticated: false, userRoles: [] }))).toBe(true);
  });

  it('hides an auth-required item from an anonymous visitor', () => {
    expect(isPaItemVisible(item({ authRequired: true }), ctx({ isAuthenticated: false }))).toBe(
      false
    );
    expect(isPaItemVisible(item({ authRequired: true }), ctx())).toBe(true);
  });

  it('requires at least one of the listed roles, not all of them', () => {
    const gated = item({ requiredRoles: ['pa-admin', 'pa-editor'] });
    expect(isPaItemVisible(gated, ctx({ userRoles: ['pa-editor'] }))).toBe(true);
    expect(isPaItemVisible(gated, ctx({ userRoles: ['pa-author'] }))).toBe(false);
    expect(isPaItemVisible(gated, ctx({ userRoles: [] }))).toBe(false);
  });

  it('ignores an empty requiredRoles list rather than hiding everything', () => {
    // An item written with `requiredRoles: []` means "no role gate"; reading it
    // as "no role satisfies this" would silently blank a rail entry.
    expect(isPaItemVisible(item({ requiredRoles: [] }), ctx({ userRoles: [] }))).toBe(true);
  });

  it('requires a matching org type when one is listed', () => {
    const gated = item({ requiredOrgTypes: ['province', 'national'] });
    expect(isPaItemVisible(gated, ctx({ userOrgType: 'province' }))).toBe(true);
    expect(isPaItemVisible(gated, ctx({ userOrgType: 'municipality' }))).toBe(false);
  });

  it('hides an org-gated item when the org type is unknown', () => {
    // tenant config can be absent (not loaded, or a token with no org claim).
    // Unknown must fail closed: showing a province-only surface to an
    // unidentified tenant is the failure that matters here.
    const gated = item({ requiredOrgTypes: ['province'] });
    expect(isPaItemVisible(gated, ctx({ userOrgType: null }))).toBe(false);
    expect(isPaItemVisible(gated, ctx({ userOrgType: undefined }))).toBe(false);
  });

  it('ignores an empty requiredOrgTypes list', () => {
    expect(isPaItemVisible(item({ requiredOrgTypes: [] }), ctx({ userOrgType: null }))).toBe(true);
  });

  it('applies every gate, not just the first one that passes', () => {
    const gated = item({
      authRequired: true,
      requiredRoles: ['pa-admin'],
      requiredOrgTypes: ['province'],
    });
    expect(isPaItemVisible(gated, ctx({ userRoles: ['pa-admin'] }))).toBe(true);
    expect(
      isPaItemVisible(gated, ctx({ userRoles: ['pa-admin'], userOrgType: 'municipality' }))
    ).toBe(false);
  });
});
