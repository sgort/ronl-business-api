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

## 2. Backend deploy — ACC and PROD (blocking)

This branch's whole Phase 1 (`GET /v1/public/processen`, `GET /v1/public/zoeken`,
the `/v1/public/{nieuws,producten,regels}/:slug` detail routes) only exists on
`feature/public-site` locally right now. Confirmed today: a real production build's
prerender step 404'd against `api.open-regels.nl` for exactly this reason — the
routes aren't there yet. Public-site has nothing to talk to in ACC/prod until this
is deployed.

**Deploy order matters — backend before the push.** The backend is deployed by
`deploy-backend-to-acc.sh` (a local `az webapp deploy` from a clean `acc` checkout;
it does **not** push). The frontend **and** public-site deploy from a **push to
`acc`**, which fires their GitHub Actions. The public-site build's prerender step
fetches `acc.api.open-regels.nl/v1/public/*`, so if the push lands before the
backend is live, that build 404s and fails. Deploy the backend first, in the window
between merging locally and pushing:

- [ ] `git checkout acc && git merge feature/public-site` — **locally, do not push
      yet**.
- [ ] `bash deploy-backend-to-acc.sh` — deploys the backend from local `acc` (the
      script enforces on-`acc`-and-clean itself; no push happens here).
- [ ] Smoke-test: `curl https://acc.api.open-regels.nl/v1/public/zoeken` returns
      real data, not 404.
- [ ] `git push origin acc` — triggers the frontend + public-site GitHub Actions;
      public-site's prerender now has a live backend. Requires the ACC SWA resource
      and its token secret (step 1) to already exist, or the Action fails at the
      deploy step.
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

- [ ] Lighthouse ≥ 95 on Performance / Accessibility / SEO (mobile), run against
      the live ACC or prod URL.
- [ ] Manual keyboard walkthrough, recorded (skip link → search → results →
      filters → detail, all reachable by keyboard alone).
- [ ] One manual `npx vite-bundle-visualizer` spot-check on a real ACC/prod build
      — Task 20's automated bundle-cleanliness gate already runs on every build,
      this is the human eyeball pass on top of it.
- [ ] Re-run the e2e suite (`npm run test:e2e --workspace=@ronl/public-site`)
      pointed at the live ACC URL instead of localhost, to catch anything that
      only differs in a real deployed environment (real TLS, real CDN caching
      headers, etc.).
- [ ] Register the accessibility statement (`/toegankelijkheid`) in the
      DigiToegankelijk register — content is live, the registration itself is a
      separate manual step on that external site.

## Rollback

Static Web Apps deploy is push-based per branch (`acc` → ACC, `main` → prod) with
no separate rollback script — revert the merge commit and push, or use the Azure
Portal's SWA deployment history to redeploy a previous build. The backend's
`PUBLIC_SHOW_WIP_PROCESSES` and `CORS_ORIGIN` additions are additive-only (nothing
existing was removed), so no rollback needed there beyond a normal backend
redeploy if `deploy-backend-to-acc.sh`/`-prod.sh` ever needs reverting.
