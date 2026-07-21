import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

// Phase 1 item 3 — ProtectedRoute cross-role redirect.
//
// Two found-not-fixed gaps documented here (see docs/TESTING-FRONTEND-UI.md's
// Phase 1 item 3 note), neither exercised by the Vitest/RTL suite since that
// mocks keycloak.ts entirely and never goes through a real page load:
//
// 1. keycloak.init() is only ever called inside AuthCallback.tsx.
//    ProtectedRoute checks keycloak.authenticated synchronously with no
//    init of its own, so a FULL page navigation (URL bar, bookmark, page
//    refresh) to /dashboard/citizen always sees authenticated=false — even
//    with a live Keycloak SSO session — and bounces to '/'. The intended
//    "wrong-role redirect" behavior only fires via client-side SPA
//    navigation while already authenticated in-memory, never via a real
//    page load.
// 2. /dashboard/caseworker is NOT wrapped in ProtectedRoute at all —
//    CaseworkerDashboardV2 self-gates by filtering which rail items are
//    visible per role, it never redirects a wrong-role user away.

test('a fresh page load of /dashboard/citizen always redirects to / — found, not fixed', async ({
  page,
}) => {
  await loginAsMedewerker(page, 'test-caseworker-flevoland', 'test123');
  // Full navigation, not an in-app link click — this is what exposes the
  // missing check-sso init on this route.
  await page.goto('/dashboard/citizen');
  await expect(page).toHaveURL(/\/$/);
});

test('citizen hitting /dashboard/caseworker is NOT redirected — found, not fixed', async ({
  page,
}) => {
  await loginAsMedewerker(page, 'test-citizen-flevoland', 'test123');
  await page.goto('/dashboard/caseworker');
  // No ProtectedRoute guards this path, so the citizen stays here instead
  // of being sent to /dashboard/citizen.
  await expect(page).toHaveURL(/\/dashboard\/caseworker$/);
});
