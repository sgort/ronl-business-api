import { describe, expect, it } from 'vitest';
import {
  findModeForSection,
  INFRA_GATE_ROLE,
  isRailItemVisible,
  phaseCodeFromSectionId,
  phaseSectionId,
  type InfraRailItem,
} from './modes.config';
import { RIP_PHASES } from './rip-phases.catalog';

describe('findModeForSection', () => {
  it('resolves each section id to the mode that owns it', () => {
    expect(findModeForSection('overzicht')).toBe('mijn-dag');
    expect(findModeForSection('project-updates')).toBe('mijn-dag');
    // Portfolio's rail carries stats only, no nav item with id 'portfolio' —
    // see the rail-stats-panel spec, Section 4. The top-nav tab still
    // routes to Portfolio directly via setMode, so this is expected.
    expect(findModeForSection('portfolio')).toBeNull();
    // Faseladder (like the 12 phase items and Archief) is hand-rendered by
    // InfraBoardDashboard.tsx now, not listed in modes.config's groups —
    // see the rail-stats-panel spec, Task 4. findModeForSection can't
    // resolve it from the static config anymore.
    expect(findModeForSection('faseladder')).toBeNull();
    expect(findModeForSection('profiel')).toBe('beheer');
  });

  it('returns null for an unknown section id', () => {
    expect(findModeForSection('does-not-exist')).toBeNull();
  });
});

describe('isRailItemVisible', () => {
  const authOnly: InfraRailItem = { id: 'x', label: 'X', authRequired: true };
  const roleGated: InfraRailItem = {
    id: 'y',
    label: 'Y',
    authRequired: true,
    requiredRoles: [INFRA_GATE_ROLE],
  };
  const openItem: InfraRailItem = { id: 'z', label: 'Z' };

  it('hides an auth-required item from an unauthenticated user', () => {
    expect(isRailItemVisible(authOnly, { isAuthenticated: false, userRoles: [] })).toBe(false);
  });

  it('shows an auth-required item (with no role gate) to any authenticated user', () => {
    expect(isRailItemVisible(authOnly, { isAuthenticated: true, userRoles: [] })).toBe(true);
  });

  it('hides a role-gated item from a user without any required role', () => {
    expect(isRailItemVisible(roleGated, { isAuthenticated: true, userRoles: ['other-role'] })).toBe(
      false
    );
  });

  it('shows a role-gated item to a user with the required role', () => {
    expect(
      isRailItemVisible(roleGated, { isAuthenticated: true, userRoles: [INFRA_GATE_ROLE] })
    ).toBe(true);
  });

  it('shows an item with neither authRequired nor requiredRoles regardless of context', () => {
    expect(isRailItemVisible(openItem, { isAuthenticated: false, userRoles: [] })).toBe(true);
  });
});

describe('phaseSectionId / phaseCodeFromSectionId', () => {
  it('round-trips every phase code', () => {
    for (const p of RIP_PHASES) {
      expect(phaseCodeFromSectionId(phaseSectionId(p.code))).toBe(p.code);
    }
  });

  it('returns undefined for a non-phase section id', () => {
    expect(phaseCodeFromSectionId('archief')).toBeUndefined();
  });
});
