# One shared stylesheet for the v2 chrome (#374 item 4)

Status: draft for approval, 2026-10-31.
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
see the same values as before:

- `--rba-font-serif`, `--rba-font-sans`, `--rba-font-mono` (today identical
  `--v2-serif`/`--pac-serif` etc.). Step 2 swaps in Fira Sans here, once.
- `--rba-accent-50` (`color-mix(in srgb, var(--rba-accent) 12%, white)`) and
  `--rba-accent-d` (80% with black), if a moved declaration uses them.

Any other derived alias a moved declaration needs is handled the same way.

### Where it loads: once per host, before the host files

`packages/pa-cockpit/src/styles.css` gets
`@import '@ronl/shared/styles/v2-chrome.css';` after the tokens and before
`dashboard-pa.css`. That is the only import:

- **pa-demo** loads `styles.css`, so it gets the chrome before
  `dashboard-pa.css`.
- **The frontend** loads `styles.css` in `App.tsx` at start-up, before any
  dashboard, and `dashboard-v2.css` is imported later, by the dashboard pages.
  So the shared rules precede both host files there as well.

`dashboard-v2.css` does **not** import it as well. A second copy, inlined by
the CSS import into a later chunk, would come _after_ `dashboard-pa.css` and
could beat a PA rule on an element with two classes (a shared `.pac-btn`
padding over PA's own `.pac-btn-sm` padding). One import point avoids that.

Moving the frontend's chrome rules earlier (from `dashboard-v2.css` to
`styles.css`) is safe because the stylesheets that override them,
`dashboard-infra.css`, `dashboard-woo.css` and `signing-panel.css`, load after
both, as before. Nothing that loads before `dashboard-v2.css` targets these
selectors on `.cwd-v2` elements.

### The proof: `npm run check:css-move`

The per-file `check:css-equivalence` sees a moved rule as removed and added,
so it cannot prove this. A new script, `scripts/css-colour/check-move.mjs`,
reusing `colour.mjs` and the environment code of `check-equivalence.mjs`,
compares a **host's cascade** before and after:

- A host is an ordered list of stylesheets plus the root classes it renders.
  Two hosts: `cwd-v2` = [`v2-chrome.css`, `dashboard-v2.css`] with roots
  `.cwd-v2`, `.cwd-v2-palette*`; `pac` = [`v2-chrome.css`, `dashboard-pa.css`]
  with roots `.pac`, `.pac-palette*`. At the base ref, the shared file does not
  exist and is simply empty.
- Selector lists are split; selectors of the other host's roots are dropped.
- For each at-rule chain, selector and property, the winning declaration
  (last one) must have the same value, resolved per tenant environment as in
  `check-equivalence.mjs` (no tenant, each enabled tenant). A colour may move
  by ΔE2000 ≤ 1.0, anything else must be equal.
- **Order:** for each property, the order of the selectors that declare it
  must be the same before and after. That catches a declaration that moved
  past a competing rule for another class on the same element.
- It fails on any difference, and lists it.

`--host` and `--base` are options; defaults cover these two hosts against
`acc`. Item 5 can add hosts later. The script has unit tests in the style of
`css-colour.test.ts`: a moved identical rule passes; a changed value, a
dropped declaration and a reordered competing property each fail.

### Tests that change

- `pa-cockpit-class-coverage.test.ts`: a class counts as styled for a host
  when the host's file **or** `v2-chrome.css` has a rule for it under that
  host's root. The expected class list is unchanged.
- `css-tokens.test.ts`: `v2-chrome.css` is scanned like the other
  stylesheets (every `var(--rba-*)` defined).
- `css-hex.test.ts` already covers `packages/shared/styles/**`.
- A new check in `css-tokens.test.ts` (or its own small test): `styles.css`
  imports `v2-chrome.css` before `dashboard-pa.css`, and no other stylesheet
  imports it.

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
