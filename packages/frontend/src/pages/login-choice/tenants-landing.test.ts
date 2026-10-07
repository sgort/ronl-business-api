import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { BOARDS } from './boards.config';
import type { TenantConfig } from '../../services/tenant';

// The landing page reads these fields from the real tenants.json; a typo in an
// id or a logo path would only show up on the deployed page.
const PUBLIC = join(__dirname, '../../../public');
const REALM = join(__dirname, '../../../../../config/keycloak/ronl-realm.json');

const tenants: TenantConfig[] = Object.values(
  JSON.parse(readFileSync(join(PUBLIC, 'tenants.json'), 'utf8')).tenants
);
const realmUsers = new Set<string>(
  JSON.parse(readFileSync(REALM, 'utf8')).users.map((u: { username: string }) => u.username)
);
const boardIds = new Set<string>(BOARDS.map((b) => b.id));

describe('tenants.json landing fields', () => {
  it.each(tenants.filter((t) => t.boards).map((t) => [t.id, t] as const))(
    '%s lists only known boards',
    (_id, tenant) => {
      expect(tenant.boards?.length).toBeGreaterThan(0);
      for (const id of tenant.boards ?? []) expect(boardIds).toContain(id);
    }
  );

  it.each(tenants.filter((t) => t.logo).map((t) => [t.id, t] as const))(
    "%s's logo is in public/",
    (_id, tenant) => {
      expect(['wide', 'square']).toContain(tenant.logo?.shape);
      expect(existsSync(join(PUBLIC, tenant.logo?.src ?? ''))).toBe(true);
    }
  );

  // The single-board CTA hints test-caseworker-<tenant id> at the Keycloak form,
  // and its DigiD link test-citizen-<tenant id>.
  it.each(
    tenants
      .filter((t) => t.enabled && t.boards?.length === 1 && t.boards[0] === 'caseworker')
      .map((t) => [t.id] as const)
  )('%s has a test caseworker and a test citizen in the local realm', (id) => {
    expect(realmUsers).toContain(`test-caseworker-${id}`);
    expect(realmUsers).toContain(`test-citizen-${id}`);
  });
});
