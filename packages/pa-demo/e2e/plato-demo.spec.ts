import { test, expect, type Page } from '@playwright/test';

/**
 * The plato sales-demo script, driven end to end against the real vendored
 * shell — no mocking, no backend, no Keycloak. Modelled on
 * packages/frontend/e2e/pa-mock-journey.spec.ts (same idea: drive mock mode
 * for real rather than mocking the seam that broke last time), but plato
 * needs none of that spec's login/rate-limit/reload-reauth plumbing since
 * there is no backend and no session to lose.
 *
 * Task 15 removed the demo bar (`src/demo/DemoBar.tsx`) entirely: it
 * duplicated controls the cockpit already has in three places (the bar,
 * Beheer → Rollen & rechten, and Dossierbeheer's own inert role bar) plus two
 * resets. Role switching now lives only on Beheer → Rollen & rechten
 * (src/demo/RollenRechten.tsx); reset now lives only in Dossierbeheer's own
 * Mock banner ("↺ Reset demodata"). Every test below that used to reach for
 * the bar was rewritten to drive those two controls instead — see each
 * test's own comment for what moved and why the assertions it makes were
 * kept intact rather than weakened in the move.
 *
 * One accepted trade-off from that removal, not re-litigated here: the
 * "Demonstratie · fictieve gegevens" disclaimer the bar used to show on
 * every page now appears on no page in Vandaag, Monitoring or Voortgang. It
 * survives only on Profiel and inside Dossierbeheer's Mock banner — see the
 * landing-view test below, which guards that as the current, deliberately
 * accepted state rather than as an oversight.
 *
 * Selectors below were read off the running app (`npm run dev`, port 5176)
 * rather than guessed — see task-10-report.md (original selectors) and
 * task-15-report.md (the ones this task added or moved) for how. Two things
 * the vendored shell does NOT give this demo, discovered the same way:
 *
 *   - Every rail item and mode tab is a <button>, never an <a>/link. Asking
 *     for role "link" anywhere in this file would find nothing.
 *   - "Beheer" is a substring of "Beheerder" (a role button's label, now on
 *     Rollen & rechten and reflected — disabled — in Dossierbeheer), so the
 *     mode tab must be matched with `exact: true` or it also matches a role
 *     button whenever both are on screen.
 */

/** Rollen & rechten's own role buttons — this demo's actual, clickable role
 * switcher (src/demo/RollenRechten.tsx). Scoped to the `data-testid` its
 * wrapper carries for exactly this reason, not to the shared
 * `.pac-db-roleseg-btn` / `.pac-db-roleseg` classes: Dossierbeheer's
 * disabled, purely-reflective role readout renders the identical
 * `.pac-db-roleseg > .pac-db-roleseg-btn` structure (same button text,
 * different element, both role "button" — see DemoRoleContext.tsx /
 * Dossierbeheer.tsx), so a plain-class locator can't tell the two apart on
 * its own. The two are never mounted at once (DemoSectionRouter renders one
 * section at a time), but this scoping doesn't rely on that invariant —
 * it's a real container match, not a coincidence of what's on screen. */
function rollenRechtenRole(page: Page, label: string) {
  return page.getByTestId('rollen-roleseg').locator('.pac-db-roleseg-btn', { hasText: label });
}

/** Dossierbeheer's own role bar — rendered `disabled`, purely reflective of
 * whatever Rollen & rechten last set (see Dossierbeheer.tsx: "the role
 * follows from your Keycloak rights"). Scoped to `.pac-db-rolebar` for the
 * same reason as rollenRechtenRole above. */
function dossierbeheerActiveRole(page: Page) {
  return page.locator('.pac-db-rolebar .pac-db-roleseg-btn.active');
}

function railItem(page: Page, label: string) {
  return page.locator('.pac-rail-item', { hasText: label });
}

