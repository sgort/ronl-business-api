# Flevoland colours, step 1: token colour switch for the Flevoland tenant

Issue: #374 (research and decisions: comment 6518349858, 30 Oct 2026).

## Intent

Flevoland IT delivered `Flevoland-css/flevoland-base.css` (v0.2.0 concept, 12-10-2026): NL Design System style tokens (`--flevoland-*`), base styles for plain HTML elements, an NL DS Button mapping, and reduced-motion / forced-colours rules. Its colours and fonts come from the Flevoland intranet. The goal is a visual rebrand of our apps **for the Flevoland tenant only**, without ever showing a screen that is half Flevoland's look and half ours.

That is done in two steps. **This document covers step 1 only:** Flevoland's colours, delivered through our existing token system, with layout, fonts and sizes unchanged. Step 2 (Fira Sans, type scale, buttons, form fields, focus ring, underlined links, app by app) gets its own design after step 1 has landed.

Why tokens first: our classes override Flevoland's `:where()` element rules per property, so loading the file as it is gives our colours with Flevoland's control sizes, padding, font size and paragraph width, a half-and-half look the user rejected. Tokens change colour everywhere at once and touch no layout.

## Goals

- A Flevoland user sees Flevoland's palette in every app they reach that loads our tokens (landing, single-board and access-denied pages; Caseworker; Infra-board; Woo; PA-Cockpit; PA demo): navy text, Material greys, the `#f8f8f8` page, dark blue `#003a8e`, Flevoland's status colours, yellow accent fills.
- Every other tenant renders as before: the same computed colours wherever a token reproduces the value, and otherwise a difference below what the eye can see (ΔE2000 ≤ 1.0; see section 7).
- Within a Flevoland screen, no area is left on the old palette (in particular the Tailwind-styled Caseworker sections), apart from the exclusions listed below.
- Flevoland IT's file lives in the repo and the temporary `Flevoland-css/` folder is gone.

## Non-goals

- Fonts, type scale, spacing, control sizes, buttons, form fields, focus ring, link underlines: step 2.
- The Keycloak login theme (served by Keycloak, outside the build) and `packages/public-site` (Rijkshuisstijl).
- Data colours: chart series, the RIP phase and stage palettes, the changelog's own commit-type colours. They encode meaning, not brand. **Status colours are not data colours**: the done / at risk / overdue / waiting / not started colours in ProcessView, the Infra-board and the other surfaces follow Flevoland's status colours (decision 5).
- Changing how other tenants look.

## Anti-goals (a failure even if it technically works)

- A Flevoland screen where one section is navy / Material grey and its neighbour still Tailwind grey or `#1f2937`.
- Yellow used as text or as a thin line or small marker on white (1.6:1; fails WCAG 1.4.3 / 1.4.11).
- White text on yellow.
- Any visible change for a non-Flevoland tenant.

## Decisions taken with the user

1. Visual rebrand, Flevoland tenant only.
2. Step 1 is the colour switch through tokens (option B); step 2 the full look per app, each app switched over whole.
3. **Pink `#e70077` stays for accent text and accent lines.** Yellow `#fec612` replaces pink only where the accent is a **fill**, always with dark text on it.
4. Flevoland IT's file moves into `packages/shared/styles/`; `Flevoland-css/` is removed.
5. **Status colours follow Flevoland** everywhere on a Flevoland screen, including the ProcessView and RIP diagrams (`--pb-amber`, `--pb-grey`, `--v2-amber`, `--w-amber`, `--w-grey` and `components/process/status.ts` where it carries status). One set of status colours per screen. Only true data series stay as they are.
6. **The landing page `/` shows Flevoland's palette** to every visitor who is not logged in, because it is Flevoland's board catalogue and Flevoland is the default tenant (it already shows Flevoland blue and pink today). The single-board pages (`/heusden` and so on) keep their own tenant.

## The current state (at 664f775)

