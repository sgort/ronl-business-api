# Frontend E2E testing (Playwright) — Phase 1 plan

Companion to [`docs/TESTING-FRONTEND.md`](./TESTING-FRONTEND.md), which covers
unit/component testing (Vitest + RTL). That guide's own
["E2E / Playwright" section](./TESTING-FRONTEND.md#e2e--playwright-future-initiative--main-lines-only)
sketched the rationale and milestones; this document is the detailed plan for
actually building Phase 1, on branch `test/e2e-playwright-phase1`.

**Status: planning — no code written yet.** This document exists to work out
scope, tooling, and the test-user/journey list before scaffolding anything.

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
  be exercised — worth an explicit precondition check (e.g. hitting
  `http://localhost:3001/v1` before the test suite runs) rather than
  letting it fail deep inside a test with a confusing network error.

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
  (`http://localhost:5173`) for local runs; CI will use a `webServer` block
  to boot backend+frontend itself (see "CI" below).
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

1. **Smoke test** — app loads at `/`, `LoginChoice` renders its board
   options, no console errors.
2. **Login → redirect contract**, one test per role, using a single tenant
   (Flevoland — it has the widest role set: citizen, caseworker, hr, mngr,
   infra):
   - `test-citizen-flevoland` → lands on `/dashboard/citizen`.
   - `test-caseworker-flevoland` → lands on `/dashboard/caseworker`.
   - `test-infra-flevoland` → lands on `/dashboard/infra-board`.
   - (woo-coordinatie and public-affairs roles aren't in the Flevoland
     fixture set — check the realm for a tenant that has them, or add role
     assignment to an existing test user; resolve during scaffolding, not
     blocking the plan.)
3. **`ProtectedRoute` cross-role redirect** — a citizen user hitting
   `/dashboard/caseworker` directly gets redirected to
   `/dashboard/citizen`, and vice versa (this is exactly the kind of
   router-guard behavior that's cheap to fake in a component test but only
   _proven_ by driving the real router).
4. **One deep journey, caseworker**: log in as `test-caseworker-flevoland`,
   open a section from `CaseworkerDashboardV2`'s section router (e.g.
   `TakenInbox`), interact with one real backend-backed flow. Exact flow to
   be picked once scaffolding starts — needs a backend endpoint that's safe
   to exercise repeatedly against local Postgres without leaving unbounded
   test data (candidate: viewing/claiming a seeded task, not a
   process-start that creates new Operaton instances every run).
5. **Tenant isolation spot-check**: logging in as `test-caseworker-utrecht`
   and `test-caseworker-amsterdam` in two tests never shows the other
   tenant's data in a shared view (if any dashboard has one — confirm
   during scaffolding).

Explicitly **not** in Phase 1: Woo dashboard journeys, infra-board journeys
beyond the login redirect, PA/public-affairs dossier authoring (blocked on
`pa-author`/`editor`/`admin` Keycloak roles not being provisioned yet, per
existing project notes), HR onboarding flow, MCP chat streaming.

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

- Which tenant fixture (if any) has both `woo-coordinatie` and
  `public-affairs` roles assigned, for the login-redirect matrix in item 2
  above — or whether a role needs adding to an existing test user.
- Whether backend test data needs a reset/seed step between local E2E runs
  (Postgres volume is persistent via `docker-compose.yml`'s
  `postgres-data` volume — repeated runs will accumulate state unless
  something resets it).
- Where `playwright.config.ts`'s `webServer` should point for local runs
  that don't already have `npm run dev` running — auto-start vs. require
  it running already (require-running is simpler and matches how Vitest is
  already run manually per `TESTING-FRONTEND.md`).

## Milestones (tracking, from `TESTING-FRONTEND.md`'s original note)

1. Install & scaffold Playwright (`e2e/` dir, config, `test:e2e` script).
2. Smoke test + login/redirect matrix (Phase 1 items 1–3 above).
3. One deep caseworker journey + tenant isolation spot-check (items 4–5).
4. Write up results, decide on CI wiring as a separate follow-up plan.