/**
 * Requests that look like they reached, or tried to reach, a backend — an
 * origin other than the app's own, or a same-origin path shaped like an API
 * call.
 *
 * "The app's own origin" is `baseURL` (the fixture Playwright derives from
 * playwright.config.ts's `use.baseURL`, which is always set — either
 * `E2E_BASE_URL` when running post-deploy, e.g.
 * https://acc.plato.open-regels.nl, or the local dev server otherwise), not
 * a hardcoded `localhost`/`127.0.0.1` pair. Hardcoding it broke the moment
 * this suite ran against a deployment: the app's own document, JS bundle and
 * stylesheet are then served from that deployed origin, which is off-host by
 * a literal-localhost check even though nothing left the app itself. Passed
 * in explicitly by the caller rather than read from `page.url()` inside the
 * listener, since the request that matters most (PaDataProvider's initial
 * fetchAgenda, see below) can fire before the first navigation resolves.
 *
 * Flagging only an off-origin request is still not enough on its own:
 * VITE_API_URL is unset in this demo, so a live-mode fetch builds
 * `${undefined}/pa/agenda` — a *relative* URL the browser resolves
 * same-origin, e.g. to http://localhost:5176/undefined/pa/agenda (or the
 * deployed origin's equivalent). That request never leaves the app's own
 * origin, so an origin-only check misses it entirely. A path that looks like
 * a backend call (contains /pa/ or /v1/, matching every real route this app
 * calls — see pa.api.ts / dossierbeheer.api.ts) is flagged regardless of
 * origin, which is what actually catches that regression; the origin check
 * is kept alongside it since it still catches a differently-shaped defect (a
 * request to a genuinely foreign host).
 *
 * Attached in beforeEach, before the first navigation, rather than inside
 * the "no backend" test itself: the one backend call this demo can make
 * (fetchAgenda, gated on VITE_PA_AGENDA_MOCK) fires from PaDataProvider's
 * initial mount — before any test-specific click — so a listener registered
 * later would already have missed it. Keyed per Page so each test's own
 * fresh browser context (Playwright's default) gets its own list.
 *
 * Static images are excluded, not by path but by how the browser itself
 * classified the request (`resourceType() === 'image'`). Since the second
 * vendor root started shipping packages/frontend/public's feiten-icons
 * PNGs (vendor-manifest.mjs's ASSET_FILES), a real, legitimate request —
 * `<img src="/pa/feiten-icons/wonen.png">` from FeitenCijfers.tsx — matches
 * the same `/\/(?:pa|v1)\//` path pattern the backend-path check above
 * exists to catch, and would otherwise be a false positive the moment any
 * test visits Feiten & cijfers (see the test below — none did before this).
 * resourceType() over a path/extension exclusion (e.g. matching `.png`)
 * because it reflects *how* the browser is using the response rather than
 * guessing from the URL shape: every real API call this app makes is a
 * `fetch`/`xhr` resourceType, never `image`, so this narrowing cannot hide
 * a genuine backend call that happens to have an image-shaped URL — it can
 * only hide requests the browser itself decided were image loads.
 */
const suspectRequests = new WeakMap<Page, string[]>();

function watchForBackendRequests(page: Page, baseURL: string | undefined): void {
  // baseURL comes from Playwright's own `baseURL` fixture, which mirrors
  // playwright.config.ts's `use.baseURL` — itself always set (`liveTarget ??
  // 'http://localhost:5176'`). It should never actually be undefined; failing
  // loudly here beats silently falling back to a guessed origin and quietly
  // disabling the origin half of the guard.
  if (!baseURL) {
    throw new Error('watchForBackendRequests: baseURL is required but was undefined');
  }
  const ownOrigin = new URL(baseURL).origin;
  const suspects: string[] = [];
  suspectRequests.set(page, suspects);
  page.on('request', (req) => {
    if (req.resourceType() === 'image') return;
    const url = new URL(req.url());
    const offOrigin = url.origin !== ownOrigin;
    const backendPath = /\/(?:pa|v1)\//.test(url.pathname);
    if (offOrigin || backendPath) suspects.push(req.url());
  });
}

