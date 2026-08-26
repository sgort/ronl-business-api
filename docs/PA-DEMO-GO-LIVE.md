# PA-Cockpit demo go-live checklist

Everything needed to take `packages/pa-demo` from "works locally" to live at
`plato.open-regels.nl` / `acc.plato.open-regels.nl`. **ACC is done; PROD is
pending** — every PROD item below is unstarted.

`pa-demo` is a public, unauthenticated, **mock-only** instance of the PA Cockpit,
built so a prospective province can be shown the product without an account. It
reaches no backend at all, by four independent means (§5).

Related: [PUBLIC-SITE-GO-LIVE.md](./PUBLIC-SITE-GO-LIVE.md) (same style, the
sibling public site whose conventions this follows),
`docs/superpowers/specs/2026-08-24-public-pa-cockpit-design.md` (the design,
including a "Corrected since this design was written" section),
`docs/superpowers/plans/2026-08-24-public-pa-cockpit.md` (the implementation plan).

## 1. Azure Static Web App resources

> **Create each SWA with deployment `Source: Other`** — not GitHub. Picking GitHub
> makes Azure write its _own_ workflow into the repo, which then competes with
> `azure-pa-demo-*.yml`. Our workflows deploy a pre-built `dist` via
> `skip_app_build: true`. On a resource created correctly, `az staticwebapp show`
> reports `provider: None`. This is the same trap [§1 of the public-site
> checklist](./PUBLIC-SITE-GO-LIVE.md) warns about.

Subscription: **Platform Regelbeheer 2025 — C1427**
(`24eac314-4634-4da2-85a5-35bdce38a384`) — the same one holding
`ronl-business-public-site-acc`.

- [x] **ACC** resource group and Static Web App:

      az group create --name ronl-pademo-site-acc --location westeurope

      az staticwebapp create \
        --name ronl-business-pademo-site-acc \
        --resource-group ronl-pademo-site-acc \
        --location westeurope \
        --sku Standard

- [ ] **PROD** equivalents. Nothing exists yet. Suggested names, following the
      ACC pattern and public-site's: resource group `ronl-pademo-site-prod`, SWA
      `ronl-business-pademo-site-prod`. Confirm before creating.

`Standard` matches `ronl-business-public-site-acc` rather than being required —
`Free` would very likely suffice for demo traffic, but moving Free → Standard
later means recreating the resource, not toggling a setting.

|                  | ACC                                         | PROD      |
| ---------------- | ------------------------------------------- | --------- |
| Resource group   | `ronl-pademo-site-acc`                      | _pending_ |
| Static Web App   | `ronl-business-pademo-site-acc`             | _pending_ |
| Region / SKU     | westeurope / Standard                       | _pending_ |
| Default hostname | `red-river-0ce4c9803.7.azurestaticapps.net` | _pending_ |

## 2. Deployment token secrets

The workflows fail at their final step without these. Names are exact — they are
already referenced in the YAML.

