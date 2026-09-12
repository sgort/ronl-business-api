import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

// Phase 1 item 2 — one test per role, Flevoland tenant (widest role set).
// See the E2E section of the testing docs for Phase 1 scope:
// https://iou-architectuur.open-regels.nl/ronl-business-api/developer/testing/overview/
// Password for every
// Flevoland test user is 'test123' (config/keycloak/ronl-realm.json).
const CASES = [
  { username: 'test-citizen-flevoland', dashboard: '/dashboard/citizen' },
  { username: 'test-caseworker-flevoland', dashboard: '/dashboard/caseworker' },
  { username: 'test-infra-flevoland', dashboard: '/dashboard/infra-board' },
  { username: 'test-woo-flevoland', dashboard: '/dashboard/woo' },
  { username: 'test-pa-flevoland', dashboard: '/dashboard/public-affairs' },
];

for (const { username, dashboard } of CASES) {
  test(`${username} logs in and lands on ${dashboard}`, async ({ page }) => {
    await loginAsMedewerker(page, username, 'test123');
    await expect(page).toHaveURL(new RegExp(dashboard.replace(/\//g, '\\/') + '$'));
  });
}