test.beforeEach(async ({ page, baseURL }) => {
  watchForBackendRequests(page, baseURL);
  // Dossierbeheer's "↺ Reset demodata" (resetDemo in Dossierbeheer.tsx) is
  // gated on a window.confirm() the old demo-bar reset never had — the bar
  // called resetMockDemoData()/resetMockDossiers() directly. Auto-accepting
  // here, globally, is safe: it's the only window.confirm() in the app (see
  // `grep -rn window.confirm src/vendor` — one hit), so this can't mask a
  // dialog some other flow relies on being dismissed.
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  // Every test gets its own browser context (Playwright's default), so
  // localStorage and the in-memory mock stores already start empty, and
  // DemoRoleProvider's useState always initialises to 'beheerder'
  // (DemoRoleContext.tsx) — a fresh page load already normalises on the
  // Beheerder start role with no reset click required. Unlike the old
  // demo-bar reset (always on screen, one click), the surviving reset lives
  // two clicks deep inside Beheer → Dossierbeheer, so smoke-testing that it
  // actually works belongs in its own test below rather than in every
  // test's setup.
});

test('the landing view carries no disclaimer and offers no Live toggle', async ({ page }) => {
  // The demo bar used to show "Demonstratie · fictieve gegevens" on every
  // page, including this one. Task 15 removed the bar and, with it, that
  // reach — the disclaimer now survives only on Profiel and inside
  // Dossierbeheer's Mock banner (both exercised further down this file).
  // This is a deliberate, accepted trade-off (see plato-demo.spec.ts's file
  // header and task-15-report.md), not a gap to "fix" by re-adding a bar or
  // inventing a replacement here — this assertion exists so a future change
  // that silently restores it on Vandaag gets noticed rather than shrugged
  // off as an improvement.
  await expect(page.getByText(/demonstratie/i)).toHaveCount(0);
  // Scoped deliberately to the page a visitor lands on (Vandaag) rather than
  // "no Live toggle anywhere" — one exists, in Dossierbeheer, and is checked
  // (hidden, not merely undiscovered by this test) below.
  await expect(page.getByRole('button', { name: /live/i })).toHaveCount(0);
});

