# Public Search Site — handoff

Design plus implementation package for the public, unauthenticated version of
the caseworker navigation section **Zoeken**.

Documentation is English; the user-facing UI copy stays Dutch, with an English
toggle built in.

| file                      | what                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `CLAUDE-CODE-PROMPT.md`   | paste-ready for Claude Code — assignment, DoD, step by step        |
| `ARCHITECTURE.md`         | where it belongs in the stack, URL scheme, `/v1/public/*` contract |
| `pub.css`                 | complete stylesheet (Rijkshuisstijl tokens), production-ready      |
| `pub-data.reference.jsx`  | i18n strings, section definitions, search and facet logic          |
| `pub-parts.reference.jsx` | chrome: top bar, nav, search form, hit, facet, footer              |
| `pub-pages.reference.jsx` | home variants, results, section pages, rule catalogue, detail      |

The running prototype lives in the project root: **`Zoeken Publiek.html`**.
Tweaks: home variant (A/B/C), desktop/mobile/both, NL/EN, WCAG annotations.

## Decided

- Domain: `publiek.open-regels.nl`
- Home page: variant **B — Six entry points**
- Rule catalogue with four tabs (Organisations / Services / Rules / Concepts)
- Data dictionary = Skosmos embed

## Still open

1. **Webfont.** Fira Sans stands in for RO Sans (licence to be arranged).
2. **Search index.** Client-side in the prototype; server-side in production.
3. **CSP on Skosmos.** `frame-ancestors` must allow `publiek.open-regels.nl`.
