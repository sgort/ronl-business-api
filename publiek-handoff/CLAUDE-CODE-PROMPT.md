# Claude Code — build the public search site (`packages/public-site`)

Paste this whole file into Claude Code, with `publiek-handoff/` as context.

> Note on language: this document, the code and the comments are English.
> The **user-facing UI copy stays Dutch** (with an English toggle) — see
> `PUB_T` in `pub-data.reference.jsx` for both string sets.

---

## Assignment

Build a public, unauthenticated website that surfaces all the open information
currently only visible behind the caseworker navigation **Zoeken** (Berichten,
Nieuws, Producten & Diensten, Regelcatalogus, Procesbibliotheek,
Gegevenswoordenboek). No login, no AI assistant, no personal data.

The design is fixed in `Zoeken Publiek.html` (React prototype) plus
`publiek/pub.css`. Carry over style and structure literally.

## Placement

New package `packages/public-site` — rationale and alternatives in
`ARCHITECTURE.md`. **Not** in `packages/frontend/public/`.

## Definition of Done

- [ ] `packages/public-site` runs with `npm run dev -w public-site` on :5175
- [ ] All six sections fed from `/v1/public/*`, no mock data in the build
- [ ] Federated search with Type / Source / Audience facets, filters in the URL
- [ ] A detail page per item on a permanent URL, prerendered
- [ ] NL/EN switch; `<html lang>` follows the choice
- [ ] WCAG 2.1 AA demonstrable: axe-core clean on home, results and detail;
      manual keyboard walkthrough recorded
- [ ] `sitemap.xml` + `robots.txt` generated at build time
- [ ] Lighthouse ≥ 95 on Performance, Accessibility, SEO (mobile)
- [ ] No auth, telemetry or assistant code in the bundle (verify with
      `npx vite-bundle-visualizer`)
- [ ] Backend: `/v1/public/*` is `GET`-only, anonymous, rate-limited, cached

---

## 1. Set up the package

```bash
mkdir -p packages/public-site/src/{pages,components,styles,lib,i18n}
```

`package.json` (name `public-site`), Vite + React 18 + TS + react-router-dom.
Copy `tsconfig.json`, `.eslintrc.cjs`, `postcss.config.js` from
`packages/frontend`. **No** Tailwind, **no** `@azure/msal`, **no** keycloak-js.

Add it to the root `package.json` workspaces (already `packages/*`) and to the
CI matrix.

## 2. Styling

Copy `publiek/pub.css` to `src/styles/pub.css` and import it once in
`main.tsx`. Tokens sit at the top as CSS custom properties.

Rijkshuisstijl colours already in the CSS:

| token             | value     | use                         |
| ----------------- | --------- | --------------------------- |
| `--ro-blue`       | `#154273` | top bar, hero, accent rules |
| `--ro-link`       | `#01689b` | links, primary button       |
| `--ro-link-hover` | `#007bc7` | hover                       |
| `--ro-focus`      | `#f9e11e` | focus ring (with 2px black) |
| `--ro-mustard`    | `#ffb612` | wordmark stripe             |
| `--ro-lint`       | `#c8102e` | errors and annotations only |

**Font:** the prototype uses Fira Sans as a stand-in. Production should use
RO Sans / Rijksoverheid Sans, which is licence-bound — settle that before
launch, or keep Fira Sans and record the decision in the style guide. Self-host
the webfont under `/fonts/`, not via Google Fonts (privacy).

**Logo:** do not use the Rijkslogo mark without permission. The design
deliberately uses a typographic wordmark with a mustard stripe.

## 3. Components

Port one-to-one from the prototype (`publiek/pub-parts.jsx`,
`publiek/pub-pages.jsx`), converted to TS:

```
components/  SkipLink  TopBar  MainNav  SearchForm  TypeTag  Hit  Facet
             Footer    Crumbs  TechDetails  Callout  Tabs
pages/       Home  Results  SectionIndex  Regelcatalogus  Woordenboek  Detail
             Toegankelijkheid  OpenData  NotFound
lib/         api.ts  search.ts  slug.ts  useQueryState.ts
i18n/        nl.ts  en.ts        (strings already in publiek/pub-data.jsx → PUB_T)
```

### Home page — variant B, decided

Build **B — Six entry points**: a compact search bar in a grey band at the top,
then the title and the card grid with the six entry points. Variants A and C
remain in the prototype behind the _Startpagina_ tweak but are dropped — do not
build them, not even as a feature flag.

### Layered depth (mixed audience)

Every detail page has the same structure:

1. Type tag + source + date
2. H1 + standfirst in plain language (B1 level where possible)
3. "What you need to know" — bullets, no jargon
4. Facts aside on the right (implementing body, validity, identifier)
5. Open-data callout with the `GET /v1/public/...` path
6. `<details>` **Technical details** — closed by default, with keys, formats,
   API path. This is the developer layer; it must not get in the layman's way.

## 3b. Rule catalogue and data dictionary

**Regelcatalogus** is not a flat list but a tabbed page, matching the
caseworker version:

| tab           | content                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Organisations | 8 implementing bodies, each with their services as chips                                              |
| Services      | 13 services as result rows, clickable through to detail                                               |
| Rules         | accordion per service with all rule rows (name + valid from) plus free search across rule names       |
| Concepts      | table concept → service, with a search field and a service filter; every concept links out to Skosmos |

Rule counts and the rule list **must come from the same query**. In the earlier
design Zorgtoeslag showed "15 rules" without any way to see those 15; that is
fixed now and must not regress. If a service has no rules, do not show it in
the Rules tab (no empty 0/0 accordions).

**Gegevenswoordenboek** is an embed, not an index of its own:

```html
<iframe
  src="https://skosmos.open-regels.nl/ronl/{nl|en}/"
  title="Gegevenswoordenboek — Skosmos (RONL Concepts)"
  loading="lazy"
></iframe>
```

Above it a source line ("Bron: Skosmos · RONL Concepts") and, on the right,
"Openen in een nieuw tabblad ↗". The embed language follows the NL/EN switch.
Preconditions: Skosmos must allow framing from `publiek.open-regels.nl`
(`Content-Security-Policy: frame-ancestors`), the iframe carries a `title` for
screen readers, and the fallback link stays visible so the page remains usable
if framing fails. Do **not** put this section in the sitemap as searchable
content — Skosmos indexes itself.

## 4. Search

- Query state in the URL: `?q=&soort=&bron=&doelgroep=&sort=`.
- Facets show **counts within the current query, before their own facet
  filter** (as in the prototype: `base` = results without facets).
- Result counter inside an `aria-live="polite"` region.
- Highlight search terms with `<mark>` — never `dangerouslySetInnerHTML`; the
  prototype splits on a regex and renders React nodes.
- Empty state with a real suggestion, not just "0 results".
- Server-side index (see ARCHITECTURE.md); the client-side `pubSearch` in the
  prototype demonstrates the _behaviour_, not the implementation.

## 5. Accessibility (WCAG 2.1 AA — explicitly in scope)

Already present in the prototype's CSS/markup; keep it:

- `.pub-skip` skip link, first focusable element, becomes visible on focus.
- Focus indicator: 2px black outline + 4px yellow glow (`--ro-focus`).
  Never `outline:none` without a replacement.
- Every form field has a `<label>` (visually hidden where needed, using the
  clip technique — never `display:none`).
- Facets inside `<fieldset>`/`<legend>`.
- Landmarks: `header`/`nav`/`main#pub-main`/`aside`/`footer`, each with an
  `aria-label` where several of a kind exist.
- Breadcrumb as `<nav aria-label="kruimelpad">`.
- Contrast: all text combinations ≥ 4.5:1; white on `--ro-blue` is 8.6:1.
- Touch targets ≥ 44px on mobile (checkboxes are 18px inside a 44px label row).
- Respect `prefers-reduced-motion` (there are no animations now — keep it so).
- Publish a real accessibility statement at `/toegankelijkheid` and register it
  in the DigiToegankelijk register.

Add `@axe-core/playwright` to the e2e suite, one test per page type.

## 6. Responsive

The prototype shows desktop and mobile side by side (tweak _Weergave → beide_).
Mobile behaviour lives in the `.pub-mobile` class; in production convert that
to media queries on the same selectors (the 860px breakpoint is already in
`pub.css`). Mobile: navigation wraps, facets move into a `<details>` block
above the results, the detail aside moves below the text.

## 7. Tests

```
src/**/*.test.tsx   Vitest + Testing Library — search logic, facet counts,
                    language switch, highlight escaping
e2e/publiek.spec.ts Playwright — search → filter → detail → back,
                    deep link with filters, keyboard path, axe scan
```

At minimum:

- `search.test.ts`: an empty query returns everything; facet counts are right;
  filtering on two types adds up; regex metacharacters in the query do not crash.
- `Regelcatalogus.test.tsx`: every service with `count > 0` renders exactly
  `count` rule rows; services with 0 rules are absent from the Rules tab.
- `Detail.test.tsx`: technical details are collapsed and expandable.
- `i18n.test.ts`: every key exists in both nl and en.

## 8. Backend

See ARCHITECTURE.md § Data. Write `public.routes.ts` with an explicit
allow-list of fields per resource — never serialise a service object directly;
no internal field may leak to an anonymous endpoint.

Add a test that fails as soon as `/v1/public/*` accepts a non-`GET` method or
requires an auth header.

---

## Reference files in this folder

| file                                 | what                                             |
| ------------------------------------ | ------------------------------------------------ |
| `ARCHITECTURE.md`                    | placement in the stack, URL scheme, API contract |
| `pub.css`                            | complete stylesheet, production-ready            |
| `pub-data.reference.jsx`             | i18n strings, section definitions, search logic  |
| `pub-parts.reference.jsx`            | chrome components                                |
| `pub-pages.reference.jsx`            | home variants, results, sections, detail         |
| `Zoeken Publiek.html` (project root) | the running prototype                            |
