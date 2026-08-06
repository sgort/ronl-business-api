# Public Search Site — where does this belong in the stack?

## Recommendation: its own package, `packages/public-site`

Not in `packages/frontend/public/`. That directory is served from the origin of
the authenticated app: everything there inherits the auth shell, the CSP, the
bundle size and the `staticwebapp.config.json` of the caseworker app. A public
site needs exactly the opposite.

```
packages/
  backend/          # existing — gains /v1/public/* (anonymous, read-only)
  frontend/         # existing — caseworker/PA/WOO, behind Keycloak
  shared/           # existing — types are shared
  public-site/      # NEW — publiek.open-regels.nl
```

### Why a separate package

|                                              | `frontend/public/` | route in frontend | **own package** |
| -------------------------------------------- | ------------------ | ----------------- | --------------- |
| No Keycloak/MSAL in the bundle               | ✗                  | ✗                 | ✓               |
| No AI-assistant code                         | ✓                  | ✗                 | ✓               |
| Own CSP + cache headers                      | ✗                  | ✗                 | ✓               |
| Prerender/SEO (sitemap, meta, OG)            | ✗                  | painful           | ✓               |
| Own deploy cadence                           | ✗                  | ✗                 | ✓               |
| Does not fail together with the internal app | ✗                  | ✗                 | ✓               |

### Stack

- Vite + React + TypeScript, same toolchain as `frontend` (copy
  `vite.config.ts`, `tsconfig.json`, `.eslintrc.cjs`).
- **No** Tailwind: the Rijkshuisstijl tokens live as plain CSS in
  `src/styles/pub.css` (see `pub.css` in this folder — portable as-is).
- Routing: `react-router-dom` with real URLs (see below).
- Prerender: `vite-plugin-ssr` / `vite-react-ssg`, or a build step that writes
  static HTML per detail page. SEO is the reason this site exists —
  client-only rendering is not an option.
- Deploy: its own Azure Static Web App, `publiek.open-regels.nl`, with a
  `staticwebapp.config.json` that has no auth routes.

### URL scheme (deep-linkable, permanent)

```
/                                       home
/zoeken?q=…&soort=regel&bron=…&sort=…   federated results (filters in the URL)
/berichten            /berichten/:slug
/nieuws               /nieuws/:slug
/producten            /producten/:slug
/regels               /regels/:slug
/processen            /processen/:key
/woordenboek          (Skosmos embed, no detail routes of its own)
/sitemap.xml  /robots.txt  /toegankelijkheid  /open-data
```

Filters belong in the query string, not in component state: a filtered result
must be shareable.

### Data: `/v1/public/*` on the existing backend

Same service layer, different router. Concretely in `packages/backend`:

- `src/routes/public.routes.ts` — no `requireAuth`, no tenant header; the
  tenant is fixed through `PUBLIC_TENANT=flevoland`.
- `GET` only. Never expose a write path.
- `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.
- Rate limit per IP (e.g. 60 req/min) and a hard `?limit=` cap.
- Response shapes reuse the types from `packages/shared`.

| endpoint                             | source (existing)                                |
| ------------------------------------ | ------------------------------------------------ |
| `GET /v1/public/berichten`           | Flevoland feed                                   |
| `GET /v1/public/nieuws`              | Rijksoverheid feed                               |
| `GET /v1/public/producten`           | Samenwerkende Catalogi / UPL                     |
| `GET /v1/public/regels` + `/:slug`   | RONL knowledge graph (SPARQL)                    |
| `GET /v1/public/processen` + `/:key` | Camunda deployment index                         |
| `GET /v1/public/begrippen`           | Skosmos (RONL Concepts) — feeds the Concepts tab |
| `GET /v1/public/zoeken?q=`           | federated index across all of the above          |

**Important:** the federated search index belongs server-side. In the prototype
it is built in the browser; that does not scale past a few hundred items. Build
it as a nightly job into a single table / Lunr index, or put Postgres
full-text (`tsvector`, Dutch configuration) underneath it.

### Privacy

No cookies, no third-party analytics, no personal data. That is a design
requirement, not a footnote — it is stated in the footer as well.

## Decided (6 August 2026)

- **Domain:** `publiek.open-regels.nl` — confirmed.
- **Home page:** variant **B — Six entry points**. A and C are dropped.
- **Rule catalogue** gets the same four tabs as the caseworker:
  Organisations / Services / Rules / Concepts. The Concepts tab filters by
  service and links each concept through to Skosmos.
- **Rules are fully browsable.** Every service with a count also delivers the
  rule rows (name + valid-from). In the prototype these live in `PUB_RULES`;
  in production they come from the knowledge graph — the count and the list
  must come from the same query, otherwise `84` drifts out of sync again.
- **The data dictionary is an embed** of `https://skosmos.open-regels.nl/ronl/{lang}/`
  in an iframe, with a source line and "open in a new tab", exactly as in the
  caseworker. Preconditions: Skosmos must allow `frame-ancestors
publiek.open-regels.nl` (CSP on the Skosmos host), the iframe carries a
  `title`, and a visible fallback link exists in case framing fails.
