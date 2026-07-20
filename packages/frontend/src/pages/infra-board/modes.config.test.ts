import { describe, expect, it } from 'vitest';
import {
  findModeForSection,
  INFRA_GATE_ROLE,
  isRailItemVisible,
  type InfraRailItem,
} from './modes.config';

describe('findModeForSection', () => {
  it('resolves each section id to the mode that owns it', () => {
    expect(findModeForSection('overzicht')).toBe('mijn-dag');
    expect(findModeForSection('project-updates')).toBe('mijn-dag');
    expect(findModeForSection('portfolio')).toBe('portfolio');
    expect(findModeForSection('rip-fase1-wip')).toBe('beheer');
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
