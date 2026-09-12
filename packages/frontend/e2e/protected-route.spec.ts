import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

// Phase 1 item 3 — ProtectedRoute cross-role redirect.
//
// Both gaps found here (see the testing docs' Phase 1 item 3
// note) are now fixed:
//
// 1. keycloak.init() used to only ever be called inside AuthCallback.tsx.
//    ProtectedRoute checked keycloak.authenticated synchronously with no
//    init of its own, so a FULL page navigation (URL bar, bookmark, page
//    refresh) to /dashboard/citizen always saw authenticated=false — even
//    with a live Keycloak SSO session — and bounced to '/'. Fixed:
//    ProtectedRoute now does its own idempotent check-sso init
//    (services/keycloak.ts's initializeKeycloak()) on mount before
//    deciding anything.
// 2. /dashboard/caseworker was NOT wrapped in ProtectedRoute at all — a
//    citizen who navigated there directly just stayed, since
//    CaseworkerDashboardV2 only self-gates by filtering which rail items
//    are visible, it never redirects a wrong-role user away. Fixed: the
//    route is now wrapped in <ProtectedRoute requiredRole="caseworker">
//    too, same as /dashboard/citizen. Trade-off accepted knowingly:
//    CaseworkerDashboardV2 has its own public "zoeken" mode for
//    unauthenticated visitors, which this route-level guard now also
//    blocks — out of scope for this fix, flagged separately if needed.

test('a fresh page load of /dashboard/citizen redirects an authenticated caseworker to /dashboard/caseworker', async ({
  page,
}) => {
  await loginAsMedewerker(page, 'test-caseworker-flevoland', 'test123');
  // Full navigation, not an in-app link click — this is what used to expose
  // the missing check-sso init on this route.
  await page.goto('/dashboard/citizen');
  await expect(page).toHaveURL(/\/dashboard\/caseworker$/);
});

test('citizen hitting /dashboard/caseworker directly is redirected to /dashboard/citizen', async ({
  page,
}) => {
  await loginAsMedewerker(page, 'test-citizen-flevoland', 'test123');
  await page.goto('/dashboard/caseworker');
  await expect(page).toHaveURL(/\/dashboard\/citizen$/);
});

test('DigiD login still works after an unauthenticated visit to a protected route in the same tab', async ({
  page,
}) => {
  // Regression found while fixing the two gaps above: the first version of
  // initializeKeycloak() memoized whichever options its FIRST caller
  // passed, for the lifetime of the page. Visiting /dashboard/caseworker
  // while logged out (ProtectedRoute's check-sso, resolves false) followed
  // by "Login met DigiD" (which wanted a real login-required + idpHint
  // init) got AuthCallback back the *already-resolved* false from
  // ProtectedRoute's earlier call instead — the real DigiD redirect never
  // fired, and the citizen flow reported "Authenticatie mislukt" even
  // though nothing had actually gone wrong. Fixed by always using a fixed
  // check-sso init and triggering the real redirect via a separate
  // keycloak.login(...) call, which has no "only once" restriction.
  await page.goto('/dashboard/caseworker');
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: 'Inwoner? Log in met DigiD' }).click();

  await page.locator('#username').waitFor({ timeout: 10_000 });
  await page.locator('#username').fill('test-citizen-flevoland');
  await page.locator('#password').fill('test123');
  await page.locator('#kc-login').click();

  await expect(page).toHaveURL(/\/dashboard\/citizen$/, { timeout: 15_000 });
});
