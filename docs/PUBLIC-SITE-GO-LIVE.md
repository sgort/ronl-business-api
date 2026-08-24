# Public site go-live checklist

Everything needed to take `packages/public-site` from "works on `feature/public-site`
locally" to live at `publiek.open-regels.nl` / `acc.publiek.open-regels.nl`. Ordered
so blocking items come first — several steps depend on an earlier one existing.

Related: [ARCHITECTURE.md](../publiek-handoff/ARCHITECTURE.md) (design doc — not
committed, reference only), [EDOCS-GO-LIVE.md](./EDOCS-GO-LIVE.md) (same style, a
different integration), `docs/superpowers/plans/2026-08-06-public-site.md` (the
21-task implementation plan this branch executed).

## 1. Azure Static Web App resources (blocking)

The CI workflows
([azure-publicsite-acc.yml](../.github/workflows/azure-publicsite-acc.yml),
[azure-publicsite-prod.yml](../.github/workflows/azure-publicsite-prod.yml)) will
fail on first push without the resource + token secret. **ACC done; PROD pending.**

Create each SWA with deployment **Source: `Other`** (not GitHub) — that yields just
the resource + a deployment token and does **not** generate a competing workflow;
our hand-tuned workflow already deploys the pre-built `dist` via `skip_app_build`.

- [x] Create the **ACC** Static Web App in Azure (matches `azure-frontend-acc.yml`'s
      resource for the pattern to copy).