test('the social card advertises this deployment, not another one', async ({ page, baseURL }) => {
  // index.html is authored against the production origin and rewritten at build
  // time by vite.config.ts's transformIndexHtml plugin. The pure rewrite is unit
  // tested in scripts/social-card-origin.test.ts; this covers the wiring, which
  // unit tests cannot reach — a plugin that silently stopped running would leave
  // every assertion there passing while ACC shipped production URLs.
  //
  // Compared against the run's own base origin rather than a hardcoded host, so
  // the same assertion holds on localhost, on acc.plato and later on plato —
  // same reasoning as the backend-request guard further down this file.
  expect(baseURL, 'baseURL is required but was undefined').toBeTruthy();
  const ownOrigin = new URL(baseURL!).origin;

  const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

  expect(new URL(ogUrl!).origin).toBe(ownOrigin);
  expect(new URL(ogImage!).origin).toBe(ownOrigin);

  // And the image is a real file, not the SPA shell handed back by
  // navigationFallback — a 200 alone would not tell those apart.
  const res = await page.request.get(ogImage!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
});

test('the floating assistant toggle never renders, and clicking cannot strand it', async ({
  page,
}) => {
  // PADashboardV2 (vendored) renders a fixed "✦ Vraag de assistent" button
  // whenever `hasAccess && !dockOpen`, and the dock it opens is a null shim
  // here — PADock is not vendored, because it pulls in real MCP/LLM calls.
  // Clicking it therefore hid the button (it renders only while !dockOpen)
  // and put nothing in its place, with the only onClose sitting inside the
  // dock that rendered nothing. demo-overrides.css hides it.
  //
  // toBeHidden(), not toHaveCount(0): the button IS in the DOM — it is
  // suppressed by a computed style that has to out-specify the vendored
  // `.pac .pac-dock-toggle { display: flex }`. Counting elements would pass
  // just as happily if the rule lost the cascade and the button were plainly
  // visible, which is the exact regression worth catching.
  const toggle = page.locator('.pac-dock-toggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toBeHidden();

  // The trap was persistent, not just momentary: PADashboardV2 writes
  // dockOpen to sessionStorage['paV2.dock.open'] on every change, so a
  // visitor who tripped it stayed stranded for the rest of the session and a
  // reload did not help. Seed that state directly and assert the page still
  // comes up whole — this is what makes the CSS fix sufficient for visitors
  // who already clicked, rather than needing the key cleared at boot.
  await page.evaluate(() => sessionStorage.setItem('paV2.dock.open', '1'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Beheer', exact: true })).toBeVisible();
  await expect(page.locator('.pac-dock-toggle')).toBeHidden();
});

test('the page has one scrollbar, not two', async ({ page }) => {
  // Historical context, not a live constraint any more: dashboard-pa.css
  // (vendored) hard-codes `.pac { height: 100vh }`, sound only when `.pac`
  // is the only thing on the page. An earlier version of this demo broke
  // that by rendering a DemoBar header above `.pac`, producing a second,
  // outer scrollbar on top of `.pac-main`'s own internal one — the
  // double-scrollbar the human partner reported comparing this demo to the
  // live cockpit. demo-overrides.css's flex-layout override fixed it then;
  // Task 15 removed the bar (so `.pac` is once again the page's only child)
  // but kept the override, since a lone flex child with `flex: 1` in a
  // `height: 100%` column still fills it exactly — see that file's own
  // comment for the re-measured numbers. This test is the real-DOM proof
  // that still holds, not a source-text guess: demo-overrides.test.ts checks
  // the rules exist; this checks the result actually has one scrollbar in a
  // real browser.
  const html = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(html.scrollHeight).toBeLessThanOrEqual(html.clientHeight);
});

test('Beheer shows nine sections and no IOU or Hulpmiddelen', async ({ page }) => {
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  for (const label of [
    'Dossierbeheer',
    'Nieuw dossier',
    'Afwegingskader',
    'Signaalbronnen',
    'Zoekcriteria',
    'Curatiepijplijn',
    'Notificaties',
    'Profiel',
    'Rollen & rechten',
  ]) {
    await expect(railItem(page, label)).toBeVisible();
  }
  // sections.allow.ts drops IOU and Hulpmiddelen entirely — DemoSectionRouter
  // never imports their components, so there is nothing to find here even
  // once the group they lived in.
  await expect(page.getByText('Feedback geven')).toHaveCount(0);
  await expect(page.getByText('Gereedschap')).toHaveCount(0);
});

test('switching role on Rollen & rechten changes what Dossierbeheer permits', async ({ page }) => {
  // Regression guard for the subtlest bug in the project: the vendored shell
  // snapshots getUser() into React state at mount, so a naive role switch
  // would silently do nothing to Dossierbeheer's capabilities. Task 6 fixed
  // it (DemoSectionRouter consumes useDemoRole() so it re-renders, and reads
  // a fresh getUser() rather than the stale `user` prop); this is the
  // checked-in test that exercises the fix through the real UI.
  //
  // Task 15 moved the *trigger* from the demo bar's own buttons to Rollen &
  // rechten (RollenRechten.tsx), which drives the exact same
  // useDemoRole().setRoleId the bar used to call — same context, same
  // setter, same DemoSectionRouter/Dossierbeheer propagation path. Verified
  // by hand before this rewrite (see task-15-report.md): switching role here
  // still updates Dossierbeheer's reflective role bar and its real per-row
  // "Verwijderen" button, so this is a relocation of the trigger, not a
  // narrower assertion — every assertion below is unchanged from before the
  // bar's removal.
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();

  const deleteFirstRow = page.locator('.pac-db-abtn.danger').first();
  const deleteCap = page.locator('.pac-db-cap', { hasText: 'Verwijderen' });

  // Beheerder (the demo's start role): full rights, including deleting a
  // dossier from the overview — both the live row action and the capability
  // readout say so.
  await expect(deleteFirstRow).toBeEnabled();
  await expect(deleteCap).toHaveClass(/\bon\b/);
  await expect(dossierbeheerActiveRole(page)).toHaveText('Beheerder');

  // Switch role on Rollen & rechten — the rail persists across sub-sections
  // within Beheer, so no need to re-click the "Beheer" mode tab.
  await railItem(page, 'Rollen & rechten').click();
  await rollenRechtenRole(page, 'Auteur').click();
  await expect(rollenRechtenRole(page, 'Auteur')).toHaveClass(/\bactive\b/);

  // Auteur: deleting is lost. Back on Dossierbeheer, its own role bar is
  // disabled by design (real caseworkers can't grant themselves rights) but
  // still tracks the switch made above live, and the actual "Verwijderen"
  // button on a real row — not just the capability chip — goes disabled
  // with it.
  await railItem(page, 'Dossierbeheer').click();
  await expect(dossierbeheerActiveRole(page)).toHaveText('Auteur');
  await expect(deleteCap).toHaveClass(/\boff\b/);
  await expect(deleteFirstRow).toBeDisabled();
});

test('an authored dossier appears immediately and does not survive a reload', async ({ page }) => {
  // Unlike the mock signal/search/notification store (mock-demo.store.ts,
  // persisted to localStorage), the mock dossier store is deliberately
  // in-memory only — see resetMockDossiers' comment in dossierbeheer.api.ts.
  // A reload already clears it by construction; this test is the checked-in
  // proof of that, not a guess carried over from the brief (which assumed
  // dossiers persist the way signals do — they don't, here).
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Nieuw dossier').click();

  await page.locator('.pac-db-tpl', { hasText: 'Blanco dossier' }).click();
  await page.getByRole('button', { name: /Doorgaan met dit sjabloon/ }).click();

  const naam = `Demo-dossier ${Date.now()}`;
  const fields = page.locator('.pac-db-card').first().locator('input.pac-db-input');
  await fields.nth(0).fill(naam); // Naam
  await fields.nth(1).fill('E2E test-onderwerp'); // Onderwerp — required for a valid draft

  await page.getByRole('button', { name: 'Dossier aanmaken' }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toBeVisible();

  // Navigating away and back within the same session must not lose it — the
  // in-memory store is module-level, not component state.
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toBeVisible();

  // A genuine reload re-executes every module, so the in-memory store comes
  // back empty — the same mechanism "Reset demodata" relies on (see the
  // dedicated reset test below for the no-reload path).
  await page.reload();
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toHaveCount(0);
});

test('Dossierbeheer hides its own live toggle; only Reset demodata is offered', async ({
  page,
}) => {
  // Dossierbeheer.tsx unconditionally renders a "Zet vlag om naar live →"
  // button (wired to pa.api.ts's toggleMock) right next to "↺ Reset
  // demodata" — both in .pac-db-flag-actions. It cannot be removed by
  // editing the vendored component, so Task 8 suppressed it with a CSS rule
  // in demo-overrides.css instead (`.pac-db-flag-actions
  // .pac-db-abtn:not(.pac-db-flag-reset) { display: none; }`).
  // demo-overrides.test.ts already proves that rule exists as source text;
  // it cannot prove it wins in a browser. This is that proof: real DOM, real
  // computed style, via toBeHidden()/toBeVisible() rather than a source grep.
  // Load-bearing beyond tidiness — VITE_API_URL is unset in this
  // backend-less demo, so clicking the live toggle would not reach a real
  // API either; it would hit the same same-origin `${undefined}/pa/...`
  // pattern the network-isolation test below proves crashes the app.
  //
  // Since Task 15, this reset button is also the demo's *only* reset — the
  // demo bar's duplicate is gone. (Its Mock banner text above explains the
  // fixtures in its own words — "Mock — de hele cockpit draait op
  // fixtures…" — rather than the literal "demonstratie" disclaimer text, so
  // that text is deliberately not asserted here; see the landing-view test
  // for where "demonstratie" itself is and isn't checked.)
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();

  await expect(page.getByRole('button', { name: /Zet vlag om naar live/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Reset demodata/ })).toBeVisible();
});

test('Reset demodata clears an authored dossier without a full page reload', async ({ page }) => {
  // The dedicated exercise of the demo's one remaining reset control,
  // separated out from beforeEach now that reaching it takes two clicks
  // (Beheer → Dossierbeheer) instead of the always-on-screen demo bar.
  // resetDemo() in the vendored Dossierbeheer.tsx gates on window.confirm()
  // (auto-accepted in beforeEach) and, unlike the old bar's resetDemo, does
  // NOT reload the page — it clears both mock stores and calls refetch() /
  // syncCockpit() instead. This test proves that no-reload path actually
  // clears state, which the reload-based "does not survive a reload" test
  // above cannot: that one would pass even if the reset button itself were
  // wired to do nothing at all.
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Nieuw dossier').click();

  await page.locator('.pac-db-tpl', { hasText: 'Blanco dossier' }).click();
  await page.getByRole('button', { name: /Doorgaan met dit sjabloon/ }).click();

  const naam = `Reset-test-dossier ${Date.now()}`;
  const fields = page.locator('.pac-db-card').first().locator('input.pac-db-input');
  await fields.nth(0).fill(naam);
  await fields.nth(1).fill('E2E test-onderwerp');

  await page.getByRole('button', { name: 'Dossier aanmaken' }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toBeVisible();

  await page.getByRole('button', { name: /Reset demodata/ }).click();
  await expect(page.getByText(naam)).toHaveCount(0);
});

test('the page issues no request to any backend', async ({ page }) => {
  // The behavioural counterpart to the CSP and the build-time bundle gate:
  // watch the real network rather than trusting the configuration. Route
  // taken deliberately touches the one surface with a real live/mock branch
  // in its source (AgendaView.tsx / fetchAgenda, gated on
  // VITE_PA_AGENDA_MOCK) — see task-10-report.md for the red probe that
  // proves this assertion is load-bearing rather than decorative, and for
  // why the listener has to be attached in beforeEach rather than here.
  //
  // The click chain below can itself hang if the very defect this test
  // exists to catch fires mid-navigation (a malformed same-origin agenda
  // response reaching <AgendaCountBadge> throws with no error boundary in
  // the tree, unmounting the whole shell — confirmed by instrumenting
  // console/pageerror events against a real VITE_PA_AGENDA_MOCK=false run,
  // see task-10-report.md). Each click gets a short, explicit timeout and
  // swallows its own failure so a UI hang from that defect cannot prevent
  // the assertion below from running and reporting the real cause — the
  // captured URL — instead of a generic 30s test-timeout with no evidence.
  await page
    .getByRole('button', { name: 'Monitoring', exact: true })
    .click({ timeout: 5_000 })
    .catch(() => {});
  await railItem(page, 'Agenda')
    .click({ timeout: 5_000 })
    .catch(() => {});
  await railItem(page, 'Politiek (NL)')
    .click({ timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(1000);

  expect(suspectRequests.get(page)).toEqual([]);
});

test('Feiten & cijfers renders its monitor icons and issues no backend request', async ({
  page,
}) => {
  // The interaction the vendored-assets fix (this task) is actually for:
  // FeitenCijfers.tsx's <MonitorIcon> requests /pa/feiten-icons/*.png,
  // which — before vendor-manifest.mjs grew a second, asset-vendoring root
  // — 404'd on this app (the PNGs lived only in packages/frontend/public,
  // never copied here), and matches the same `/pa|v1/` path shape the
  // network guard above uses to catch a real backend call. This test
  // exercises the real DOM (an actual <img>, actually loaded) rather than
  // reasoning about it from the file list, and doubles as proof the guard's
  // image-resourceType narrowing doesn't let a real backend call slip past
  // — no visible mock/network failure and the suspects list is still empty.
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await railItem(page, 'Feiten & cijfers').click();

  await expect(page.getByRole('heading', { name: 'Feiten & cijfers' })).toBeVisible();

  const icon = page.locator('.pac-feit-img').first();
  await expect(icon).toBeVisible();
  await expect(icon).toHaveJSProperty('complete', true);
  const naturalWidth = await icon.evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);

  expect(suspectRequests.get(page)).toEqual([]);
});