- `packages/shared/styles/tokens.css` defines `--rba-*`: fixed Flevoland colours (`--rba-flevoland-blue #0046ad`, `-blue-d #033b8e`, `-pink #e70077`), themed brand (`--rba-brand`, `--rba-brand-d`, `--rba-accent`, chained to `--color-primary`, `--color-primary-dark`, `--color-secondary`), neutrals (`--rba-ink` … `--rba-ink-4`, `--rba-ink-inverse`, `--rba-rule`, `--rba-rule-2`, `--rba-bg`, `--rba-paper`) and status (`--rba-ok`, `--rba-warn`, `--rba-bad`, `--rba-idle`). Each surface's own variables (`--v2-*`, `--pac-*`, `--pb-*`, `--w-*`, the landing pages') point at them. Loaded by `packages/frontend/src/App.tsx` and by `@ronl/pa-cockpit`'s `styles.css` (and so pa-demo). `css-tokens.test.ts` checks both hosts and that every `var(--rba-*)` used is defined.
- `applyTenantTheme()` (`packages/frontend/src/services/tenant.ts`) sets `--color-primary`, `-primary-dark`, `-primary-light`, `--color-secondary`, `--color-accent` and optionally `--color-background` on `<html>` from `public/tenants.json`. Flevoland is the default tenant. pa-demo has its own shim (`packages/pa-demo/src/demo/shims/tenant.ts`) with a Flevoland literal. Nothing marks _which_ tenant is active, so neutrals and status cannot vary per tenant today.
- `tenants.json` Flevoland: primary `#0046ad`, primaryDark `#134F7D`, primaryLight `#4A8FC0`, secondary `#e70077`, accent `#F5A623`.
- `packages/frontend/tailwind.config.js` maps only `primary`, `primary-dark`, `primary-light`, `secondary`, `accent` (and the `dutch-*` aliases) to CSS variables. The Tailwind palette scales are Tailwind's own. There are 899 Tailwind colour classes in `packages/frontend/src` (618 `gray`, 113 `red`, 67 `blue`, 58 `green`, 15 `amber`, 9 `orange`, a few `yellow`, `slate`, `pink`, `indigo`); 481 are in `components/CaseworkerDashboard/`, the older sections the current Caseworker dashboard still renders. No opacity modifiers (`/50`) are used on these scales.
- Hard-coded colours outside the tokens: 369 hex values in stylesheets (stylelint `color-no-hex`; largest `dashboard-pa.css` 204, `login-portal.css` 32, `dashboard-v2.css` 17, `dashboard-infra.css` 16, `regelsimulatie.css` 16) and 166 in TS/TSX (25 files, mostly data colours).
- The accent (`--rba-accent` → `--v2-accent`, `--pac-accent`, `--color-secondary`) is used in about 130 stylesheet declarations: 48 as `color`, 53 as a line or marker (`border*`, `outline`, `box-shadow`, `stroke`), 29 as `background`, 1 `accent-color`.

## Design

### 1. Flevoland IT's file in the repo

Split the file into two under `packages/shared/styles/flevoland/`:

- `tokens.css`: section 1 (the `:root` block of `--flevoland-*` tokens), verbatim, with the file's header (version, date, sources, accessibility deviations). Loaded in step 1. Defining `--flevoland-*` on `:root` changes nothing visible by itself.
- `base.css`: the `@font-face` rules and sections 2, 3 and 4, verbatim, with a short header stating it is **not loaded** until step 2, which switches apps over one at a time. Kept so step 2 starts from Flevoland IT's text.

Both files keep Flevoland IT's version and date, so a later delivery can be diffed against them. Delete `Flevoland-css/`.

Stylelint: add both files to `HEX_ALLOWED` (palette and vendor text), and exempt `base.css` from `declaration-no-important` (its reduced-motion block needs it). `docs/css-files.md` lists both. The `@ronl/shared` package must ship the new directory the way it ships `styles/tokens.css`.