- [ ] Create the **PROD** Static Web App in Azure.
- [x] Copy the **ACC** deployment token (Azure Portal → the SWA resource → "Manage
      deployment token", or `az staticwebapp secrets list`). PROD token pending.
- [ ] Add both tokens as GitHub repo secrets, **exact names** (already referenced
      by the workflows):
  - [x] `AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_ACC`
  - [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_PROD`

> **Resolved in this branch** (`fix(public-site): ship staticwebapp.config.json in
the build output`): the SWA config previously lived at the package root, which
> the deploy workflow (`app_location: dist`, `skip_app_build: true`) never uploads
> — so the live site would have had no SPA `navigationFallback` (deep-link refresh
> → 404), no CSP/security headers, and no mimeTypes. It now lives in
> `packages/public-site/public/`, so Vite copies it into `dist/` and it ships. No
> manual step needed; noted here because it directly affects the SWA deploy this
> section sets up.

## 2. Backend deploy — ACC and PROD (**ACC done; PROD pending**)

Phase 1 (`GET /v1/public/processen`, `GET /v1/public/zoeken`, the
`/v1/public/{nieuws,producten,regels}/:slug` detail routes) is **deployed and live
on ACC** (`acc.api.open-regels.nl`) — verified by the smoke-test below.
`feature/public-site` was merged into `acc` and deleted. PROD is still pending:
until Phase 1 is on `api.open-regels.nl`, a prod public-site build's prerender step
will 404 (exactly as an early ACC build did).

**Deploy order matters — backend before the push.** The backend is deployed by
`deploy-backend-to-acc.sh` (a local `az webapp deploy` from a clean `acc` checkout;
it does **not** push). The frontend **and** public-site deploy from a **push to
`acc`**, which fires their GitHub Actions. The public-site build's prerender step
fetches `acc.api.open-regels.nl/v1/public/*`, so if the push lands before the
backend is live, that build 404s and fails. Deploy the backend first, in the window
between merging locally and pushing:

- [x] `git checkout acc && git merge feature/public-site` (done; branch since
      deleted — its commits all live on `acc`).
- [x] `bash deploy-backend-to-acc.sh` — deployed the backend from local `acc`.
- [x] Smoke-test: `curl https://acc.api.open-regels.nl/v1/public/zoeken` returned
      real data, not 404.
- [x] `git push origin acc` — triggered the frontend + public-site Actions; both
      deployed successfully (public-site live at `acc.publiek.open-regels.nl`).
- [ ] Repeat for prod once ACC is verified: merge to prod's deploy branch, run
      `deploy-backend-to-prod.sh`, smoke-test, then push to trigger the prod
      Actions.

> The caseworker frontend has no such dependency — it's a runtime-fetch SPA with no
> prerender, so its build never calls the backend. Only public-site does. And if you
> do push before the backend is up, nothing is broken: the public-site Action just
> fails at prerender; re-run it (`workflow_dispatch`) once the backend is live.

## 3. Backend environment variables — ACC and PROD (blocking)

Same failure mode hit twice already during local review: an **explicit env var in
the deployment environment overrides the code default**, so the code-level fixes in
this branch do not by themselves fix ACC/prod. Set these in each backend App
Service's Configuration blade (Azure Portal → App Service → Configuration →
Application settings) — not in any file in this repo.

| Variable                    | ACC                                                                                   | PROD                                                      | Why                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGIN`               | append `https://acc.publiek.open-regels.nl`                                           | append `https://publiek.open-regels.nl`                   | Whatever ACC/prod's `CORS_ORIGIN` is already set to, **plus** the new origin — replacing it outright would break the existing caseworker frontend.                                                       |
| `LDE_API_URL`               | leave unset (code default already `https://acc.backend.linkeddata.open-regels.nl/v1`) | **must set explicitly** — code default is the ACC LDE URL | Without this, prod's process library would silently proxy ACC's LDE data instead of prod's. Likely value: `https://backend.linkeddata.open-regels.nl/v1` (matches the frontend's own `.env.production`). |
| `PUBLIC_SHOW_WIP_PROCESSES` | `true` (already agreed — preview WIP processes on ACC)                                | leave unset (defaults to `false`)                         | ACC-only escape hatch; must never be true in prod.                                                                                                                                                       |

**ACC done** (set on `ronl-business-api-acc` / `rg-ronl-acc` via
`az webapp config appsettings set`, which restarts the App Service automatically —
no manual restart needed). **PROD pending.**

- [x] `CORS_ORIGIN` updated on ACC backend App Service
- [ ] `CORS_ORIGIN` updated on PROD backend App Service
- [ ] `LDE_API_URL` set explicitly on PROD backend App Service
- [x] `PUBLIC_SHOW_WIP_PROCESSES=true` set on ACC backend App Service
- [x] ACC App Service restarted (automatic on `appsettings set`); PROD restart still
      pending after its settings are saved

## 4. Caddy deploy — Skosmos CSP fix (✅ done — blocking for the Gegevenswoordenboek page)

`skosmos.open-regels.nl` previously sent `X-Frame-Options: DENY`, which blocked
**all** iframe embedding — including the caseworker app's existing
Gegevenswoordenboek, not just the new public site. Fixed in this branch
([Caddyfile](../Caddyfile), [deployment/vm/caddy/Caddyfile](../deployment/vm/caddy/Caddyfile)):
a dedicated `skosmos_security_headers` snippet replaces the blanket
`X-Frame-Options: DENY` with a CSP `frame-ancestors` allow-list scoped to the
origins that actually embed it — `'self'`, the caseworker app (`mijn` / `acc.mijn`),
the public site (`publiek` / `acc.publiek`), and both dev servers
(`localhost:5173` / `localhost:5175`), so it works across local, ACC and prod.

- [x] Deploy the updated Caddyfile to the server hosting `skosmos.open-regels.nl`
      (however Caddy config normally gets pushed there).
- [x] Reload Caddy (`caddy reload` / `docker compose restart` / whatever the
      existing flow is — this repo's Caddy deploy isn't scripted, unlike the
      backend).
- [x] Verify: open `https://acc.publiek.open-regels.nl/woordenboek` (once step 1
      is live) or `http://localhost:5175/woordenboek` locally — the iframe should
      load, not show "heeft geweigerd verbinding te maken". _Verified 2026-08-06 at
      `http://localhost:5175/woordenboek`: the Skosmos thesaurus renders in the
      iframe._

## 5. DNS — Azure DNS zone `open-regels.nl` (blocking — **ACC done; PROD pending**)

You own this zone in Azure DNS, which matters for `publiek.open-regels.nl`
specifically: it's an **apex/root record**, and a plain CNAME is not valid at a
zone apex per DNS spec. Azure DNS's **Alias record** feature solves this natively —
an Alias record at the apex can point directly at an Azure resource (the Static
Web App), unlike a plain CNAME. `acc.publiek.open-regels.nl` is an ordinary
subdomain and a plain CNAME works fine there.

- [x] In the Azure Static Web App resource (ACC), add the custom domain
      `acc.publiek.open-regels.nl` — Azure will show the exact validation record
      to add first (typically a `TXT` record).
- [x] Add that validation `TXT` record in the `open-regels.nl` Azure DNS zone.
- [x] Add a `CNAME` record: `acc.publiek` → the SWA's default hostname (Azure
      shows this on the custom domain screen). _Verified 2026-08-07:
      `https://acc.publiek.open-regels.nl/` resolves with valid TLS and serves the
      SWA (the Azure placeholder page — real content lands once §2's push runs)._
- [ ] Repeat domain validation for the PROD Static Web App, root domain
      `publiek.open-regels.nl`.
- [ ] Add an **Alias record** (not a plain A/CNAME) at the zone apex pointing at
      the PROD Static Web App resource — in the Azure DNS zone UI this is "Add
      record set" → type `A` → "Alias record set" toggled on → target set to the
      SWA resource (not an IP).
- [ ] Wait for DNS propagation, then confirm both custom domains show "Ready" /
      valid TLS in the Azure Portal (Azure auto-provisions the certificate once
      DNS validates).

## 6. Post-deploy verification (not blocking, don't skip)

These need a real live URL, so they can only happen after steps 1–5.

- [x] Lighthouse ≥ 95 on Performance / Accessibility / SEO (mobile), live ACC.
      **Resolved 2026-08-07.** All prerendered / indexable pages now pass: home,
      `/regels`, and the four section pages (`/berichten`, `/nieuws`, `/producten`,
      `/processen`) measure **Perf 100 · CLS ~0.016**, with A11y 98–99 and SEO 100.
      The earlier content-page Perf 76–79 / CLS 0.33–0.47 was root-caused to a
      prerender→hydrate loading flash — the crawler-only prerendered fragment was
      replaced on `createRoot` by a short "Laden…" placeholder and then re-fetched,
      so content grew in after first paint and shifted the footer. Fixed by
      embedding each route's data as a JSON blob in the prerendered HTML and seeding
      React state from it (`/regels` in **2026.08.1**, the section pages in
      **2026.08.2**); verified live via local Lighthouse (mobile) against
      `acc.publiek.open-regels.nl`. **Only exception:** `/zoeken` (Perf ~79, SEO 58)
      is client-only and **intentionally non-indexed** (`robots.txt Disallow:
/zoeken`), so its scores are expected, not a defect, and it is out of scope for
      this crawlable-content target.
- [ ] Manual keyboard walkthrough, recorded (skip link → search → results →
      filters → detail, all reachable by keyboard alone). _Partially covered: the
      live-ACC e2e run includes a passing keyboard-only skip-link → search path; the
      full recorded walkthrough is still a manual/browser-driven step._
- [ ] One manual `npx vite-bundle-visualizer` spot-check on a real ACC/prod build
      — Task 20's automated bundle-cleanliness gate already runs on every build,
      this is the human eyeball pass on top of it.
- [x] Re-run the e2e suite against the live ACC URL (2026-08-07) — **6/6 passing**
      against `https://acc.publiek.open-regels.nl`: search journey, deep-link
      filters, keyboard-only skip-link path, and axe-core scans (no critical/serious
      violations on home/results/detail). Run with
      `E2E_BASE_URL=<url> npm run test:e2e -w @ronl/public-site` — the config now
      skips the local dev server whenever `E2E_BASE_URL` is set.
- [ ] Register the accessibility statement (`/toegankelijkheid`) in the
      DigiToegankelijk register — content is live, the registration itself is a
      separate manual step on that external site.

## 7. PROD promotion — the rest of the `acc` → `main` delta (read before merging)

§1–6 cover the **public-site** slice. But PROD currently runs **v3.8.2 (17 Jul)** and
`acc` is **2026.08.23** — merging `acc → main` deploys **342 commits / 21 releases**
across the **backend, the caseworker frontend, and the public-site**, not just the public
site. Package versions after the merge: backend `2026.08.23`, frontend `2026.08.23`,
public-site `2026.08.20`. That last one is **not** a lag to fix — `bump-release` versions
per scope, and public-site was last in scope at v2026.08.20.

### 7a. Backend before the push — app-wide (blocking)

Three workflows fire on push to `main`, each path-filtered, and they are **not** symmetric:

| Workflow                    | Trigger paths                       | What it actually does                       |
| --------------------------- | ----------------------------------- | ------------------------------------------- |
| `azure-backend-prod.yml`    | `packages/backend/**`, `shared/**`  | **builds + uploads an artifact only**       |
| `azure-frontend-prod.yml`   | `packages/frontend/**`, `shared/**` | **deploys** to SWA `mijn.open-regels.nl`    |
| `azure-publicsite-prod.yml` | `packages/public-site/**`           | **deploys** to SWA `publiek.open-regels.nl` |

So the frontends self-deploy on push while the backend does not — `azure-backend-prod.yml`
is named "Build Backend for Production" and stops at `upload-artifact`. The backend deploy
is still the manual `deploy-backend-to-prod.sh` (unchanged in this delta: builds locally,
then `az webapp deploy` → `ronl-business-api-prod` / `rg-ronl-prod`). Push first and the
new frontends call a v3.8.2 backend that lacks their routes.

- [ ] **CI is green on `acc` first.** `28ab6ca` gated all three PROD workflows on lint +
      unit tests, and the frontend additionally on `npm run test:perf` (performance
      budget), public-site on lint + type-check + tests. A failing gate means the deploy
      step never runs — you get a half-promoted `main`, backend deployed and frontends not.
- [ ] Merge `acc → main` **locally** (do not push yet).
- [ ] `bash deploy-backend-to-prod.sh` — backend live on PROD first.
- [ ] Smoke-test the PROD backend (`/v1/health` reports the new version; a `/v1/public/*`
      route responds, not 404).
- [ ] **Then** push `main` — triggers both SWA deploys against the now-current backend.

### 7b. Backend env vars on the PROD App Service

Everything new since v3.8.2. Unset keys fall through to the **code default in `config.ts`**,
not to `.env.example` — the example file is local-dev documentation and disagrees with the
code in at least one place (it ships `EDOCS_MCP_ENABLED=true`; the code default is `false`).

| Var                                             | Code default              | PROD action                                                                            |
| ----------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `DEPLOYMENT_ENV`                                | falls back to `NODE_ENV`  | **set to `production`** — new in `e28dc19`, else `/v1/health` mislabels the tier       |
| `PA_SEED_DEMO_DATA`                             | `false`                   | leave unset — live means dossiers/criteria someone authored                            |
| `RATE_LIMIT_MAX_REQUESTS`                       | **`1000`** (was `100`)    | leave unset to pick up the raise — see the proxy caveat below                          |
| `EDOCS_MCP_ENABLED` / `EDOCS_MCP_CLIENT_SECRET` | `false` / `''`            | leave unset unless you want the eDOCS assistant (then enable + set the M2M secret)     |
| `EDOCS_STUB_MODE`                               | `true` (stub)             | leave stubbed unless real eDOCS is wanted                                              |
| `DOCCLE_*` (new `/v1/doccle` route)             | `DOCCLE_STUB_MODE` `true` | leave stubbed unless real Doccle is wanted (then base URL + creds + `STUB_MODE=false`) |
| `PUBLIC_SHOW_WIP_PROCESSES`                     | `false`                   | keep unset/false in PROD                                                               |

- [ ] Set `DEPLOYMENT_ENV=production` on the PROD App Service (display-only, non-blocking,
      but `/v1/health` is what 7a's smoke test reads).
- [ ] Confirm eDOCS-MCP + Doccle are off/stubbed (or configured deliberately).

**Blocking — the required-env checks now actually fire.** `e28dc19` found that the
`DATABASE_URL` / `OPERATON_BASE_URL` guards were dead code: both resolve through a
non-empty localhost fallback, so `!config.database.url` could never be true and a
production deploy with no `DATABASE_URL` started happily, pointing its audit log at
localhost. They now test `process.env` and gate on production, and `validateConfig()`
**throws at import** — so a missing value is no longer a silent misconfiguration, it is a
backend that will not boot.

- [ ] Confirm `DATABASE_URL` **and** `OPERATON_BASE_URL` are set in PROD App Settings.
      (Both were verified present on `ronl-business-api-prod` when the check was written —
      this is a confirm, but a boot-blocking one if it is wrong.)

**Worth knowing — the rate limit is per deployment, not per user.** The limiter keys on
`${tenantId}:${req.ip}` and `TRUST_PROXY` defaults to `false`, so behind App Service's
front-end proxy Express reads one internal address for every client and the whole tier
shares a single 1000/min budget. The raise from 100 exists because one PA authoring
journey measured 21 requests to `/v1/pa/*`; with several caseworkers at once the shared
budget is still the ceiling. A throttle surfaces as "Kon dossiers niet laden", which reads
like a backend fault. Not fixed in this delta — watch the request log's `ip` field if PROD
starts 429-ing.

### 7c. Frontend PROD build — the PA mock switch

`4b4b320` (v2026.08.22) collapsed `VITE_PA_DOSSIERS_MOCK` and `VITE_PA_SIGNALS_MOCK` into
**one** switch covering dossiers, signals, inbox and zoekcriteria together. The two vars
still exist, but only as the **build-time default** — `PA_MOCK_DEFAULT` ORs them, and a
`paV2.mock` **localStorage** entry (`'1'`/`'0'`) overrides it per browser.

- [ ] Both `VITE_PA_DOSSIERS_MOCK` and `VITE_PA_SIGNALS_MOCK` are `false` in the frontend's
      `.env.production` — either one at `true` puts the whole cockpit in mock. They are
      already `false` there; this is a confirm, not a change.
- [ ] Real PA data still depends on the new backend from 7a being live.

Two things the old single-var checkbox did not capture:

- **The build can't guarantee live.** The Dossierbeheer banner writes `paV2.mock`, so a
  PROD user who toggles it stays in mock across reloads regardless of what shipped. The
  banner names the active mode — that is what to read when a PROD cockpit looks wrong.
- **Empty is a valid live answer.** Live means dossiers, criteria and signals someone
  actually authored (`9b1773d`/`60bea12` stopped the demo seed; `PA_SEED_DEMO_DATA` is off
  by default). A PROD cockpit with nothing in it is a correct empty install, not a failed
  deploy. The old `paV2.dossiers.mock` key is dead — any existing override resets to the
  default once.

### 7d. No action needed (verified against the full delta)

- **DB self-migrates.** Every DDL statement added between `main` and `acc` is
  `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — checked by
  diffing all of `packages/backend/src` for non-idempotent DDL, which returned nothing. The
  eight `pa_*` tables (`dossiers`, `dossier_versions`, `signals`, `notifications`,
  `saved_searches`, `feed_tokens`, `templates`, `snippets`) apply themselves to the existing
  PROD database on boot. No manual step.
- **`form-data` `^4.0.5`** is the only new backend production dependency; it installs on deploy.
- **Caddy Skosmos fix** (§4) is already deployed and shared across environments. Its
  `frame-ancestors` allow-list already names both PROD origins — `mijn.open-regels.nl` and
  `publiek.open-regels.nl` — so no per-tier edit is needed.
- **public-site at `2026.08.20`** while backend/frontend are at `2026.08.23` is correct, not
  a missed bump. See the premise above.

### 7e. Post-deploy — smoke-test the caseworker app too

§6 verifies the public site. A month and a half of caseworker-frontend changes also ships,
so once PROD is up:

- [ ] Smoke-test the **caseworker app** (login → a dashboard per role), not only
      `publiek.open-regels.nl`.
- [ ] PA cockpit: an **empty** live cockpit is the correct result on a fresh PROD database
      (see 7c). Check the Dossierbeheer banner reports live before reading anything into it.

The live-test scripts gained real coverage in this delta (`test-smoke-live.sh`,
`test-m2m-routes.sh`, `test-edocs-live.sh`, `test-doccle-live.sh`), but **none has a `prod`
preset** — `TARGET` accepts only `local|acc` and hard-errors otherwise. To point one at
PROD, override `BASE_URL` / `KEYCLOAK_URL` explicitly rather than passing `TARGET=prod`.

## Rollback

Static Web Apps deploy is push-based per branch (`acc` → ACC, `main` → prod) with
no separate rollback script — revert the merge commit and push, or use the Azure
Portal's SWA deployment history to redeploy a previous build. The backend's
`PUBLIC_SHOW_WIP_PROCESSES` and `CORS_ORIGIN` additions are additive-only (nothing
existing was removed), so no rollback needed there beyond a normal backend
redeploy if `deploy-backend-to-acc.sh`/`-prod.sh` ever needs reverting.
