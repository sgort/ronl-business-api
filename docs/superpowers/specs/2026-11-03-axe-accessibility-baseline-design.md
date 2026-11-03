# Accessibility checks with axe-core in the frontend E2E suite (#409)

Status: draft for approval, 2026-11-03.
Issue: #409. Before: #405 (Flevoland step 2), which this gives a "before" picture for.

## Why

Step 2 of the Flevoland look (#405) changes focus rings, form fields and
buttons. Without an accessibility baseline taken first, there is no way to
tell whether step 2 makes things better or worse. `css-colour.test.ts` checks
contrast for token pairs only, never for rendered pages.

## What the measurement found (2026-11-03, local stack)

A throwaway spec scanned nine page types with axe-core 4.13 (tags `wcag2a`,
`wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`). No critical, moderate or minor
findings anywhere; every finding is `serious` `color-contrast`:

| Page                                                                 | Findings                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing `/`, sign-in screen, Keycloak (medewerker, prefilled, plain) | none                                                                                                                                                                                                                                     |
| Caseworker V2, Infra-board, Woo, PA-Cockpit (Flevoland)              | the ⌘K hint in the search box (`.v2-key` / `.pac-key`): `#e9eff8` on `#4779c4`, 3.78:1                                                                                                                                                   |
| Caseworker V2 (Heusden)                                              | the ⌘K hint (3.81:1); white on Heusden's accent `#7ab929` (`.v2-rail-card`, `.v2-dock-toggle`, 2.38:1); `--rba-ink-3` `#6b7280` on `--rba-bg` `#f4f5f7` (`.v2-rail-group-label`, `.v2-taken-filters-title`, `.v2-taken-refresh`, 4.43:1) |

axe also left one "needs review" item on Infra-board, Woo and Heusden.

## Decision (user, 2026-11-03)

**Record the known findings as a baseline; fix them later.** The ⌘K hint is
one rule in `packages/shared/styles/v2-chrome.css` and is fixed in #405,
which restyles the chrome anyway. The Heusden items (tenant accent behind
white text, the default muted grey) go to a follow-up issue on tenant
colours. #409 stays a measuring instrument and a clean "before" picture.

## Goals

- The frontend E2E suite scans the nine page types and fails on any
  critical or serious violation that is not in the recorded baseline.
- The baseline cannot go stale: an entry that no longer occurs fails too,
  so a fix shrinks the list (the same ratchet as `css-hex.test.ts`).
- Everything else (moderate, minor, needs review) is recorded with each run,
  not enforced.

## Non-goals

- Fixing the findings (see Decision).
- A per-pull-request gate. The E2E suite runs against the local stack or ACC
  and is started by hand; a PR gate would need component tests in jsdom,
  which cannot check contrast.
- Running public-site's existing axe tests in its ACC workflow (noted on
  #409 as a side finding, separate work).
- Paid Deque products.

## How

### Files

- `packages/frontend/e2e/accessibility.spec.ts`: one test per page type.
- `packages/frontend/e2e/helpers/a11y.ts`: the scan and the comparison.
- `packages/frontend/e2e/a11y-baseline.ts`: the known findings, per page.
- `packages/frontend/package.json`: `@axe-core/playwright` as a dev
  dependency, at the version already in the lockfile (4.13.0, used by
  public-site). Lockfile updated with `npm install --package-lock-only`, so
  `node_modules` is not touched.

### The page types

How each page is reached, as worked out in the measurement:

1. **Landing `/`**, anonymous.
2. **Sign-in screen** (`AuthCallback`, "Verbinding maken..."): set
   `selected_idp = 'medewerker'`, answer Keycloak's authorize request with
   `204` (the browser then cancels the navigation and the card stays up), go
   to `/auth` waiting only for the commit.
3. **Keycloak, medewerker variant**: `selected_idp = 'medewerker'` without a
   username hint, then `/auth`; wait for `#kc-context-banner`.
4. **Keycloak, prefilled variant**: the landing page's "Inloggen" (it hints a
   test user).
5. **Keycloak, plain variant**: no `selected_idp`, then `/auth`.
6. **Caseworker V2** (`test-caseworker-flevoland`), 7. **Infra-board**
   (`test-infra-flevoland`), 8. **Woo** (`test-woo-flevoland`), 9.
   **PA-Cockpit** (`test-pa-flevoland`): `loginAsMedewerker`, then wait for
   `.cwd-v2, .pac` and network idle.
7. **Caseworker V2, Heusden** (`test-caseworker-heusden`): the other-tenant
   check.

### The comparison

- A finding is the pair (rule id, element target) of a critical or serious
  violation, per page.
- **Fails** on a finding not in the baseline for that page, and on a
  baseline entry that no longer occurs. The failure message lists the rule,
  the element, axe's colours and ratio where it has them, and the help URL.
- **Records** the whole axe result per page as a test attachment (JSON) in
  the Playwright report: moderate, minor and needs-review included.

### The baseline

`a11y-baseline.ts` exports, per page name, a list of
`{ rule, target, reason }`. Every entry carries its reason and where it is
fixed: `#405` for the ⌘K hint, the new follow-up issue for the Heusden items.

### Follow-up issue

Filed with this work: "Heusden: contrast of white text on the tenant accent,
and of the default muted grey", with the measured colours and ratios, and the
two options (dark text on light tenant accents via `--rba-on-accent-fill`; a
darker default `--rba-ink-3`). The baseline entries point at it.

### Docs

The spec file's header explains what it checks, how to read a failure and
how to change the baseline. #409 gets a comment with the measured baseline.

## Check

- The suite runs green locally with the baseline: 46 + 10 = 56 passed, 5
  skipped (the user's usual e2e run).
- A deliberately introduced contrast failure fails the right test; removing
  a baseline entry's cause fails it as stale (checked by temporarily editing
  the baseline, not the product).

## Left to the builder

- Exact wording of messages and comments.