### 2. The tenant marker

`applyTenantTheme()` also sets `data-tenant="<id>"` on `<html>` (it receives the theme today; it needs the tenant id too, so its callers pass it). Switching tenant replaces the attribute; a page with no tenant theme has none. pa-demo's tenant shim sets `data-tenant="flevoland"` the same way.

All Flevoland overrides hang off one selector: `:root[data-tenant="flevoland"]`. Nothing else in the codebase may branch on the tenant id for colour.

### 3. Token mapping for Flevoland

In `packages/shared/styles/tokens.css`, a block `:root[data-tenant="flevoland"] { … }` points our tokens at Flevoland's semantic tokens (never at their palette tokens, per their file's rule):

| Our token                | Flevoland value                                          | Resolves to |
| ------------------------ | -------------------------------------------------------- | ----------- |
| `--rba-flevoland-blue-d` | `--flevoland-color-brand-primary-active`                 | `#003a8e`   |
| `--rba-ink`              | `--flevoland-color-text-default`                         | `#0c1c47`   |
| `--rba-ink-2`            | `--flevoland-color-text-heading`                         | `#424242`   |
| `--rba-ink-3`            | `--flevoland-color-text-subtle`                          | `#616161`   |
| `--rba-ink-4`            | `--flevoland-color-text-disabled`                        | `#757575`   |
| `--rba-rule`             | `--flevoland-color-border-subtle`                        | `#e0e0e0`   |
| `--rba-rule-2`           | `--flevoland-color-background-muted`                     | `#eeeeee`   |
| `--rba-bg`               | `--flevoland-color-background-document`                  | `#f8f8f8`   |
| `--rba-paper`            | `--flevoland-color-background-surface`                   | `#ffffff`   |
| `--rba-ok`               | `--flevoland-color-status-success-text`                  | `#207815`   |
| `--rba-bad`              | `--flevoland-color-status-error-text`                    | `#c62100`   |
| `--rba-warn`             | see below                                                |             |
| `--rba-idle`             | `--flevoland-color-neutral-400` via a new semantic alias | `#bdbdbd`   |

