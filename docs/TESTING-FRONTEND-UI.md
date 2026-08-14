# Frontend E2E testing (Playwright) — Phase 1 plan

Companion to [`docs/TESTING-FRONTEND.md`](./TESTING-FRONTEND.md), which covers
unit/component testing (Vitest + RTL). That guide's own
["E2E / Playwright" section](./TESTING-FRONTEND.md#e2e--playwright-future-initiative--main-lines-only)
sketched the rationale and milestones; this document is the detailed plan for
actually building Phase 1, on branch `test/e2e-playwright-phase1`.

**Status: Phase 1 complete.** All 5 scope items done — see the Milestones
section at the bottom for the final tally and what's deliberately deferred
to a follow-up (CI wiring).

## Why unit/component tests aren't enough

The Vitest/RTL suite (893 tests, 119 files, per `TESTING-FRONTEND.md`) mocks
`keycloak.ts` and every API module at the network boundary. That's correct
for testing component logic in isolation, but it means **nothing in the
suite exercises**:

- The real Keycloak login redirect (`keycloak.login()` → hosted login page →
  `/auth` callback → token parsing → role-based dashboard redirect).
- Cross-page navigation via the real `BrowserRouter` and `ProtectedRoute`
  guard in `App.tsx`.
- Real HTTP round-trips against the actual backend (`packages/backend`),
  including CORS, auth middleware, and Operaton/BPMN process behavior.
- Multi-tenant behavior — the realm ships test users for 6 tenants
  (Utrecht, Amsterdam, Rotterdam, Den Haag, Flevoland, UWV) and tenant
  isolation is a real security property, not just a UI detail.

These are exactly the seams Playwright is good at, and exactly what
component tests structurally cannot cover no matter how much mocking effort
goes in.

## Environment

Everything needed to run this stack locally already exists — no new
infrastructure:

- `docker-compose.yml` at the repo root brings up Keycloak (`:8080`,
  realm `ronl`, client `ronl-business-api`), Postgres, and Redis.
- `config/keycloak/ronl-realm.json` is imported automatically
  (`--import-realm`) and already defines test users per tenant and role,
  e.g. `test-citizen-utrecht`, `test-caseworker-utrecht`,
  `test-hr-flevoland`, `test-mngr-flevoland`, `test-infra-flevoland`,
  `test-onboarded-denhaag`. Passwords are in that file — it's a local/dev
  realm only, never referenced from CI secrets.
- `npm run dev` (root) starts backend (`npm run dev:backend`) and frontend
  (`npm run dev:frontend`, Vite on `:5173`) concurrently, after
  `deps:check`/`docker:check`.
- Frontend routes (`App.tsx`): `/` (LoginChoice) → Keycloak hosted login →
  `/auth` (AuthCallback, role→dashboard redirect) →
  `/dashboard/{citizen,caseworker,public-affairs,infra-board,woo}`.
- **Linked Data Explorer (LDE) backend — required for `Zoeken >>
Procesbibliotheek`.** `ProcesBibliotheek.tsx` (caseworker dashboard,
  reused across boards per `TESTING-FRONTEND.md`'s P7/P8 notes) calls
  `ldeApi.bundles.public()` in `services/api.ts`, a separate axios instance
  pointed at `VITE_LDE_API_URL` (`http://localhost:3001/v1` in
  `.env.development`/`.env.test`) — CORS-open, no auth, entirely outside
  the `businessApi`/Keycloak flow. This is a **separate sibling repo**
  (`linked-data-explorer`, not a package inside this monorepo). Its backend
  must be started separately before running any Procesbibliotheek journey:

  ```bash
  cd <path-to-linked-data-explorer>
  npm run dev:backend   # @linked-data-explorer/backend, listens on :3001
  ```

  (`npm run dev:full` in that repo also starts its own frontend on top —
  not needed here, only `dev:backend` is required.) If that backend isn't
  running, `ProcesBibliotheek`'s bundle fetch fails and the journey can't
  be exercised — `e2e/global-setup.ts` checks `http://localhost:3001/v1/health`
  (LDE backend's health route, same `/v1/health` shape as this repo's own
  backend) alongside frontend/backend before any test runs, and fails fast
  with the exact start commands instead of letting it fail deep inside a
  test with a confusing network error.

So a Playwright run needs: `docker compose up -d` (Keycloak+Postgres+Redis),
backend running against them, frontend dev server (or a `vite preview` of a
prod build) — all things a developer already has locally. No mocking layer,
no new docker services.

## Tooling

- `@playwright/test` as a frontend devDependency.
- New directory `packages/frontend/e2e/` with its own `playwright.config.ts`
  — kept separate from `src/` so Vitest's `include`/`exclude` globs never
  need to know about it, and so `e2e/` can have its own `tsconfig` if
  needed.
- `playwright.config.ts` points `baseURL` at the Vite dev server
  (`http://localhost:5173`). It does **not** start the dev stack itself —
  frontend, backend, and the sibling `linked-data-explorer` backend are all
  started manually (each in its own terminal, per the Environment section
  above). A `globalSetup` (`e2e/global-setup.ts`) checks all three are
  reachable before any test runs and fails fast with a clear message +
  exact start commands if one isn't, instead of a confusing mid-test
  connection error. CI wiring (a `webServer`-style auto-boot, since CI has
  no human to start things manually) is deferred — see "Not in Phase 1"
  below.
- Auth handling: Playwright's
  [storage state](https://playwright.dev/docs/auth) — a one-time login
  script per role/tenant combination that saves cookies/localStorage to a
  JSON file, reused across tests via `test.use({ storageState: ... })`.
  Avoids paying the full Keycloak hosted-login redirect in every single
  test; only the login-flow smoke test itself exercises the real redirect
  end-to-end.
- New root script: `npm run test:e2e --workspace=@ronl/frontend` (mirrors
  `test`/`test:watch`); not wired into the root `npm test` fan-out yet (see
  "Not in Phase 1" below) — invoked directly during this phase.

## Phase 1 scope — smoke + one journey per dashboard role

Deliberately narrow. The goal of Phase 1 is proving the harness works
end-to-end (real Keycloak, real backend, real browser) and locking in the
login/redirect contract, not exhaustive coverage — that's the same
"critical interactions only" discipline `TESTING-FRONTEND.md`'s P5/P8 used
for the component suite.

1. **Done** — Smoke test: app loads at `/`, `LoginChoice` renders its board
   options, no console errors.
2. **Done** — Login → redirect contract, one test per role, Flevoland
   tenant (widest role set), driving the real Keycloak hosted login form
   (`e2e/helpers/auth.ts`, `e2e/login-redirect.spec.ts`) — all 5 pass:
   - `test-citizen-flevoland` → lands on `/dashboard/citizen`.
   - `test-caseworker-flevoland` → lands on `/dashboard/caseworker`.
   - `test-infra-flevoland` → lands on `/dashboard/infra-board`.
   - `test-woo-flevoland` (`woo-coordinatie` role) → lands on
     `/dashboard/woo`.
   - `test-pa-flevoland` (`public-affairs`, `pa-author`, `pa-editor`,
     `pa-admin` roles) → lands on `/dashboard/public-affairs`.
3. **Done, found and fixed 2 gaps** — `ProtectedRoute` cross-role redirect
   (`e2e/protected-route.spec.ts`). The original plan ("citizen hitting
   `/dashboard/caseworker` redirects to `/dashboard/citizen`, and vice
   versa") turned out wrong on **both** legs once actually driven against
   the real router — found the same way P7–P9 in `TESTING-FRONTEND.md`
   were, both since fixed (unlike P7–P9, which stayed found-not-fixed by
   choice):
   - **A fresh page load of `/dashboard/citizen` always redirected to `/`,
     even for an authenticated user with a live Keycloak SSO session.**
     `keycloak.init()` used to only ever be called inside
     `AuthCallback.tsx`; `ProtectedRoute` checked `keycloak.authenticated`
     synchronously with no init of its own, so on a real browser
     navigation (URL bar, bookmark, refresh) that field was always false.
     **Fixed**: `services/keycloak.ts` now exports `initializeKeycloak()`,
     an idempotent wrapper memoizing the first `keycloak.init()` call in a
     module-level promise — safe to call from both `AuthCallback` (real
     login flow, its own `onLoad` options) and `ProtectedRoute` (passive
     `check-sso`), whichever happens to be first in a given page load.
     `ProtectedRoute` now awaits its own `check-sso` init on mount before
     deciding anything (rendering `null` while pending). New tests:
     `App.test.tsx` (didn't exist before — `ProtectedRoute` is now
     exported from `App.tsx` and tested in isolation via `MemoryRouter`)
     and two new cases in `services/keycloak.test.ts` covering the
     memoization itself (`vi.resetModules()` + dynamic re-import per test,
     since `initPromise` is module-level state).
   - **`/dashboard/caseworker` was not wrapped in `ProtectedRoute` at
     all.** `CaseworkerDashboardV2` self-gates by filtering which rail
     items are visible per role; it never redirected a wrong-role (e.g.
     citizen) user away, so a citizen who navigated there directly just
     stayed. **Fixed**: the route is now wrapped in
     `<ProtectedRoute requiredRole="caseworker">`, same as
     `/dashboard/citizen`. Known, accepted trade-off:
     `CaseworkerDashboardV2` has its own inline public "zoeken" (search)
     mode for unauthenticated visitors
     (`{!isAuth && mode !== 'zoeken' ? <login-gate> : ...}`) — wrapping
     the whole route in `ProtectedRoute` means an unauthenticated visitor
     can no longer reach that public search mode at all, since they're
     redirected to `/` before the component ever mounts. Chosen
     deliberately over leaving the gap in place; revisit if that public
     access turns out to matter.

   **Real regression found manually, after these fixes, and fixed**: the
   first version of `initializeKeycloak()` accepted caller-supplied
   options and memoized whichever ones the _first_ caller passed, for the
   lifetime of the page. Repro: visit `/dashboard/caseworker` while logged
   out (`ProtectedRoute`'s `check-sso`, resolves `false`) redirects to `/`
   as expected — but then clicking "Login met DigiD" (which wanted a real
   `onLoad: 'login-required', idpHint: 'digid'` init) got `AuthCallback`
   back the _already-resolved_ `false` from `ProtectedRoute`'s earlier
   call instead of a fresh one — the real DigiD redirect never fired, and
   the citizen flow showed "Authenticatie mislukt. Probeer het opnieuw."
   even though nothing had actually gone wrong yet. (Logging out as
   caseworker "reset" it — a fresh page load clears all in-memory JS
   state, including `initPromise`.) **Fixed**: `initializeKeycloak()` now
   takes no options at all — always a fixed passive `check-sso` — and
   every real login (medewerker or citizen/DigiD) triggers its actual
   redirect via a separate, explicit `keycloak.login(...)` call instead,
   which has no "only once" restriction unlike `.init()`. `AuthCallback`'s
   citizen branch changed from a single `init({onLoad: 'login-required',
idpHint})` call to `initializeKeycloak()` + `keycloak.login({idpHint})`
   if not authenticated — mirroring the medewerker branch's existing,
   already-correct pattern. New E2E test
   (`protected-route.spec.ts`, "DigiD login still works after an
   unauthenticated visit to a protected route in the same tab")
   reproduces the exact repro steps and confirms the fix. Updated
   `AuthCallback.test.tsx` (3 tests rewritten: the old "citizen flow
   fails to authenticate" test's premise no longer applies — not being
   authenticated now triggers a real login attempt, not an error) and
   `keycloak.test.ts`/`App.test.tsx` (signature change, no options).

4. **Done, found and fixed 2 bugs** — One deep journey
   (`e2e/caseworker-journey.spec.ts`): `test-citizen-flevoland` submits a
   real Kapvergunning (tree felling permit) request via `AwbShellProcess`
   on the local Operaton container; DMN evaluates it (`Permit
Decision: Permit`, `Replacement Decision: true` for a 35cm tree);
   `TreeFellingPermitSubProcessE2E` creates a "Case review: tree felling
   permit decision" task for the `caseworker` candidate group;
   `test-caseworker-flevoland` claims and completes it via `TakenInbox` /
   `TaskFormViewer`, which advances `AwbShellProcess` itself to its own
   caseworker task (`Task_Phase6_Notify`, also `candidateGroups=
"caseworker"`) — the same caseworker completes that too, for a
   genuinely finalized roundtrip (zero open tasks/instances left in
   Operaton afterward) rather than leaving a dangling notify step nobody
   ever closes, which is what an earlier version of this test did and
   what prompted this fix. Two persona contexts (`browser.newContext()`
   ×2), not the default `page` fixture, since citizen and caseworker must
   not share a Keycloak session. Unlike the original plan, using a real
   process-start turned out fine — Operaton is now a disposable local
   container (see Environment above), not the shared remote engine the
   original concern was about.

   Driving the form for real (not mocked) surfaced things a Vitest/RTL
   test never would have:
   - **form-js's `select` fields aren't native `<select>`s.** They're a
     custom combobox: the `<label>`/accessible-textbox role both target a
     visually-hidden, zero-size input (the real form value holder) —
     `selectOption()`/`getByLabel()` resolve to it but can't click it
     ("outside of viewport"). The actual clickable trigger is a sibling
     `<div class="fjs-select-display">` with a randomized id prefix per
     render; targeted via an "ends with" attribute selector, e.g.
     `locator('[id$="-Field_ReviewAction-display"]')`, in
     `caseworker-journey.spec.ts`.
   - **Real bug, fixed (two rounds)**: `TakenInbox.tsx`'s `onCompleted`
     handler called `setActionMessage({ type: 'success', text: 'Taak
voltooid.' })` and `setSelectedId(null)` in the same synchronous
     handler — React batches both into one render, and since the success
     message only rendered inside the `{!selected ? <empty> :
     <article>…}` branch, `selected` was already `null` before the
     message ever painted. The success confirmation never appeared for
     any caseworker, on any task completion, ever. - First fix attempt — just drop the manual `setSelectedId(null)` and
     let the task naturally drop out of `visible` once `loadTasks()`'s
     refetch excludes it. This passed a Vitest test using a
     manually-deferred refetch promise, but was still **flaky against
     the real browser**: the message's visible window is bounded by
     how fast the real refetch resolves (fast against a local backend
     — tens of ms), which is too short/racy to reliably assert on and
     poor UX regardless (a caseworker might never consciously register
     it). - Real fix: moved the `actionMessage` banner to render as a sibling
     of the `{!selected ? … : …}` block instead of nested inside the
     `<article>` — it now persists independently of whether a task is
     currently selected, until the next `handleSelect`/`handleClaim`
     clears it. `TakenInbox.test.tsx`'s regression test (deferred-promise
     technique) still passes unchanged; `caseworker-journey.spec.ts`
     passes reliably against the real browser now.

   Also found: Vitest's default file matching had no `exclude` for `e2e/`,
   so `npm run test` was quietly also trying to import Playwright's
   `*.spec.ts` files as Vitest tests once any existed, and erroring on
   each. Fixed in `vite.config.ts` (`exclude: [...configDefaults.exclude,
'e2e/**']`).

   **Optional Operaton history cleanup**: local Operaton keeps full
   history of every process/task by default (confirmed — running this
   test repeatedly during development left over a dozen completed
   `AwbShellProcess`/`TreeFellingPermitSubProcessE2E` history entries behind),
   which isn't always wanted across repeated local runs. Rather than
   deleting it unconditionally (some runs you _do_ want to inspect
   afterward via Operaton's Cockpit), the test asks first — but **not**
   from within the test body itself: Playwright runs each test in a worker
   child process that doesn't forward the CLI's real TTY stdin (confirmed,
   matches [microsoft/playwright#33061](https://github.com/microsoft/playwright/issues/33061)
   exactly — a `readline` prompt inside a test silently never reaches the
   terminal, even from a genuinely interactive shell). `global-teardown.ts`
   runs in the main CLI process instead, which does have real stdin, so
   the split is: the test calls
   `helpers/operaton-cleanup.ts`'s `recordPendingCleanup(businessKey)` —
   using the dossier/businessKey captured from the citizen's success
   screen — to write it to a gitignored state file
   (`e2e/.pending-operaton-cleanup.json`); `global-teardown.ts` (wired via
   `playwright.config.ts`'s `globalTeardown`) reads that file once, after
   all tests finish, and prompts per key there. Confirming deletes both
   the top-level `AwbShellProcess` instance and its
   `TreeFellingPermitSubProcessE2E` call-activity instance — Operaton tracks
   call-activity subprocesses as separate history entries with their own
   ids, linked via `superProcessInstanceId`; deleting the parent's history
   does not cascade to them. No-ops silently (leaving the state file for
   next time) when `process.stdin.isTTY` is false, so a future CI run
   never hangs unattended.

   **Real bug found and fixed**: `runPendingCleanupPrompts()` used to call
   `fs.unlinkSync(PENDING_FILE)` unconditionally after the prompt loop,
   regardless of each entry's answer — so a declined entry (or, observed
   in practice, a non-interactive/sandboxed stdin that still reports
   `isTTY: true` but has no real input, silently resolving each prompt as
   EOF/"no") lost its tracking entirely, with the underlying Operaton
   history never actually deleted. Concretely: 3 real
   `AwbZorgtoeslagProcess`/`ZorgtoeslagProvisionalSubProcessE2E` history
   entries survived a full pending-file wipe this way and had to be found
   and purged manually via direct REST calls. Fixed: only entries actually
   confirmed-and-deleted are dropped from the file now; anything declined
   (or unanswered) stays recorded for a future run instead of being
   silently forgotten.

   **Second deep journey added** (`e2e/zorgtoeslag-journey.spec.ts`):
   `test-citizen-unive` (a commercial org) submits a Zorgtoeslag claim via
   `AwbZorgtoeslagProcess`; `test-caseworker-toeslagen` claims and
   completes both the review and follow-up notify steps, same finalized-
   roundtrip pattern as the Kapvergunning journey. Same form-js
   custom-combobox handling reused. The `claimIfNeeded` helper (previously
   inline in `caseworker-journey.spec.ts`) moved to
   `e2e/helpers/tasks.ts` and is now shared by all three journey/isolation
   specs.

   **Real concurrency bug found and fixed**: adding this second Zorgtoeslag
   journey alongside the pre-existing `tenant-isolation.spec.ts` (item 5,
   below) exposed a genuine race. Both files create a task named exactly
   "Case review: provisional entitlement decision" for the same
   caseworker (`test-caseworker-toeslagen`), and `playwright.config.ts`'s
   `fullyParallel: true` ran them in different workers at the same time —
   one file's `.first()` task-list match grabbed the _other_ file's task
   mid-flight, causing a genuine Operaton save conflict ("Opslaan
   mislukt" visibly in the UI), not just a flaky selector. Every
   Operaton-touching spec shares the same stateful local engine, so
   rather than hand-rolling per-test task disambiguation (correlating by
   dossier/businessKey, which `TakenInbox`'s list view doesn't even
   surface), fixed by setting `workers: 1` in `playwright.config.ts` —
   trading suite parallelism for correctness. Acceptable for this small,
   locally-run Phase 1 suite (12 tests, ~40s serialized); revisit if/when
   CI wiring needs the speed back, at which point per-test task
   correlation would be the real fix.

5. **Done** — Tenant isolation spot-check (`e2e/tenant-isolation.spec.ts`).
   The original plan (`test-caseworker-utrecht` vs. `test-caseworker-amsterdam`
   in a shared view) turned out not to be checkable with current seed data:
   only Flevoland has any real Operaton-backed process/task data, so
   Utrecht/Amsterdam caseworkers would both just see an empty `TakenInbox`
   — proving nothing. Used a real cross-tenant fixture instead:
   `AwbZorgtoeslagProcess` always runs under the `toeslagen` processing
   authority regardless of which channel the citizen came from
   (`process.routes.ts` explicitly overrides the `municipality` variable to
   `'toeslagen'`, recording the real submitter's tenant separately as
   `originTenantId`), and task listing is genuinely tenant-filtered
   server-side (`operaton.service.ts`'s
   `processVariables: municipality_eq_${tenantId}`) — a real security
   boundary, not a guess. `test-citizen-unive` (a commercial org) submits a
   Zorgtoeslag claim; `test-caseworker-flevoland` is confirmed **not** to
   see the resulting task in their `TakenInbox`; `test-caseworker-toeslagen`
   is confirmed to see it, then claims and completes both steps (review +
   the shell's own follow-up notify task) for a finalized roundtrip, same
   pattern as `caseworker-journey.spec.ts`. Citizen-side flow needed one
   extra step not present in the Kapvergunning journey: the "Zorgtoeslag"
   service card leads to a calculator screen with two paths
   ("Berekenen" = DMN preview only, "Aanvragen" = go straight to the real,
   fully-prefilled submission form) — the test clicks "Aanvragen".

Explicitly **not** in Phase 1: Woo dashboard journeys beyond the login
redirect, infra-board journeys beyond the login redirect, PA/public-affairs
dossier authoring beyond the login redirect, HR onboarding flow, MCP chat
streaming — kept narrow by choice (item 4's single deep journey stays
caseworker-only for Phase 1), not because of a missing precondition:
`test-pa-flevoland` already carries `pa-author`/`pa-editor`/`pa-admin`
locally (only real ACC kernteam accounts still need those roles assigned
operationally, which doesn't affect local E2E testing).

## Known issues

- **Node v24 on Windows crashes on exit after `globalSetup` fails.** When
  the active shell is on Node v24.x instead of the repo's pinned v22
  (`.nvmrc`), a failing `globalSetup` (e.g. LDE backend not running) prints
  the correct precondition error, then the process crashes with a native
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file
src\win\async.c` instead of exiting cleanly — happens with both
  `AbortSignal.timeout()` and a manually managed `AbortController` +
  `clearTimeout`, so it's a Node/libuv issue on that version, not something
  fixable in `global-setup.ts` itself. The precondition check's own logic is
  unaffected (correct pass/fail per service, correct message) — only
  process teardown afterward is broken. Re-check once running under the
  pinned Node 22.

## Not in Phase 1

- **CI wiring.** Phase 1 runs locally only. Wiring a `playwright` job into
  `.github/workflows/azure-frontend-acc.yml` (or a new dedicated workflow)
  needs its own decision on: booting Keycloak+Postgres in CI (services
  container vs. testcontainers), how long the run is allowed to take, and
  whether it blocks the deploy or runs as a separate non-blocking check.
  Revisit once Phase 1 is proven stable locally.
- **Visual regression / screenshot diffing.** Not needed yet; would add
  flakiness risk before the core harness is trusted.
- **Cross-browser matrix.** Chromium only for Phase 1; Firefox/WebKit are a
  cheap `playwright.config.ts` addition later, not a blocker now.
- **Parallel/sharded execution tuning.** Revisit once the suite is large
  enough for it to matter.

## Open questions to resolve before/during scaffolding

- **Confirmed real, not hypothetical**: repeated `caseworker-journey.spec.ts`
  runs do accumulate state — each completed review task spawns a
  follow-up "Phase 6: Notify applicant" task in `AwbShellProcess` that
  nothing ever completes, and Operaton's own history keeps every prior
  process instance. Not a blocker for Phase 1 (H2/local, cheap to ignore or
  wipe via the Operaton container's Cockpit UI per the docker-compose.yml
  comment), but a real gap to close before any CI wiring — needs either a
  per-run cleanup step or accept unbounded local growth between manual
  resets.
- ~~Where `playwright.config.ts` should point for local runs that don't
  already have `npm run dev` running~~ — resolved: require it running
  already (`globalSetup` checks and fails fast; no auto-start). Matches how
  Vitest is already run manually per `TESTING-FRONTEND.md`.

## Milestones (tracking, from `TESTING-FRONTEND.md`'s original note)

1. **Done** — Playwright scaffolded: `@playwright/test` devDependency,
   `packages/frontend/e2e/{playwright.config.ts,global-setup.ts,smoke.spec.ts}`,
   `npm run test:e2e --workspace=@ronl/frontend` (must pass
   `--config=e2e/playwright.config.ts` explicitly — Playwright's own config
   auto-discovery only walks cwd + ancestors, never subdirectories, so a
   bare `playwright test` run from `packages/frontend` silently falls back
   to config-less mode instead of erroring, which is worse). Smoke test
   (item 1) passes end-to-end against the real stack (frontend, backend,
   LDE backend all running locally) — `1 passed` via
   `npm run test:e2e --workspace=@ronl/frontend`.
2. **Done** — Login/redirect matrix + `ProtectedRoute` cross-role checks
   (Phase 1 items 2–3): `e2e/helpers/auth.ts`, `e2e/login-redirect.spec.ts`
   (5 tests), `e2e/protected-route.spec.ts` (2 tests, both documenting a
   found-not-fixed gap rather than the originally-planned behavior). `8
passed` via `npm run test:e2e --workspace=@ronl/frontend`.
3. **Done** — One deep caseworker journey (`e2e/caseworker-journey.spec.ts`),
   which also found and fixed a real bug in `TakenInbox.tsx`
   (task-completion success message never rendered) plus a
   `vite.config.ts` gap (Vitest picking up Playwright's own spec files);
   found and fixed both `ProtectedRoute` gaps (item 3) plus a real
   regression that fix caused (DigiD login broken after visiting a
   protected route while logged out); a second deep journey
   (`e2e/zorgtoeslag-journey.spec.ts`) plus the tenant isolation spot-check
   (item 5, `e2e/tenant-isolation.spec.ts`) using `AwbZorgtoeslagProcess` as
   a real cross-tenant fixture — which together found and fixed a real
   concurrency bug (both specs racing to claim identically-named tasks for
   the same caseworker; fixed via `workers: 1`). `12 passed` via
   `npm run test:e2e --workspace=@ronl/frontend`.
4. **Phase 1 complete.** Full Playwright suite: 12 tests across 6 spec
   files, all passing serially against the real stack (Keycloak, backend,
   LDE backend, local Operaton). Full Vitest suite unaffected: 901 tests,
   120 files. CI wiring (a `webServer`-style auto-boot for CI, since there's no
   human to start the stack manually there; the Node v24-on-Windows
   `globalSetup` exit-crash; the Operaton-history-accumulation gap noted
   above) is deliberately deferred as a separate follow-up plan, not
   bundled into Phase 1 — see "Not in Phase 1" above.