- [x] `AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_ACC`
- [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_PROD`

Retrieve a token with `az staticwebapp secrets list -n <swa> -g <rg> --query
"properties.apiKey" -o tsv`, then add it under GitHub → Settings → Secrets and
variables → Actions. Rotate at any time with `az staticwebapp secrets
reset-api-key -n <swa> -g <rg>`; the token is not precious, so prefer rotating
over worrying about where a copy ended up.

## 3. DNS and custom domains

- [ ] `acc.plato` → CNAME → `red-river-0ce4c9803.7.azurestaticapps.net`, in the
      `open-regels.nl` Azure DNS zone.
- [ ] `plato` → CNAME → the PROD SWA's default hostname, once §1 exists.

**Two steps, not one.** The DNS record alone gives a name that resolves and that
Azure will not serve — which looks like slow propagation and is not. Register the
hostname on the resource as well:

      az staticwebapp hostname set \
        --hostname acc.plato.open-regels.nl \
        -n ronl-business-pademo-site-acc \
        -g ronl-pademo-site-acc

The managed certificate provisions automatically after validation. The site stays
reachable on its `*.azurestaticapps.net` hostname afterwards — useful, because it
lets you verify a deploy before pointing the domain at it, keeping "does the
pipeline work" and "does DNS resolve" as separate questions.

## 3b. The social card, before the first PROD deploy

`packages/pa-demo/public/og-pa-demo.png` is the Open Graph card. Its _URLs_ are
per-environment automatically — `index.html` is authored against the production
origin and `vite.config.ts`'s `transformIndexHtml` plugin rewrites `og:url` and
`og:image` to the origin being built for (`scripts/social-card-origin.ts`,
covered by unit tests and by an E2E test that compares them against the run's own
base origin).

**The image is not.** The shipped PNG has acceptance baked into its pixels: an
`ACCEPTATIEOMGEVING` badge and `acc.plato.open-regels.nl` in its footer. Deploying
it to production unchanged yields a card reading ACC while `og:url` reads PROD.

- [ ] Re-capture the production card before the first PROD deploy. Two edits in
      `docs/pa-demo-social-handoff/reference/social-card-pa-demo.html` — drop the
      `<p class="badge">` and change the `<span class="url">` to
      `plato.open-regels.nl` — then capture `#card` at exactly 1× (1200×630) and
      replace `packages/pa-demo/public/og-pa-demo.png`. Full instructions in that
      folder's `README.md`.

Leave `Mockdata · geen productiegegevens` on the card. It is true on production
too — pa-demo is mock-only by construction on every environment (§5).

## 4. Workflows

| Workflow                 | Fires on                               | Deploys                    |
| ------------------------ | -------------------------------------- | -------------------------- |
| `azure-pa-demo-acc.yml`  | push/PR to `acc` + `workflow_dispatch` | `acc.plato.open-regels.nl` |
| `azure-pa-demo-prod.yml` | push to `main` + `workflow_dispatch`   | `plato.open-regels.nl`     |

Both deploy workflows are path-filtered to `packages/pa-demo/**`,
`packages/shared/**` and their own file. A push touching only `pa-demo` therefore
fires **nothing else in this repo** — no backend, frontend or public-site deploy.

`packages/shared/**` is included even though every `@ronl/shared` import in
`pa-demo` is type-only and erased at build time, so a shared-only change cannot
alter the compiled output. The filter exists so a _breaking type change_ still
runs pa-demo's `type-check` here, rather than surfacing later at an unrelated PR.

ACC runs, in order: install → build shared → lint → type-check → unit tests →
Playwright browser install → **E2E** → build (with the bundle gate) → deploy.
**PROD does not run E2E**; if that matters to you, add it before the first
production deploy rather than after.

`workflow_dispatch` on both means a deploy can be triggered by hand — useful when
merging with `[no ci]` in the tip commit to suppress the automatic run.

## 5. What keeps the demo off the backend

Four independent layers, each sufficient alone. Any change here should preserve
all four rather than trading one for another.

1. **Forced mock.** Both legacy mock env vars are `true`, so the build-time
   default is mock; `src/main.tsx` writes `'1'` to `paV2.mock` before mounting, so
   an inherited or stale key cannot win. Guarded by `src/mock-lock.test.ts` and
   `src/env-files.test.ts`.
2. **No toggle in the UI.** The `Dossierbeheer` component from `@ronl/pa-cockpit`
   renders its own "Zet vlag om naar live →" button; `src/demo/demo-overrides.css` hides it with
   `display: none`, which removes it from the tab order and the accessibility tree
   as well as the screen. The reset button beside it stays. Proven in a real
   browser only by the E2E suite.
3. **CSP.** `packages/pa-demo/public/staticwebapp.config.json` sets
   `connect-src 'self'` with no backend origin in any directive. Guarded by
   `src/staticwebapp-csp.test.ts`, which parses the shipped file.
4. **Bundle gate.** `scripts/check-bundle.mjs` fails the build if the output
   contains an auth library, telemetry, or a backend origin — proving the URL is
   not present to be requested at all. Note its forbidden list deliberately
   differs from public-site's: that one rejects the bare string `keycloak`, which
   this bundle ships legitimately in role labels, so pa-demo targets `keycloak-js`
   and the origins instead.

Layers 2 and 4's real-browser behaviour is only asserted by the E2E suite, which
is why it runs in the ACC workflow.

## 6. Post-deploy verification

The Playwright suite retargets at a deployed site — no backend, database or
Keycloak needed, unlike every other suite in this repo:

      E2E_BASE_URL=https://acc.plato.open-regels.nl \
        npm run test:e2e --workspace=@ronl/pa-demo

That runs the same eleven tests against the real domain, including the
no-backend network guard, the hidden-toggle assertions and the social card's
origin check. Prefer it to a manual smoke test.

Quick manual checks that catch the common deploy faults:

- [ ] A deep link (e.g. `/beheer`) returns 200, not 404 — confirms the SWA config
      shipped inside `dist/` and `navigationFallback` is active.
- [ ] `/pa/feiten-icons/wonen.png` returns 200 `image/png` — confirms the
      `@ronl/pa-cockpit` static assets deployed.
- [ ] The response carries `content-security-policy: … connect-src 'self' …`.
- [ ] Beheer shows **nine** sections, with no IOU group and no Hulpmiddelen.
- [ ] Paste the site URL into a link-preview validator (or Slack) and confirm the
      card renders. The E2E test proves `og:image` resolves to a real PNG on this
      origin; only a scraper proves the preview itself composes. On ACC the card
      should read `ACCEPTATIEOMGEVING` — on PROD it must not (§3b).

Note that a 404-shaped URL returns **200 serving the SPA shell**, because `.json`
and most extensions are not in `navigationFallback`'s exclude list. Check the
response body, not the status code, before concluding a file leaked.

## 7. Known limitations

- **Authored dossiers do not survive a reload.** `mock-demo.store.ts` persists
  signals, saved searches and seen notifications to `localStorage`;
  `dossierbeheer.api.ts` is in-memory only. The agreed fix is to build persistence
  in the real Dashboard, so plato inherits it through `@ronl/pa-cockpit`.
- **The fictional-data disclaimer appears on one page only** — `src/demo/Profiel.tsx`.
  Dossierbeheer's Mock banner describes mock _data sourcing_, not fictional data.
  A site-wide replacement is deliberately deferred until after the first deploy.
- **The changelog is a curated summary**, not the product's real history: 25 CalVer
  releases distilled into 3 themed entries in `src/demo/changelog/changelog.data.ts`.
  The real `changelog-data.ts` trips the bundle gate — its commit messages quote
  backend hostnames and auth-library names. Content added there must stay clear of
  `scripts/check-bundle.mjs`'s forbidden list.