`--rba-flevoland-blue` and `--rba-flevoland-pink` keep their values (identical to Flevoland's blue; pink stays by decision 3). `--rba-brand` already resolves to `#0046ad` for Flevoland.

**Warn splits into two roles** (my call). Today `--rba-warn` (`#e5b700`) serves as fill, dot, thin border and legend swatch; its surface aliases (`--pb-amber`, `--v2-amber`, `--w-amber`) widen that use. Yellow fails 3:1 as a small marker, and so does Flevoland's warning border `#d3ba8e`, so:

- `--rba-warn` is the **text and marker** role: dots (`.lcp .wdot.geel`, `.cwp-st.gateway .cwp-st-dot`), legend swatches, thin borders, text. Flevoland: `--flevoland-color-status-warning-text` (brown `#85531a`, 6.6:1 on white).
- New `--rba-warn-fill` is the **fill** role: bars, badges, areas with text on them. Default `var(--rba-warn)` (so other tenants are unchanged); Flevoland: `--flevoland-color-brand-accent` (yellow), with `--rba-on-accent-fill` text where text sits on it.

The builder classifies each use of `--rba-warn` and of its surface aliases into one of the two roles. The same marker-versus-fill reasoning applies to `--rba-idle` and the grey aliases: a grey that marks state at 3:1 or more stays meaningful; one below 3:1 is a disabled or inactive look (see the contrast test).

### 4. The accent split

Two new tokens in `tokens.css`, for every tenant:

- `--rba-accent-fill`: the accent as a filled area. Default `var(--rba-accent)`.
- `--rba-on-accent-fill`: text on that fill. Default `var(--rba-ink-inverse)`.

For Flevoland: `--rba-accent-fill: var(--flevoland-color-brand-accent)` (yellow) and `--rba-on-accent-fill: var(--flevoland-color-text-on-accent)` (`#212121`). `--rba-accent` itself stays pink for Flevoland: text, lines, outlines and markers keep pink.

Every accent `background` is classified:

- **A fill that carries text or is a surface** (tags, badges, tab or chip backgrounds, the "in progress" label): switch to `--rba-accent-fill`, and set its text to `--rba-on-accent-fill`.
- **A small marker without text** (a status dot, a thin bar, a progress line): keep `--rba-accent` (pink). Yellow would fail 3:1 there.

Surface variables follow the same split (`--v2-accent-fill`, `--pac-accent-fill` where the surface has its own layer). The tinted accent backgrounds written as hex (for example `#fce7f0`, a pink tint) are listed and, for Flevoland, follow the fill or the line role they belong to.

Other tenants: `--rba-accent-fill` = `--rba-accent` and `--rba-on-accent-fill` = today's text colour, so nothing changes for them.

### 5. tenants.json

Flevoland: `primaryDark` `#134F7D` → `#003a8e` (one dark blue everywhere), `accent` `#F5A623` → `#fec612`. `secondary` stays `#e70077`; `primary` stays `#0046ad`. `primaryLight` stays unless the builder finds it used as text or a line on white below 3:1; then report it rather than change it. The pa-demo shim's Flevoland literal follows the same values (it states it mirrors `tenants.json`).

### 6. Tailwind

In `tailwind.config.js`, the scales used in our code (`gray`, `red`, `green`, `blue`, `amber`, `orange`, `yellow`, `slate`, `pink`, `indigo`) point at CSS variables whose defaults are Tailwind's own values, so every other tenant renders identically. The variables are defined in one generated or hand-written stylesheet loaded by the frontend. Under `:root[data-tenant="flevoland"]`:

- `gray` and `slate` map onto Flevoland's neutrals (Material greys, navy for the darkest text steps) by role: 50–100 backgrounds, 200–300 lines, 400–500 disabled or decorative, 600–900 text.
- `red`, `green`, `amber`/`orange`, `blue` map onto Flevoland's status error, success, warning and info colours (their `-50` backgrounds, `-300` decorative borders, text colours).
- `blue` used for interactive elements maps onto the Flevoland brand blue. If `blue` turns out to serve both info and interactive roles, report which classes go where.
- `pink`, `indigo`, `yellow`: leave on Tailwind's values unless used as text or lines in a way that collides; report.

The CSS-variable form must keep Tailwind's colour features that the code uses working; there are no opacity modifiers on these scales today, so a plain `var()` is enough unless the builder finds otherwise.

### 7. Hard-coded colours

Step 1 converts the hex values that would otherwise leave a Flevoland screen on the old palette:

- **neutrals** (text greys, line greys, page and card backgrounds) → the matching `--rba-*` token;
- **brand and accent tints** (blue, dark blue, pink tints) → a token or `color-mix(in srgb, var(--rba-…) N%, transparent)`, the method #374 3b already planned;
- **status tints** (the green, amber and red background, border and text families, e.g. `#166534`, `#f3dca0`, `#fef2f2`) → `color-mix()` of the status tokens, or a status token directly. In scope because status follows Flevoland (decision 5); left alone they would be the half palette the anti-goals forbid.

Out of step 1, and listed in the PR as such: data colours (charts, phase and stage palettes, changelog type colours), the Keycloak theme, public-site.

**Equivalence for other tenants** (my call). #374 3a already replaced every hex value that matched a token exactly, so most remaining values have no exact token. Rather than add a value token per hex, a converted declaration may differ for other tenants by at most ΔE2000 1.0 (not visible); where `color-mix()` cannot get within that, the builder adds a named token for the value (default the old hex, Flevoland a semantic token). Flevoland's change comes only from the token.

**The equivalence check is a deliverable** (my call): the 3a check was a one-off manual comparison and is not in the repo. PR 1 adds a script that, for each stylesheet, resolves every colour declaration with no `data-tenant` set (tokens, `color-mix()`, fallbacks), before and after a change, and fails on a ΔE2000 above 1.0. Each later PR runs it against `acc`. The 3b list (16 `var(--color-primary|--v2-chrome, #0046ad)` fallbacks, alpha hex, the dead `.pb-tweaks` block in `dashboard-infra.css`) is folded in; Q1–Q5 of 3b are settled by this design (for Flevoland, "themed" means Flevoland's tokens).

### 8. Tests and checks

- `css-tokens.test.ts`: the new tokens (`--rba-accent-fill`, `--rba-on-accent-fill`, any `--rba-warn-fill`) in `EXPECTED_TOKENS`; every `var(--flevoland-*)` used is defined in `flevoland/tokens.css`; both hosts load it.
- A test that the Flevoland block points only at `--flevoland-color-*` semantic tokens, never palette tokens (Flevoland IT's rule).
- A contrast test over the Flevoland mapping: text tokens (`--rba-ink` to `--rba-ink-3`, `--rba-ok`, `--rba-bad`, `--rba-warn`) on `--rba-paper` and `--rba-bg` at least 4.5:1; marker tokens (`--rba-accent`, `--rba-brand`, the status tokens) at least 3:1; `--rba-on-accent-fill` on `--rba-accent-fill` and on `--rba-warn-fill` at least 4.5:1. **Exempt, with the reason in the test** (my call): `--rba-rule`, `--rba-rule-2` (decorative separators; WCAG 1.4.11 does not require 3:1 for lines that carry no meaning on their own), `--rba-idle` (inactive state, exempt under 1.4.11), and `--rba-ink-4` on `--rba-bg` (Flevoland's disabled text, 4.6:1 on paper but 4.3:1 on `#f8f8f8`; disabled text is exempt under 1.4.3). The builder lists the `--rba-ink-4` uses; any that are live text on `--rba-bg` move to `--rba-ink-3`.
- `tenant.ts`: `applyTenantTheme` sets and replaces `data-tenant`.
- A Tailwind test: the generated defaults equal Tailwind's palette (so other tenants are unchanged).
- Stylelint baseline goes down; record the new numbers in `docs/css-files.md` and #374.
- The equivalence check for non-Flevoland tenants (section 7).
- Unit tests and e2e run by the user; a browser check by the user on Flevoland and on one other tenant (for example Heusden) per app.

## Delivery

Suggested split, each PR independently safe for other tenants:

1. The files in `packages/shared/styles/flevoland/`, the tenant marker, the Flevoland token block, the accent and warn split, and the equivalence-check script (no Tailwind, no hex conversion yet).
2. Tailwind remap.
3. Hex conversion per stylesheet (may be more than one PR; `dashboard-pa.css` alone has 204).
4. Switch on: the tenant marker starts setting `data-tenant`.

**Gated until the last PR** (my call), so no release can carry the mixed look. PRs 1–3 add the marker code with the attribute switched off (one constant in `tenant.ts`, and the pa-demo shim follows it); tests set the attribute themselves. PR 4 flips it, and the user's browser check on Flevoland and one other tenant happens there. PRs 1–3 are therefore invisible for every tenant, and the equivalence check proves it.

**First paint** (my call). On dashboards the theme arrives once the user's municipality is known, so the first paint can be the default palette. Step 1 does not change that timing. The builder checks whether a visible flash appears on a Flevoland dashboard in PR 4 and reports it; fixing it, if needed, is a follow-up.

## Left to the builder

- The exact role classification of each accent and warn usage (section 3, 4), within the rules given.
- The Tailwind variable naming and how the default values are produced.
- The order of stylesheets in the hex conversion.
- How the `@ronl/shared` package exposes the new directory.
