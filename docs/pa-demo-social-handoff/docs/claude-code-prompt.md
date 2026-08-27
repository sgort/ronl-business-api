# Claude Code prompt — add the social card to `packages/pa-demo`

Copy everything below the line into Claude Code, from the repo root of
`ronl-business-api`. It is written to be executed as-is; the design assets it
refers to are in this handoff folder.

---

## Task

Add an Open Graph / Twitter social card to `packages/pa-demo`, so links to
`acc.plato.open-regels.nl` (and later `plato.open-regels.nl`) render a proper
preview instead of a bare URL.

Follow the conventions already established in `packages/public-site` — that
package solved this same problem and its solution is the reference
implementation. Read these first:

- `packages/public-site/index.html` — the OG meta block and its explanatory comment
- `packages/public-site/scripts/prerender.ts` — `rewriteSocialCardOrigin()` and the comment above it
- `packages/public-site/scripts/prerender.test.ts` — how that rewrite is tested
- `docs/PA-DEMO-GO-LIVE.md` §5 and §6 — the four no-backend layers and the post-deploy checks

## Files provided in this handoff

| File                                 | Goes to                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `design/og-pa-demo.png` (1200×630)   | `packages/pa-demo/public/og-pa-demo.png`                                         |
| `reference/social-card-pa-demo.html` | `docs/pa-demo-social-handoff/reference/` (source of the image, for future edits) |

Commit the PNG. It is ~60 KB and is served as a static asset, not bundled.

## Step 1 — the image

Copy `design/og-pa-demo.png` to `packages/pa-demo/public/og-pa-demo.png`.

`public/` is copied verbatim into `dist/`, and
`public/staticwebapp.config.json`'s `navigationFallback.exclude` already lists
`*.{png,...}`, so `/og-pa-demo.png` will serve as a real file rather than being
rewritten to the SPA shell. No config change is needed for this — verify it,
don't edit it.

## Step 2 — the meta tags

`packages/pa-demo/index.html` currently has a four-line `<head>`. Add an OG
block modelled on `packages/public-site/index.html`, with a comment in the same
spirit (where the image comes from, why the URLs are absolute, and that it is
sitewide rather than per-page):

- `og:type` `website`, `og:site_name` `Open Regels Nederland`, `og:locale` `nl_NL`
- `og:title` — **Flevoland Public Affairs**
- `og:description` — _Werkende demo van de PA-Cockpit: dossiers, curatie, monitoring en voortgang in één werkomgeving._
- `og:url` — the production origin, `https://plato.open-regels.nl/`
- `og:image` — `https://plato.open-regels.nl/og-pa-demo.png`, plus `og:image:width` 1200, `og:image:height` 630, and an `og:image:alt`
- `twitter:card` `summary_large_image`
- also add a `<meta name="description">` — the package has none today

Absolute URLs are required: scrapers do not resolve relative paths.

Keep the existing `<title>` and `<meta name="robots">` as they are.

## Step 3 — per-environment origin (the part that actually bit public-site)

Hardcoded production URLs in a static `index.html` mean **ACC link previews
point at a domain that is not live yet** — the exact bug that shipped in
public-site v2026.08.15 (see the comment above `rewriteSocialCardOrigin`).

`pa-demo` has no prerender step to hook into, so do it in Vite instead: add a
`transformIndexHtml` plugin to `packages/pa-demo/vite.config.ts` that rewrites
the production origin to the origin for the current mode.

- `development` → `http://localhost:5176` (pa-demo's dev port, per `server.port`)
- `acceptance` → `https://acc.plato.open-regels.nl`
- `production` → `https://plato.open-regels.nl`

Export the string transform as a **pure function** so it can be unit-tested
without running a build — mirror `rewriteSocialCardOrigin`'s shape and its
tests. Put it wherever it fits the package's layout best; `src/main-helpers.ts`
is already the home for testable non-component logic.

Check how each build script passes its mode (`packages/pa-demo/package.json`
plus the `.env.*` files) and derive the origin from that rather than inventing a
new env var, if an existing one already carries it.

## Step 4 — tests

Add to the existing suites, matching their style:

1. Unit test for the origin rewrite — production input → each of the three
   origins, and one negative case proving unrelated tags (e.g.
   `og:image:width`) are untouched. `prerender.test.ts` has the pattern.
2. Extend `src/staticwebapp-csp.test.ts` or add a sibling asserting
   `navigationFallback.exclude` still covers `.png`, so a future config edit
   cannot silently turn the card into an HTML shell.
3. An assertion that `index.html` carries `og:image`, `og:image:width`,
   `og:image:height` and `twitter:card` — cheap, and it catches a bad merge.

## Constraints — do not break the no-backend guarantee

`docs/PA-DEMO-GO-LIVE.md` §5 lists four independent layers. This change must
preserve all four:

- **Do not** add a backend or CDN origin to any CSP directive. The card needs
  none: the scraper fetches the image from our own origin, and `img-src 'self'`
  already allows it. `connect-src 'self'` stays as-is.
- **Do not** load a font, script or image from a third party in `index.html`.
  `script-src 'self'` would block it anyway.
- `scripts/check-bundle.mjs` scans `.js` files only, so meta tags in
  `index.html` cannot trip it — but do not put the origin strings into TypeScript
  that ends up in the bundle beyond the one rewrite helper, and keep them clear
  of the forbidden list either way.

## Definition of done

- `npm run lint --workspace=@ronl/pa-demo` and `type-check` pass
- `npm run test --workspace=@ronl/pa-demo` passes, including the new tests
- `npm run vendor:check --workspace=@ronl/pa-demo` still passes — **no file
  under `src/vendor/` is touched by this change**
- `npm run build --workspace=@ronl/pa-demo` passes the bundle gate, and
  `dist/index.html` contains the correct origin for the mode built
- `dist/og-pa-demo.png` exists

Then, after deploying to ACC, per §6 of the go-live doc:

- `https://acc.plato.open-regels.nl/og-pa-demo.png` returns 200 `image/png`
- `dist/index.html`'s `og:image` points at `acc.plato…`, not `plato…`
- paste the URL into a link-preview validator (or Slack) and confirm the card renders

## Out of scope

- Do not add a favicon in this change — `pa-demo` has none, that is a separate decision
- Do not add per-page or per-mode cards; one sitewide card, as in public-site
- Do not create the PROD Static Web App or DNS records (§1/§3 of the go-live doc)
