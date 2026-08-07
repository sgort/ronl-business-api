# Test guide — `packages/public-site`

The public search site (`publiek.open-regels.nl`) has its own Vitest unit/component
suite and a Playwright end-to-end suite, separate from the caseworker frontend (see
[`TESTING-FRONTEND.md`](./TESTING-FRONTEND.md)). It ships no auth or telemetry, so
its tests focus on: rendering content from the anonymous `/v1/public/*` API,
URL-driven search/filter state, accessibility, and the prerender/seeding pipeline
that makes the site crawlable and free of a loading flash.

## Running the tests

```bash
# Unit/component (Vitest, jsdom) — once, with coverage
npm test --workspace=@ronl/public-site

# Watch mode (no coverage)
npm run test:watch --workspace=@ronl/public-site

# Single file / pattern
npx vitest run --config packages/public-site/vite.config.ts SectionIndex

# End-to-end (Playwright) against a LOCAL dev server — Playwright starts the dev
# server itself; the backend on VITE_API_URL must already be running, since these
# hit real /v1/public data, not mocks.
npm run test:e2e --workspace=@ronl/public-site

# End-to-end against an already-DEPLOYED site (skips the local dev server). Used for
# the go-live post-deploy verification — see docs/PUBLIC-SITE-GO-LIVE.md §6.
E2E_BASE_URL=https://acc.publiek.open-regels.nl npm run test:e2e --workspace=@ronl/public-site
```

Vitest runs in `jsdom` with `src/test/setup.ts`; v8 coverage is collected across
`src/**`. Current suite: **79 unit tests across 18 files**, plus **6 Playwright e2e
tests**.

## Unit / component tests

### Library & build utilities (`src/lib`, `scripts`)

| File                           | Covers                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/slug.test.ts`             | `slugify()` — URL-safe slugs for rule-catalogue detail routes; must stay identical to the backend's util so the two never disagree on a slug.                                                |
| `lib/useQueryState.test.tsx`   | URL-backed query state (`q`/`soort`/`bron`/`doelgroep`/`sort`) — parsing from and building the querystring, so a filtered result set is always a shareable link.                             |
| `lib/search.test.tsx`          | `highlight()` — wraps query-term matches in `<mark>` via React node splitting (never `dangerouslySetInnerHTML`), matching 3+ character terms only.                                           |
| `lib/api.test.ts`              | The typed `/v1/public/*` client — response parsing, dual-runtime base-URL resolution (browser vs. the Node prerender), and the 404-vs-throw split between list and item lookups.             |
| `lib/sectionHits.test.ts`      | `mapToHits()` — the single raw→`PublicHit` mapping shared by the prerender and `SectionIndex`, per content type.                                                                             |
| `lib/prerenderedData.test.ts`  | `readPrerenderedData()` — the route-scoped, pure reader for the embedded prerender blob (null on route mismatch / malformed / absent; safe for a `useState` lazy init).                      |
| `staticwebapp-csp.test.ts`     | Guards the shipped `staticwebapp.config.json` CSP — asserts `img-src` allows the org-logo host (`api.open-regels.triply.cc`); a regression here silently breaks logos on deploy.             |
| `scripts/prerender.test.ts`    | Prerender helpers — `escapeHtml`, `buildSitemap` (excludes `/zoeken` + `/woordenboek`), and `injectIntoShell` (title/description/canonical + route-scoped data-blob embedding, `<`-escaped). |
| `scripts/check-bundle.test.ts` | The bundle-cleanliness gate — the build fails if any forbidden auth/telemetry string (keycloak, msal, oidc, analytics) appears in the output.                                                |
| `i18n/i18n.test.ts`            | NL/EN dictionaries declare the same keys (structural parity).                                                                                                                                |

### Pages & components (`src`)

| File                            | Covers                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App.test.tsx`                  | Routing shell — every route registered; `document.documentElement.lang` synced to the language switch.                                                                                                                |
| `components/chrome.test.tsx`    | Presentational chrome (nav, search form, hit, facet, tabs, footer).                                                                                                                                                   |
| `pages/Results.test.tsx`        | Federated search results — URL-backed facets, counts taken from the server response.                                                                                                                                  |
| `pages/SectionIndex.test.tsx`   | The generic section list (`berichten`/`nieuws`/`producten`/`processen`) — lists fetched items, local text filter, **and prerendered-data seeding** (renders from the blob without fetching; cold load still fetches). |
| `pages/Regelcatalogus.test.tsx` | The 4-tab rule catalogue (Organisaties/Diensten/Regels/Begrippen) — tab-state persistence and prerendered-data seeding.                                                                                               |
| `pages/Detail.test.tsx`         | Generic per-type detail page.                                                                                                                                                                                         |
| `pages/Woordenboek.test.tsx`    | Skosmos iframe embed (title attribute, visible "open in new tab" fallback, `src` follows the language switch).                                                                                                        |
| `pages/static-pages.test.tsx`   | Toegankelijkheid + Open Data static pages.                                                                                                                                                                            |

## End-to-end tests (`e2e/publiek.spec.ts`, Playwright)

Six tests, run against **real** `/v1/public/*` data (no mocks — same rationale as the
caseworker E2E suite in [`TESTING-FRONTEND-UI.md`](./TESTING-FRONTEND-UI.md)):

1. `search → filter → detail → back` preserves the filtered URL
2. a deep link with filters pre-applied renders those filters checked
3. keyboard-only: the skip link is the first Tab stop, search is reachable and submits

Plus three axe-core accessibility scans (no critical/serious violations), one each on
the home, results, and a detail page.

**Targeting a deployed site.** The Playwright config honours `E2E_BASE_URL`: when set,
it runs against that URL and skips starting the local dev server. This is how the
go-live §6 post-deploy verification exercises the suite against the live ACC site
(`docs/PUBLIC-SITE-GO-LIVE.md`).

## Patterns specific to this package

- **Prerender + seeding.** The site is prerendered (a crawlable HTML fragment per
  route) but client-rendered with `createRoot`, not hydrated. To avoid a
  `null → "Laden…" → refetch` flash — and the layout shift (CLS) it caused — the
  prerender embeds each route's data as a JSON `<script>` blob and the page seeds
  React state from it on first render. Tests: `prerenderedData` (reader),
  `prerender` (embedding), and `SectionIndex`/`Regelcatalogus` (seed-without-fetch +
  cold-load-fetch). Live CLS results are recorded in `PUBLIC-SITE-GO-LIVE.md` §6.
- **No auth in the bundle.** `check-bundle.test.ts` plus the build-time gate enforce
  that no auth/telemetry code ever ships.
- **Config-as-contract.** `staticwebapp-csp.test.ts` treats the deployed CSP as a
  tested artifact, so a header change can't silently break rendering (e.g. logos).

## Coverage

`npm test --workspace=@ronl/public-site` writes a v8 coverage report to
`packages/public-site/coverage/`.

---

See also: [`TESTS.md`](./TESTS.md) (backend suite + the test-guide map),
[`TESTING-FRONTEND.md`](./TESTING-FRONTEND.md) (caseworker unit/component),
[`TESTING-FRONTEND-UI.md`](./TESTING-FRONTEND-UI.md) (caseworker E2E), and
[`PUBLIC-SITE-GO-LIVE.md`](./PUBLIC-SITE-GO-LIVE.md) (deploy + post-deploy verification).
