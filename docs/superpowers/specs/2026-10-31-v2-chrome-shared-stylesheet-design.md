# One shared stylesheet for the v2 chrome (#374 item 4)

Status: approved 2026-10-31; amended after review the same day (see below).
Issue: #374 item 4. Prerequisite for #405 (step 2, the Flevoland look). Item 5
(split a section into its component's file when editing it) uses the same
proof tool.

## Why

The dashboard chrome (top bar, logo, search, user block, changelog button,
mode tabs, body grid, left rail, main area, page title, buttons, no-access
panel, empty state, ⌘K palette, assistant dock) exists twice:

- `packages/frontend/src/pages/caseworker-v2/dashboard-v2.css`, under
  `.cwd-v2` with `.v2-*` classes and `--v2-*` variables. Caseworker V2, the
  Infra-board (`.pbd`) and Woo (`.wood`) use it.
- `packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css`, under
  `.pac` with `.pac-*` classes and `--pac-*` variables, so PA-Cockpit renders
  without the frontend (pa-demo).

Comparing the two (selectors mapped `.pac`→`.cwd-v2`, `.pac-`→`.v2-`,
`--pac-`→`--v2-`): 34 rules are identical, 21 differ in a few declarations
(for example top bar `flex-shrink`, rail 240 vs 248px, `.v2-btn-sm` padding
12 vs 11px, the no-access panel), the rest exist on one side only. #405 would
have to restyle every piece twice, and the two can drift into a mixed look.

## Decision (user, 2026-10-31)

**One shared stylesheet with grouped selectors.** Each chrome rule is written
once, as `.cwd-v2 .v2-topbar, .pac .pac-topbar { … }`, using `--rba-*` tokens.
No TSX change, no class rename. Renaming PA's classes to `v2-*` was the
cleaner result but touches components and tests on both hosts; only moving the
five `v2-*` classes the cockpit renders would leave #405 with two chromes.

## Amendment after review (user, 2026-10-31)

The whole-branch review found two errors in the first version of this
design, both corrected below:

1. **Load order.** The frontend's `App.tsx` imports the dashboard pages
   statically, before `@ronl/pa-cockpit/styles.css`; nothing is lazy. So
   `dashboard-v2.css` and the Infra-board and Woo layers load _before_
   `styles.css`, and a chrome imported there would have overridden them
   (`.pbd .v2-rail-card` would have lost its `padding-bottom`). Each app now
   imports the chrome itself, first.
2. **Accent.** Infra-board and Woo set `--v2-accent` inline on their root.
   `--rba-accent` is defined on `:root` and ignores that, so declarations
   that use the accent stay in the host files, and `--rba-accent-50/-d` are
   not added.

The first `check:css-move` missed both: it modelled a fixed, wrong file list
and compared exact property names only. It now reads each app's real load
order from the import graph and relates shorthands to longhands.

## Goals

- Nothing changes on screen, in either host, for any tenant. This is a pure
  refactor, and it is proved, not eyeballed.
- Every declaration that is identical on both sides lives once, in
  `packages/shared/styles/v2-chrome.css`.
- Each host file keeps only what is its own: host-only rules, and the
  declarations where the two sides differ today.

## Non-goals

- **Settling the differences.** A differing declaration stays in its host
  file as it is. Whether the rail is 240 or 248px is #405's call, made once
  in the shared file then.
- **Host-only sections** (Taken inbox, Gegevenswoordenboek, kompas, monitoring
  and so on) do not move. Item 5 moves sections into component files when they
  are edited.
- **Infra-board and Woo overrides** (`.pbd .v2-rail-item`, `.wood .v2-tab`)
  stay where they are.
- `pa-demo/src/index.css` (its copy of the app shell) is a separate
  duplication, not chrome.

## How

### What moves

A declaration moves when the same normalised selector, inside the same
at-rule chain, has the same property and the same resolved value on both
sides. "Resolved" means through the token environment: `var(--v2-chrome)` and
`var(--pac-chrome)` both resolve to `var(--rba-brand)`, so they match. In the
shared file it is written with the `--rba-*` token (or a new one, below), never
with a host alias, because `--v2-*` is undefined under `.pac` and the reverse.

The palette is matched by its own names: `.cwd-v2-palette*` with
`.pac-palette*` (both unscoped roots).

Declarations that differ, or exist on one side only, stay in their host file.
A selector whose declarations all moved disappears from the host file.

### New tokens

The host aliases that are not a plain `--rba-*` token get one in
`packages/shared/styles/tokens.css`, and both aliases point at it, so hosts
see the same values as before: `--rba-font-serif`, `--rba-font-sans`,
`--rba-font-mono` (today identical `--v2-serif`/`--pac-serif` etc.). Step 2
swaps in Fira Sans here, once.

**Not the accent.** Infra-board and Woo override `--v2-accent` inline on
their `.cwd-v2` root. A token on `:root` cannot follow that, so every
declaration that uses the accent (`--v2-accent`, `--v2-accent-50`,
`--v2-accent-d`) stays in the host files, and those aliases keep their
`color-mix(… var(--v2-accent) …)` definitions.

### Where it loads: once per app, first

Each app imports `@ronl/shared/styles/v2-chrome.css` itself, before any
other stylesheet that styles the chrome:

- **The frontend** at the top of `App.tsx`, above the page imports. The page
  modules bring `dashboard-v2.css`, `dashboard-infra.css` and
  `dashboard-woo.css` when they run, so all of them come after the shared
  rules, and the layers keep overriding the chrome as before.
- **pa-demo** at the top of its `App.tsx`, above `@ronl/pa-cockpit` (a
  cockpit component imports `dossierbeheer.css`) and
  `@ronl/pa-cockpit/styles.css`.

`styles.css` does **not** import it: in the frontend that copy would land
after the dashboard pages. No other file imports it either; a later copy
would override a host's own rules. A test pins both imports.

### The proof: `npm run check:css-move`

The per-file `check:css-equivalence` sees a moved rule as removed and added,
so it cannot prove this. `scripts/css-colour/check-move.mjs`, reusing
`colour.mjs` and the environment code of `check-equivalence.mjs`, compares
an **app's whole cascade** before and after:

- **Which stylesheets, in which order:** read from the import graph from the
  app's `main.tsx` (frontend, pa-demo), at the base ref and in the working
  tree, the way the browser applies them: modules depth first in statement
  order, each once, a CSS `@import` before its importer.
- **Values:** for each at-rule chain, selector and property, the winning
  declaration must have the same value, resolved per tenant environment as in
  `check-equivalence.mjs`. A colour may move by ΔE2000 ≤ 1.0, anything else
  must be equal.
- **Order:** two declarations that set a longhand in common (the same
  property, a shorthand and its longhands, crossing border sub-shorthands)
  must keep their order, when their selectors have equal specificity and can
  style the same element.
- **Which elements:** read with the TypeScript parser from the className
  attributes of the components the app loads. A class that appears in no
  string literal is dead, so another app's selectors in the shared file count
  for nothing. Each app declares its page roots that are never nested.
- It fails on any difference, and lists it.

Limits, documented in the script and in `docs/css-files.md`: inline custom
properties are not seen (hence the accent rule), a className composed across
components is not followed, ancestors are not compared.

### Tests that change

- `pa-cockpit-class-coverage.test.ts`: a class counts as styled for a host
  when the host's file **or** `v2-chrome.css` has a rule for it under that
  host's root. The expected class list is unchanged.
- `css-tokens.test.ts`: `v2-chrome.css` is scanned like the other
  stylesheets (every `var(--rba-*)` defined).
- `css-hex.test.ts` already covers `packages/shared/styles/**`.
- New checks in `css-tokens.test.ts`: the frontend's `App.tsx` imports
  `v2-chrome.css` before any page and before `styles.css`; pa-demo's `App.tsx`
  imports it before the cockpit; nothing else imports it; the shared file
  does not use `--rba-accent`.

### Docs

`docs/css-files.md`: the new file in the `packages/shared` table; the
`dashboard-v2.css` and `dashboard-pa.css` rows say the chrome moved; the
"copies that drift" finding marks item 4 done; the new script in the tools
list. Each host file's header comment says where its chrome went.

## Check

- `npm run check:css-move` reports nothing, for both hosts and every tenant.
- `npm test` and the e2e run (frontend changes) are green.
- The user looks at Caseworker V2, Infra-board, Woo, PA-Cockpit in the
  frontend, and pa-demo, for Flevoland and one other tenant: nothing moved.

## Left to the builder

- The order of rules inside `v2-chrome.css` (keep the frontend file's order
  where it can; the order check guards the rest).
- Whether the move itself is done by hand or by a throwaway script; the
  committed result and `check:css-move` are what count.
