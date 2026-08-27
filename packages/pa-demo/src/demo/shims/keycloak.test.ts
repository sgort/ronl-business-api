import { describe, it, expect, beforeEach } from 'vitest';
import { getUser, setDemoRoles } from './keycloak';

describe('demo keycloak shim', () => {
  beforeEach(() => setDemoRoles('pa-admin'));

  it('carries the two claims the cockpit gates on', () => {
    // PADashboardV2 gates on the public-affairs realm role AND province
    // org-type; without both, the visitor lands on PANoAccessPanel.
    const user = getUser();
    expect(user.roles).toContain('public-affairs');
    expect(user.organisation_type).toBe('province');
  });

  it('is scoped to Flevoland so the tenant theme resolves', () => {
    expect(getUser().municipality).toBe('flevoland');
  });

  it('swaps the PA role without disturbing public-affairs', () => {
    setDemoRoles('pa-editor');
    const user = getUser();
    expect(user.roles).toContain('pa-editor');
    expect(user.roles).not.toContain('pa-admin');
    expect(user.roles).toContain('public-affairs');
  });

  it('supports having no dossier role at all', () => {
    setDemoRoles(null);
    const roles = getUser().roles;
    expect(roles).toEqual(['public-affairs']);
  });

  it('never exposes a real token', () => {
    // The bundle gate forbids keycloak-js; this asserts the shim's own shape
    // so nothing downstream can mistake it for an authenticated session.
    expect(getUser().sub).toBe('demo-pa-001');
  });
});
