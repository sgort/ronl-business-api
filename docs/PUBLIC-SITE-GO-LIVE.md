# Public site go-live checklist

Everything needed to take `packages/public-site` from "works on `feature/public-site`
locally" to live at `publiek.open-regels.nl` / `acc.publiek.open-regels.nl`. Ordered
so blocking items come first — several steps depend on an earlier one existing.

Related: [ARCHITECTURE.md](../publiek-handoff/ARCHITECTURE.md) (design doc — not
committed, reference only), [EDOCS-GO-LIVE.md](./EDOCS-GO-LIVE.md) (same style, a
different integration), `docs/superpowers/plans/2026-08-06-public-site.md` (the
21-task implementation plan this branch executed).

## 1. Azure Static Web App resources (blocking)

Neither SWA resource exists yet. The CI workflows
([azure-publicsite-acc.yml](../.github/workflows/azure-publicsite-acc.yml),
[azure-publicsite-prod.yml](../.github/workflows/azure-publicsite-prod.yml)) will
fail on first push without them.

- [ ] Create the **ACC** Static Web App in Azure (matches `azure-frontend-acc.yml`'s
      resource for the pattern to copy).
- [ ] Create the **PROD** Static Web App in Azure.
- [ ] Copy each resource's deployment token (Azure Portal → the SWA resource →
      "Manage deployment token", or `az staticwebapp secrets list`).
- [ ] Add both tokens as GitHub repo secrets, **exact names** (already referenced
      by the workflows):
  - [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_ACC`
  - [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_PROD`

## 2. Backend deploy — ACC and PROD (blocking)

This branch's whole Phase 1 (`GET /v1/public/processen`, `GET /v1/public/zoeken`,
the `/v1/public/{nieuws,producten,regels}/:slug` detail routes) only exists on
`feature/public-site` locally right now. Confirmed today: a real production build's
prerender step 404'd against `api.open-regels.nl` for exactly this reason — the
routes aren't there yet. Public-site has nothing to talk to in ACC/prod until this
is deployed.

- [ ] Merge `feature/public-site` → `acc`.
- [ ] `bash deploy-backend-to-acc.sh` (must run from a clean `acc` checkout — the
      script enforces this itself).
- [ ] Smoke-test: `curl https://acc.api.open-regels.nl/v1/public/zoeken` returns
      real data, not 404.
- [ ] Repeat for prod once ACC is verified: merge to whatever branch
      `deploy-backend-to-prod.sh` deploys from, then run it.

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

- [ ] `CORS_ORIGIN` updated on ACC backend App Service
- [ ] `CORS_ORIGIN` updated on PROD backend App Service
- [ ] `LDE_API_URL` set explicitly on PROD backend App Service
- [ ] `PUBLIC_SHOW_WIP_PROCESSES=true` set on ACC backend App Service
- [ ] Restart both App Services after saving (Azure App Service settings changes
      require a restart to take effect)

## 4. Caddy deploy — Skosmos CSP fix (blocking for the Gegevenswoordenboek page)

`skosmos.open-regels.nl` currently sends `X-Frame-Options: DENY`, which blocks
**all** iframe embedding — including the caseworker app's existing
Gegevenswoordenboek, not just the new public site. Already fixed in this branch
([Caddyfile](../Caddyfile), [deployment/vm/caddy/Caddyfile](../deployment/vm/caddy/Caddyfile)):
a dedicated `skosmos_security_headers` snippet replaces the blanket
`X-Frame-Options: DENY` with a CSP `frame-ancestors` allow-list scoped to the
origins that actually embed it.

- [ ] Deploy the updated Caddyfile to the server hosting `skosmos.open-regels.nl`
      (however Caddy config normally gets pushed there).
- [ ] Reload Caddy (`caddy reload` / `docker compose restart` / whatever the
      existing flow is — this repo's Caddy deploy isn't scripted, unlike the
      backend).
- [ ] Verify: open `https://acc.publiek.open-regels.nl/woordenboek` (once step 1
      is live) or `http://localhost:5175/woordenboek` locally — the iframe should
      load, not show "heeft geweigerd verbinding te maken".

## 5. DNS — Azure DNS zone `open-regels.nl` (blocking)

You own this zone in Azure DNS, which matters for `publiek.open-regels.nl`
specifically: it's an **apex/root record**, and a plain CNAME is not valid at a
zone apex per DNS spec. Azure DNS's **Alias record** feature solves this natively —
an Alias record at the apex can point directly at an Azure resource (the Static
Web App), unlike a plain CNAME. `acc.publiek.open-regels.nl` is an ordinary
subdomain and a plain CNAME works fine there.

- [ ] In the Azure Static Web App resource (ACC), add the custom domain
      `acc.publiek.open-regels.nl` — Azure will show the exact validation record
      to add first (typically a `TXT` record).
- [ ] Add that validation `TXT` record in the `open-regels.nl` Azure DNS zone.
- [ ] Add a `CNAME` record: `acc.publiek` → the SWA's default hostname (Azure
      shows this on the custom domain screen).
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
