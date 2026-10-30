# Flevoland colours, step 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For the Flevoland tenant only, switch every app that loads our tokens to Flevoland IT's palette, with no visible change for any other tenant and no half-converted screen ever released.

**Architecture:** Flevoland IT's file is split into `packages/shared/styles/flevoland/tokens.css` (loaded) and `base.css` (kept, not loaded). One selector, `:root[data-tenant="flevoland"]`, repoints our `--rba-*` tokens and new Tailwind scale variables at Flevoland's semantic tokens. `applyTenantTheme` writes `data-tenant`, behind a constant that stays `false` until the last PR. A dependency-free equivalence script proves each PR leaves other tenants unchanged.

**Tech Stack:** CSS custom properties, Tailwind 3.4, Vite, React/TS, Vitest 4, stylelint 17, postcss + postcss-value-parser (already in the root `node_modules`), Node ESM scripts.

**Spec:** `docs/superpowers/specs/2026-10-30-flevoland-colours-step1-design.md`

## Global Constraints

- Flevoland tenant only; every other tenant renders the same: identical computed colour where a token reproduces it, otherwise ΔE2000 ≤ 1.0 (spec §7).
- Pink `#e70077` stays for accent text and lines; yellow `#fec612` only as a fill, always with `#212121` text (`--flevoland-color-text-on-accent`). Never white text on yellow, never yellow as text or a thin line or small marker.
- Status colours follow Flevoland, including ProcessView and RIP; true data series (charts, phase and stage palettes, changelog type colours) do not.
- All Flevoland colour overrides use the selector `:root[data-tenant="flevoland"]`; nothing else branches on the tenant id for colour.
- The Flevoland block in `packages/shared/styles/tokens.css` points only at `--flevoland-color-*` **semantic** tokens (single listed exception: `--rba-idle` → `--flevoland-color-neutral-400`; Flevoland's file has no semantic inactive token).
- Flevoland IT's text is copied verbatim; keep their version (v0.2.0) and date (12-10-2026) in both file headers.
- Out of scope: fonts, sizes, spacing, buttons, form fields, focus ring, link underlines (step 2); the Keycloak theme (#400); `packages/public-site`.
- Repo rules: ask before every `git commit`; no attribution lines; never `--no-verify`; never run prettier on CSS; never run `npm ci`, dev servers or a self-driven browser; the user runs `npm test` and e2e per PR.

## Review Focus

1. **Switching tenant in one session** (`/heusden`, then `/`; or a Flevoland user after a Heusden user on one tab): `data-tenant` must be replaced, and removed when a theme comes without an id. Pinned in Task 3.
2. **Text that inherits its colour onto a yellow fill**: a rule that switches its background to `--rba-accent-fill` but sets no `color` inherits white from its parent. Pinned in Task 5 (every accent-fill rule declares `color: var(--rba-on-accent-fill)`).
3. **Hover, focus and `.is-active` variants** of accent fills, often in a separate rule from the base state. Pinned in Task 5 (the guard scans every selector, not only base classes).
4. **Fixed Flevoland hex converted to a themed token** (`#0046ad` → `--rba-brand`) recolours Heusden and the others. Pinned by the equivalence check's per-tenant environments (Task 2 test `themed token in place of a fixed hex fails for another tenant`).
5. **pa-demo drifting from the frontend**: the offline demo's shim has its own marker constant and Flevoland literal. Pinned in Task 3 and Task 4 (cross-check tests).

---

## PR 1 — files, marker, token block, accent and warn split, equivalence check

Branch: `feat/flevoland-colours` (exists; holds the uncommitted spec and this plan).

### Task 1: Flevoland IT's file in `packages/shared`

**Files:**

- Create: `packages/shared/styles/flevoland/tokens.css`, `packages/shared/styles/flevoland/base.css`
- Delete: `Flevoland-css/` (untracked: `rm -r`)
- Modify: `packages/shared/styles/tokens.css` (first line after the header comment), `stylelint.config.mjs`, `packages/frontend/src/css-tokens.test.ts`, `docs/css-files.md`

**Interfaces:**

- Produces: `--flevoland-*` custom properties on `:root` in both hosts (via `@import './flevoland/tokens.css';` at the top of `tokens.css`); `FLEVOLAND_TOKENS_CSS` path constant in `css-tokens.test.ts`.

- [ ] **Step 1: Write the failing tests** in `css-tokens.test.ts`, in a new `describe('Flevoland tokens')`:
  - `the shared token file imports Flevoland's tokens first`: `stripComments(tokensCss)` matches `/^@import '\.\/flevoland\/tokens\.css';$/m` and that line comes before the first `:root`.
  - `Flevoland's token file defines only --flevoland-* on :root`: every custom property defined in `flevoland/tokens.css` starts `--flevoland-`; count > 100; the file has exactly one rule and its selector is `:root`.
  - `Flevoland's base styles are kept but loaded by nobody`: `flevoland/base.css` exists; no `.css`/`.tsx`/`.ts` file under `CSS_ROOTS` or `packages/shared/styles` references `flevoland/base.css` (besides comments).
  - `every var(--flevoland-*) a stylesheet uses is defined`: same shape as the existing `--rba-*` test, over `CSS_ROOTS` plus `packages/shared/styles/tokens.css`. (Finding zero uses is allowed in this task; Task 4 raises the floor.)
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- css-tokens` — Expected: the four new tests FAIL (files missing).
- [ ] **Step 3: Split the file.** `flevoland/tokens.css` = lines 1–76 of `Flevoland-css/flevoland-base.css` (header, sections 0, 0a, 0b) + section 1 (the `:root { … }` block, lines 133–385), verbatim, preceded by a 4-line comment: copied from Flevoland IT's v0.2.0 delivery, loaded through `tokens.css`, do not edit by hand, diff a new delivery against it. `flevoland/base.css` = the header, section 0c with the `@font-face` rules (lines 77–131) and sections 2–4 (lines 388–end), verbatim, preceded by a comment: **not loaded**; step 2 of #374 switches apps over to it one at a time. Then `rm -r Flevoland-css`.
- [ ] **Step 4: Wire it.** Add `@import './flevoland/tokens.css';` to `tokens.css` after its header comment and extend that comment (who imports what). In `stylelint.config.mjs` add both files to `HEX_ALLOWED` with the reason "Flevoland IT's delivery, kept verbatim", and add an override `{ files: ["packages/shared/styles/flevoland/base.css"], rules: { "declaration-no-important": null } }` with the reason "its reduced-motion block". Update the header comment of `ROOTS` (shared Flevoland files are global like `tokens.css`). In `docs/css-files.md` add both files to the `packages/shared` table (lines, `:root` / global, function) and bump the file count in the intro.
- [ ] **Step 5: Run** `npm test --workspace=@ronl/frontend -- css-tokens` and `npm run lint:css:summary` — Expected: tests PASS; summary shows no warnings for the two Flevoland files and the same total for every other file as before.
- [ ] **Step 6: Stage** `packages/shared/styles stylelint.config.mjs packages/frontend/src/css-tokens.test.ts docs/css-files.md` and **ask the user** before committing `feat(css): Flevoland IT's base stylesheet in packages/shared (#374)`.

### Task 2: Colour maths and the equivalence check

**Files:**

- Create: `scripts/css-colour/colour.mjs`, `scripts/css-colour/check-equivalence.mjs`
- Test: `packages/frontend/src/css-colour.test.ts` (Vitest, so CI runs it)
- Modify: root `package.json` (script `check:css-equivalence`), `docs/css-files.md` (how to run it)

**Interfaces:**

- Produces, from `colour.mjs` (all pure, no dependencies):
  - `type Rgba = { r: number; g: number; b: number; a: number }` (r,g,b 0–255, a 0–1), JSDoc-typed
  - `parseColour(text: string): Rgba | null` — `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (comma and space syntax), `transparent`, `white`, `black`
  - `mixSrgb(c1: Rgba, p1: number | null, c2: Rgba, p2: number | null): Rgba` — CSS Color 5 `color-mix(in srgb, …)`: percentage normalisation (missing one = 100 − other; both missing = 50/50; sum < 100 scales alpha), premultiplied alpha
  - `contrastRatio(fg: Rgba, bg: Rgba): number` — WCAG 2.x relative luminance; `fg` composited over `bg` when `fg.a < 1`
  - `deltaE2000(c1: Rgba, c2: Rgba): number` — CIEDE2000 on sRGB→Lab (D65)
  - `resolveValue(value: string, env: Map<string, string>): { colours: Rgba[]; rest: string } | null` — substitutes `var(--x, fallback)` recursively (depth 20, `null` on a cycle or an unresolved var without fallback), evaluates `color-mix(in srgb, …)`, returns the colours in order and the value text with each colour replaced by `<c>`
- Produces, from `check-equivalence.mjs`:
  - `collectEnv(cssTexts: string[], tenantTheme: Record<string, string> | null): Map<string, string>` — every custom property declared in the given stylesheets, skipping rules whose selector contains `[data-tenant`; last declaration wins; then `--color-primary`, `-primary-dark`, `-primary-light`, `--color-secondary`, `--color-accent` (and `--color-background` when present) from `tenantTheme`
  - `compareStylesheets({ before, after, envsBefore, envsAfter }): Finding[]` where `Finding = { selector: string; prop: string; env: string; kind: 'changed' | 'added' | 'removed' | 'unresolved'; detail: string }` — declarations matched by selector + property + occurrence within the rule; a declaration is equal when `rest` is identical and every colour pair has ΔE2000 ≤ 1.0 and |Δalpha| ≤ 0.01; non-colour declarations must be textually identical
  - CLI: `node scripts/css-colour/check-equivalence.mjs [--base <ref>] [files…]` — default base `acc`, default files = every `.css` under `packages/frontend/src`, `packages/pa-cockpit/src`, `packages/pa-demo/src`, `packages/shared/styles` changed since base (`git diff --name-only <base> -- '*.css'`). "Before" texts come from `git show <base>:<path>`. Environments: one with no tenant theme, one per enabled tenant in `packages/frontend/public/tenants.json` **except `flevoland`**. Each side's env is built from its own `tokens.css` + `flevoland/tokens.css` + the file itself. Prints one line per finding and a per-file count; exits 1 on any finding, 0 otherwise.

- [ ] **Step 1: Write the failing tests** in `css-colour.test.ts` (import from `'../../../scripts/css-colour/colour.mjs'` and `…/check-equivalence.mjs`):
  - `parseColour`: `#0046ad` → `{0,70,173,1}`; `#0046ad1a` → a ≈ 0.102; `#fff` → white; `rgba(0, 70, 173, .5)` and `rgb(0 70 173 / 50%)` → a = 0.5; `transparent` → a = 0; `banana` → null.
  - `mixSrgb`: `color-mix(in srgb, #0046ad 10%, transparent)` → `{0,70,173,0.1}`; `#000 50%, #fff` → `{128,128,128,1}` (±1); `#ff0000 30%, #0000ff 30%` → alpha 0.6.
  - `contrastRatio`: `#fec612` on `#ffffff` ≈ 1.6 (±0.05); `#212121` on `#fec612` ≥ 10.0; `#757575` on `#ffffff` ≈ 4.6; `#757575` on `#f8f8f8` ≈ 4.3; `#ffffff` on `#ffffff` = 1.
  - `deltaE2000`: identical colours → 0; the Sharma et al. 2005 test pair `Lab(50, 2.6772, -79.7751)` vs `Lab(50, 0, -82.7485)` → 2.0425 (±0.0001; expose an internal `deltaE2000Lab` for this or test through a helper).
  - `resolveValue`: `1px solid var(--a)` with `--a: var(--b, #e5e7eb)` and no `--b` → colours `[#e5e7eb]`, rest `1px solid <c>`; a cycle `--a: var(--a)` → null.
  - `compareStylesheets`:
    - `a hex replaced by a token with the same value passes` (`.x{color:#1f2937}` → `.x{color:var(--rba-ink)}`, env `--rba-ink:#1f2937`) → `[]`.
    - `a colour beyond ΔE 1.0 fails` (`#1f2937` → `#0c1c47`) → one `changed`.
    - `a colour within ΔE 1.0 passes` (`#1f2937` → `#202937`) → `[]`.
    - `themed token in place of a fixed hex fails for another tenant`: before `.x{color:#0046ad}`, after `.x{color:var(--rba-brand)}`, env with `--rba-brand: var(--color-primary, #0046ad)` and a Heusden-like theme `primary:#00689d` → one `changed` for that env, none for the no-tenant env.
    - `rules under [data-tenant] are ignored for the env`: a `:root[data-tenant="flevoland"]{--rba-ink:#0c1c47}` block in "after" does not change the result.
    - `an added declaration is reported` → kind `added`.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- css-colour` — Expected: FAIL, modules not found.
- [ ] **Step 3: Implement `colour.mjs`** to the signatures above (header comment: why no dependency — keeps the lockfile out of this change, and the maths is short).
- [ ] **Step 4: Implement `check-equivalence.mjs`** with postcss (`postcss.parse`) and postcss-value-parser; `main()` runs only when the file is the entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`). Add `"check:css-equivalence": "node scripts/css-colour/check-equivalence.mjs"` to the root `package.json`.
- [ ] **Step 5: Run** the test file — Expected: PASS. Then run `npm run check:css-equivalence -- --base acc` — Expected: `0 findings` (only `tokens.css` changed, by an `@import`).
- [ ] **Step 6: Stage** and **ask** before committing `feat(css): a colour equivalence check for other tenants (#374)`.

### Task 3: The tenant marker, switched off

**Files:**

- Modify: `packages/frontend/src/services/tenant.ts:164-200`, `packages/frontend/src/pages/LoginChoice.tsx:70-78`, `packages/pa-demo/src/demo/shims/tenant.ts`
- Test: `packages/frontend/src/services/tenant.test.ts`, `packages/pa-demo/src/demo/shims/tenant.test.ts` (exists: it already cross-checks `FLEVOLAND_THEME`; extend it)

**Interfaces:**

- Produces:
  - `export const TENANT_MARKER_ENABLED = false;` in `services/tenant.ts`, with a comment: flipped in PR 4 of #374 step 1, so no release shows the half-converted palette.
  - `export function applyTenantTheme(theme: TenantTheme, tenantId?: string, markerEnabled = TENANT_MARKER_ENABLED): void` — when `markerEnabled` and `tenantId` is given, `document.documentElement.dataset.tenant = tenantId`; otherwise `delete document.documentElement.dataset.tenant` (also when disabled, so a stale attribute never survives).
  - `initializeTenantTheme` passes `config.id`; `LoginChoice` passes `resolution.tenant?.id`.
  - pa-demo shim: `export const TENANT_MARKER_ENABLED = false;` and `initializeTenantTheme` sets `data-tenant="flevoland"` only when it is true.

- [ ] **Step 1: Write the failing tests** in `tenant.test.ts` (`describe('applyTenantTheme')`; reset `document.documentElement.dataset` in `afterEach`):
  - `sets data-tenant when the marker is enabled` → `applyTenantTheme(utrechtConfig.theme, 'utrecht', true)` → `dataset.tenant === 'utrecht'`.
  - `replaces data-tenant on a switch` → `'utrecht'` then `'flevoland'` → `'flevoland'`.
  - `removes data-tenant when a theme comes without an id` → `'utrecht'`, then `applyTenantTheme(theme, undefined, true)` → `undefined`.
  - `sets no data-tenant while the marker is off` → `applyTenantTheme(theme, 'utrecht')` → `undefined`, and `TENANT_MARKER_ENABLED === false`.
  - `initializeTenantTheme sets no data-tenant while the marker is off` → after `initializeTenantTheme('utrecht')` (with the file's existing tenants mock), `dataset.tenant` is `undefined`. The id pass-through itself is pinned by Task 9, once the marker is on.
  - `LoginChoice passes the tenant id`: in `pages/LoginChoice.test.tsx`, render `/heusden` with the existing mocks and `vi.mock` of `applyTenantTheme` that records its arguments → called with `(heusdenTheme, 'heusden')`.
    In the pa-demo shim test: `the shim's marker switch matches the frontend's` — read `packages/frontend/src/services/tenant.ts` as text, extract `TENANT_MARKER_ENABLED = (true|false)`, compare with the shim's export.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- tenant` and `npm test --workspace=@ronl/pa-demo -- tenant` — Expected: FAIL (`TENANT_MARKER_ENABLED` not exported, attribute never set).
- [ ] **Step 3: Implement** the three interface items above.
- [ ] **Step 4: Run** both — Expected: PASS. Run `npm run type-check --workspace=@ronl/frontend` — Expected: no errors.
- [ ] **Step 5: Stage** and **ask** before committing `feat(tenant): mark the active tenant on <html>, switched off for now (#374)`.

### Task 4: The Flevoland token block, new tokens, tenants.json

**Files:**

- Modify: `packages/shared/styles/tokens.css`, `packages/frontend/public/tenants.json` (flevoland `theme`), `packages/pa-demo/src/demo/shims/tenant.ts` (`FLEVOLAND_THEME`), `packages/frontend/src/css-tokens.test.ts`, `docs/css-files.md`
- Test: `packages/frontend/src/css-tokens.test.ts`, `packages/frontend/src/css-colour.test.ts`

**Interfaces:**

- Consumes: `resolveValue`, `contrastRatio`, `parseColour` (Task 2); `--flevoland-*` (Task 1).
- Produces, in `tokens.css` `:root` (all tenants):
  - `--rba-accent-fill: var(--rba-accent);`
  - `--rba-on-accent-fill: var(--rba-ink-inverse);`
  - `--rba-warn-fill: var(--rba-warn);`
- Produces, a block `:root[data-tenant="flevoland"] { … }` at the end of `tokens.css`, exactly:

  | Token                    | Value                                                                         |
  | ------------------------ | ----------------------------------------------------------------------------- |
  | `--rba-flevoland-blue-d` | `var(--flevoland-color-brand-primary-active)`                                 |
  | `--rba-ink`              | `var(--flevoland-color-text-default)`                                         |
  | `--rba-ink-2`            | `var(--flevoland-color-text-heading)`                                         |
  | `--rba-ink-3`            | `var(--flevoland-color-text-subtle)`                                          |
  | `--rba-ink-4`            | `var(--flevoland-color-text-disabled)`                                        |
  | `--rba-rule`             | `var(--flevoland-color-border-subtle)`                                        |
  | `--rba-rule-2`           | `var(--flevoland-color-background-muted)`                                     |
  | `--rba-bg`               | `var(--flevoland-color-background-document)`                                  |
  | `--rba-paper`            | `var(--flevoland-color-background-surface)`                                   |
  | `--rba-ok`               | `var(--flevoland-color-status-success-text)`                                  |
  | `--rba-bad`              | `var(--flevoland-color-status-error-text)`                                    |
  | `--rba-warn`             | `var(--flevoland-color-status-warning-text)`                                  |
  | `--rba-warn-fill`        | `var(--flevoland-color-brand-accent)`                                         |
  | `--rba-idle`             | `var(--flevoland-color-neutral-400)` (the one palette exception; comment why) |
  | `--rba-accent-fill`      | `var(--flevoland-color-brand-accent)`                                         |
  | `--rba-on-accent-fill`   | `var(--flevoland-color-text-on-accent)`                                       |

- tenants.json flevoland: `primaryDark` `#134F7D` → `#003a8e`, `accent` `#F5A623` → `#fec612`; the shim literal follows (its existing cross-check test enforces it). `primaryLight` (`#4A8FC0`) stays; `grep -rn "primary-light" packages/*/src` and list in the PR any use as text (which would need 4.5:1) — report, do not change.

- [ ] **Step 1: Write the failing tests** in `css-tokens.test.ts`:
  - Add `--rba-accent-fill`, `--rba-on-accent-fill`, `--rba-warn-fill` to `EXPECTED_TOKENS`.
  - `definedTokens` must now only read the plain `:root` rule for "defines every token once"; add `flevolandOverrides(css): Map<string, string>` that reads the `:root[data-tenant="flevoland"]` rule.
  - `the Flevoland block overrides only defined tokens` → every key is in `EXPECTED_TOKENS`.
  - `the Flevoland block points only at Flevoland's semantic tokens` → every value is `var(--flevoland-color-<name>)` where `<name>` does not match `/^(blue|yellow|neutral|red|green|orange|cyan|purple)-\d+$/`, except `{ '--rba-idle': 'var(--flevoland-color-neutral-400)' }`.
  - `the Flevoland block is the only [data-tenant] rule in our stylesheets` → across `CSS_ROOTS` + `packages/shared/styles` (excluding `flevoland/`), every selector containing `data-tenant` is exactly `:root[data-tenant="flevoland"]`.
  - Raise the floor in Task 1's `--flevoland-*` usage test to `> 10`.
    In `css-colour.test.ts`, `describe('Flevoland contrast')` — a test helper `flevolandEnv(): Map<string, string>` starts from `collectEnv([flevolandTokensCss, tokensCss], flevolandTheme)` (`flevolandTheme` = the flevoland entry of `tenants.json`) and then applies the declarations of the `:root[data-tenant="flevoland"]` rule on top (`collectEnv` skips them by design). Then:
  - text tokens `--rba-ink`, `--rba-ink-2`, `--rba-ink-3`, `--rba-ok`, `--rba-bad`, `--rba-warn` on `--rba-paper` and on `--rba-bg` ≥ 4.5;
  - marker tokens `--rba-accent`, `--rba-brand`, `--rba-brand-d`, `--rba-ok`, `--rba-bad`, `--rba-warn` on `--rba-paper` ≥ 3;
  - `--rba-on-accent-fill` on `--rba-accent-fill` and on `--rba-warn-fill` ≥ 4.5;
  - `--rba-ink-4` on `--rba-paper` ≥ 4.5;
  - an `EXEMPT` table in the test with reasons: `--rba-rule`, `--rba-rule-2` (decorative separators, WCAG 1.4.11 does not apply to lines that carry no meaning alone), `--rba-idle` (inactive state, exempt under 1.4.11), `--rba-ink-4` on `--rba-bg` (disabled text, exempt under 1.4.3; 4.3:1). A test asserts every token in `EXPECTED_TOKENS` is either checked or in `EXEMPT` (so a new token cannot slip through).
  - `the resolved Flevoland values` → `--rba-ink` `#0c1c47`, `--rba-bg` `#f8f8f8`, `--rba-brand-d` `#003a8e`, `--rba-accent` `#e70077`, `--rba-accent-fill` `#fec612`, `--rba-warn` `#85531a`, `--rba-idle` `#bdbdbd`.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- css-tokens css-colour` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the tokens, the block (with a header comment: pink stays for text and lines, yellow only as a fill with dark text, the spec path), tenants.json and the shim literal. Update `docs/css-files.md` (the new tokens, the block, the tenant marker).
- [ ] **Step 4: Run** the frontend and pa-demo tests for `css-tokens`, `css-colour`, `tenant`, `LoginChoice`, `SingleBoardLanding` (the last two read flevoland's theme; update any asserted `primaryDark`/`accent` to the new values) — Expected: PASS. Run `npm run check:css-equivalence` — Expected: `0 findings` (the new tokens default to existing values; the block is ignored for other tenants).
- [ ] **Step 5: Stage** and **ask** before committing `feat(css): Flevoland's colours for the Flevoland tenant, through the tokens (#374)`.

### Task 5: Accent and warn split in the stylesheets

**Files:**

- Modify: the stylesheets that use the accent or warn as a background — at least `packages/frontend/src/pages/caseworker-v2/dashboard-v2.css`, `packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css`, `packages/frontend/src/components/process/process-view.css`, `packages/frontend/src/pages/infra-board/dashboard-infra.css`, `packages/frontend/src/pages/woo/dashboard-woo.css`; find all with `grep -rnE "background(-color)?:[^;]*var\(--(rba|v2|pac|pb|w)-(accent|amber|warn)" packages/*/src`
- Test: `packages/frontend/src/css-tokens.test.ts`

**Interfaces:**

- Consumes: `--rba-accent-fill`, `--rba-on-accent-fill`, `--rba-warn-fill` (Task 4).
- Produces: surface aliases where a surface layer exists: `--v2-accent-fill`, `--pac-accent-fill`, `--pb-amber-fill`, `--v2-amber-fill`, `--w-amber-fill` (each `var(--rba-…-fill)`), defined next to the existing alias.

Rules (spec §3–4):

- **Fill that carries text or is a surface** (tag, badge, chip, tab, "in progress" label, bar with a label): background → the `-fill` token; the same rule sets `color: var(--rba-on-accent-fill)` (or the surface alias of it). Its previous text colour must have been white or `--rba-ink-inverse`; if it was something else, keep it and list the rule in the PR.
- **Small marker without text** (dot, legend swatch, thin bar, progress line, border): keep `--rba-accent` (pink) or `--rba-warn` (brown for Flevoland).
- `--pb-grey` / `--w-grey` / `--rba-idle` need no split.

- [ ] **Step 1: Write the failing guard test** `accent and warn backgrounds are classified` in `css-tokens.test.ts`: over every rule in `CSS_ROOTS`, find declarations `background` or `background-color` whose value contains `var(--(rba|v2|pac|pb|w)-(accent|amber|warn)` **without** `-fill`; each such `selector` must be listed in `ACCENT_MARKERS: Record<string, string>` (selector → one-line reason, e.g. `'.cwp-st.gateway .cwp-st-dot': 'status dot, no text'`). And: every rule whose background uses a `-fill` token declares `color` with `on-accent-fill` in it. Start with `ACCENT_MARKERS = {}`.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- css-tokens` — Expected: FAIL, listing every unclassified selector (about 29 accent + the warn fills).
- [ ] **Step 3: Classify each listed selector**, including its `:hover`, `:focus-visible`, `.is-active` and `[aria-selected]` variants: convert fills per the rules, add markers to `ACCENT_MARKERS` with their reason. Also convert the hex pink tints that sit under accent-fill text (e.g. `#fce7f0`) only if they are in the same rule; the rest wait for PR 3.
- [ ] **Step 4: Run** the test — Expected: PASS. Run `npm run check:css-equivalence` — Expected: `0 findings` (fill tokens default to the old values; `on-accent-fill` defaults to `#fff`). Any `changed` finding means a rule's old text colour was not white: revert that rule's `color` and list it.
- [ ] **Step 5: Stage** and **ask** before committing `feat(css): accent and warning fills get their own tokens (#374)`.

### Task 6: Process status colours through the tokens

**Files:**

- Modify: `packages/frontend/src/components/process/status.ts`
- Test: `packages/frontend/src/components/process/status.test.ts` (create if absent; check `components/process/*.test.*` first)

**Interfaces:**

- Produces: `STATUS[key].color` values: `done` `'var(--rba-ok)'`, `active` `'var(--rba-flevoland-blue)'`, `risk` `'var(--rba-warn)'`, `overdue` `'var(--rba-bad)'`, `action` `'var(--rba-flevoland-pink)'`, `todo` `'var(--rba-idle)'`; `wachtend` stays `'#7a5af0'` (a data colour; no Flevoland equivalent). Consumers use them only in `style` props (checked: `MijnDag.tsx:36`, `Portfolio.tsx:83,167,279`, `PhaseSwimlane.tsx:249,331`, `ProcessView.tsx:83`) — no string maths on them.

- [ ] **Step 1: Write the failing test** `status colours come from the tokens and keep their default values`: for each key except `wachtend`, `STATUS[k].color` matches `/^var\(--rba-[\w-]+\)$/`, and resolving it with the default `:root` env from `tokens.css` (`collectEnv` + `resolveValue`) gives the old hex (`#3fa535`, `#0046ad`, `#e5b700`, `#b0103c`, `#e70077`, `#c2c7d0`). And `no STATUS colour is used outside a style prop`: grep the consumer files' text for `STATUS[` … `.color` inside `fill=` or `stroke=` attributes → none.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- status` — Expected: FAIL.
- [ ] **Step 3: Implement.** Update any existing test asserting the old hex (e.g. `SigningPanel.test.tsx` if it does) to the `var()` value.
- [ ] **Step 4: Run** `npm test --workspace=@ronl/frontend` (whole frontend workspace) — Expected: PASS.
- [ ] **Step 5: Stage** and **ask** before committing `feat(process): status colours through the shared tokens (#374)`.

### PR 1 checkpoint

- [ ] `npm run lint:css:summary` and record the totals (unchanged except the two Flevoland files leaving `color-no-hex`).
- [ ] Hand off to the user: `npm test` (expect all workspaces green) and the ACC e2e run (frontend change). Nothing is visible for any tenant yet (marker off); no browser check needed.
- [ ] After the user's green: ask to push and open the PR against `acc` ("PR 1 of 4, invisible until PR 4"). After merge: housekeeping (GitHub only).

---

## PR 2 — Tailwind

Branch: `feat/flevoland-tailwind` from `acc` after PR 1 merges.

### Task 7: Tailwind scales through CSS variables

**Files:**

- Create: `packages/frontend/src/styles/tailwind-palette.css`
- Modify: `packages/frontend/tailwind.config.js`, `packages/frontend/src/App.tsx` (import after the tokens import), `stylelint.config.mjs` (`HEX_ALLOWED`: Tailwind's own default values), `docs/css-files.md`
- Test: `packages/frontend/src/tailwind-palette.test.ts`

**Interfaces:**

- Produces: variables `--twc-<scale>-<shade>` for scales `gray`, `slate`, `red`, `green`, `blue`, `amber`, `orange`, `yellow` and shades 50, 100–900 (and 950); `:root` defaults = `tailwindcss/colors` values. In `tailwind.config.js` `theme.extend.colors.<scale>[shade] = 'var(--twc-<scale>-<shade>)'`. `pink`, `indigo`, `purple`, `teal`, `rose` stay on Tailwind's values.
- Flevoland block in the same file, `:root[data-tenant="flevoland"]`:

  | Scale                 | 50                        | 100                       | 200                   | 300                   | 400                 | 500                 | 600                 | 700                  | 800                             | 900, 950                        |
  | --------------------- | ------------------------- | ------------------------- | --------------------- | --------------------- | ------------------- | ------------------- | ------------------- | -------------------- | ------------------------------- | ------------------------------- |
  | gray, slate           | background-document       | background-subtle         | background-muted      | border-subtle         | neutral-500         | text-disabled       | text-subtle         | text-heading         | text-default                    | text-default                    |
  | red                   | status-error-background   | status-error-background   | red-300               | red-300               | status-error-text   | status-error-text   | status-error-text   | status-error-text    | status-error-text-on-background | status-error-text-on-background |
  | green                 | status-success-background | status-success-background | green-300             | green-300             | status-success-text | status-success-text | status-success-text | status-success-text  | status-success-hover            | status-success-hover            |
  | amber, orange, yellow | status-warning-background | status-warning-background | status-warning-border | status-warning-border | status-warning-text | …                   | …                   | …                    | …                               | status-warning-text             |
  | blue                  | brand-primary-subtle      | brand-primary-subtle      | blue-200              | blue-200              | brand-primary       | brand-primary       | brand-primary       | brand-primary-active | text-default                    | text-default                    |

  (each cell is `var(--flevoland-color-<cell>)`.) If `blue` classes turn out to mark information rather than interaction (e.g. an info banner `bg-blue-50 text-blue-700`), list them in the PR; do not split the scale in this task.

- [ ] **Step 1: Write the failing tests** in `tailwind-palette.test.ts`:
  - `defaults are Tailwind's own values` → for every scale and shade, the `:root` value in `tailwind-palette.css` equals `require('tailwindcss/colors')[scale][shade]` (case-insensitive).
  - `the config maps every shade to its variable` → import `tailwind.config.js`; `colors[scale][shade] === 'var(--twc-' + scale + '-' + shade + ')'` for every pair.
  - `the Flevoland block covers every variable and points only at --flevoland-color-*`.
  - `no opacity modifier on a remapped scale` → no `\b[\w-]+-(gray|slate|red|green|blue|amber|orange|yellow)-\d{2,3}\/\d+` in `src/**/*.{ts,tsx}`, and every `(bg|text|border)-opacity-` class sits in a `className` without a remapped-scale colour of the same property (today: only with `bg-white`/`bg-black`). Comment why: `var()` colours lose Tailwind's alpha channel.
  - `App loads the palette after the tokens` → `App.tsx` imports `./styles/tailwind-palette.css` after `@ronl/shared/styles/tokens.css`.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- tailwind-palette` — Expected: FAIL.
- [ ] **Step 3: Implement.** Write the defaults once from `tailwindcss/colors` (a throwaway node one-liner is fine; the test guards them). pa-demo keeps its own config: its single colour class (`bg-gray-50`) is on the demo shell, not a Flevoland cockpit surface — note it in the PR.
- [ ] **Step 4: Run** the test, then `npm run build --workspace=@ronl/frontend` — Expected: PASS; the build succeeds; `grep -c "var(--twc-gray-400)" packages/frontend/dist/assets/*.css` > 0.
- [ ] **Step 5: Stage** and **ask** before committing `feat(css): Tailwind's colour scales follow the tenant (#374)`.

### PR 2 checkpoint

- [ ] Hand off `npm test` and ACC e2e; still invisible (marker off). Ask to push and open the PR; housekeeping after merge.

---

## PR 3 — hard-coded colours

Branch: `feat/flevoland-hex` from `acc` after PR 2 merges. One task per stylesheet group; if a group's diff is large, the user may ask for a PR per group.

**Procedure for every task in this PR** (spec §7):

1. List the file's hex values: `npx stylelint <file> --ignore-path .gitignore` (rule `color-no-hex`).
2. Classify each: **neutral** (text grey, line grey, page or card background) → the nearest `--rba-*` token; **brand / accent tint** → a fixed token (`--rba-flevoland-blue`, `--rba-flevoland-pink`) when the value is a fixed Flevoland colour, a themed token only where it already followed the theme, or `color-mix(in srgb, var(--rba-…) N%, transparent)` (alpha hex `#0046ad1a` → 10%); **status tint** (green, amber, red families) → a status token or `color-mix()` of one; **data colour** (chart series, phase and stage palettes, changelog type colours) → leave, add a `/* data colour */` comment on the line.
3. Surface variables with their own values (`--pac-green`, `--pac-amber`; landing `--ink`, `--muted`, `--line`; login portal `--amber`) and any value `color-mix()` cannot bring within ΔE 1.0: add a value token to `tokens.css` `:root` (default the old hex, named for its role, e.g. `--rba-ink-strong`), a Flevoland value in the Flevoland block (semantic tokens only), add it to `EXPECTED_TOKENS` and to the contrast test or its `EXEMPT` table.
4. Run `npm run check:css-equivalence` — Expected: `0 findings`. A finding means the replacement differs for some tenant: fix the replacement, never the check.
5. Run `npm test --workspace=@ronl/frontend -- css-tokens css-colour` — Expected: PASS.
6. Stage and **ask** before committing `refactor(css): <file(s)> colours through the tokens (#374)`.

### Task 8a: PA-Cockpit — `dashboard-pa.css` (204), `dossierbeheer.css`

### Task 8b: Landing — `login-portal.css` (32), `single-board.css`, `access-denied.css`

### Task 8c: Caseworker — `dashboard-v2.css` (17), `regelsimulatie.css` (16), `caseworker-process.css`, `process-disclosure.css`, `process-view.css`, `signing-panel.css`

### Task 8d: Infra-board and Woo — `dashboard-infra.css` (16), `dashboard-woo.css`; plus the #374 3b list: the 16 `var(--color-primary|--v2-chrome, #0046ad)` fallbacks become `var(--rba-brand)` / the surface alias (equivalence holds: `--rba-brand` falls back to `#0046ad`), and the dead `.pb-tweaks` block in `dashboard-infra.css` is deleted (confirm with `grep -rn "pb-tweaks" packages/frontend/src` that no TSX uses it)

### Task 8e: pa-demo — `demo-overrides.css`, `changelog/changelog.css` (changelog type colours are data colours)

### Task 8f: TS/TSX hex (166 in 25 files)

For 8f: `grep -rnoE "#[0-9a-fA-F]{3,8}\b" packages/frontend/src packages/pa-cockpit/src --include=*.ts --include=*.tsx | grep -v test`. Convert neutrals, brand and status values used in `style` props to `'var(--rba-…)'` strings; leave data colours (phase/stage palettes, chart series, `changelog-data.ts`) with a `// data colour` comment on the constant. SVG presentation attributes (`fill="#9aa1ad"`, `stroke=`) move to a `style` prop when converted. Equivalence is checked by a per-file test only where a constant changes (same shape as Task 6's test); report the list of what stayed and why in the PR.

Each 8x task ends with: the stylelint count for its files in the commit message body, and `docs/css-files.md` updated for any new value token.

### PR 3 checkpoint

- [ ] `npm run lint:css:summary`: record the new `color-no-hex` total (target: only `HEX_ALLOWED` files and data colours remain) in `docs/css-files.md`.
- [ ] Hand off `npm test` and ACC e2e; ask to push and open the PR(s); housekeeping after each merge.

---

## PR 4 — switch on

Branch: `feat/flevoland-switch-on` from `acc` after PR 3 merges.

### Task 9: Turn the marker on

**Files:**

- Modify: `packages/frontend/src/services/tenant.ts` (`TENANT_MARKER_ENABLED = true`, comment updated), `packages/pa-demo/src/demo/shims/tenant.ts` (same), `docs/css-files.md`
- Test: `packages/frontend/src/services/tenant.test.ts`

- [ ] **Step 1: Write the failing tests**: `the marker is on` (`TENANT_MARKER_ENABLED === true`); `initializeTenantTheme marks the tenant` → after `initializeTenantTheme('utrecht')` with the mocked tenants, `document.documentElement.dataset.tenant === 'utrecht'`; update `sets no data-tenant while the marker is off` to pass `false` explicitly.
- [ ] **Step 2: Run** `npm test --workspace=@ronl/frontend -- tenant` — Expected: FAIL.
- [ ] **Step 3: Flip both constants.** The pa-demo cross-check test from Task 3 must pass unchanged.
- [ ] **Step 4: Run** frontend and pa-demo tests — Expected: PASS.
- [ ] **Step 5: Stage** and **ask** before committing `feat(css): switch on Flevoland's colours for the Flevoland tenant (#374)`.

### PR 4 checkpoint

- [ ] Hand off `npm test`, ACC e2e, and a **browser check by the user**, per app (landing `/`, single-board `/heusden`, Caseworker, Infra-board, Woo, PA-Cockpit, PA demo): Flevoland user sees navy text, `#f8f8f8` page, yellow fills with dark text, pink lines, brown warning markers, no Tailwind-grey section; Heusden unchanged. Ask the user to watch for a first-paint flash on a Flevoland dashboard; if there is one, file an issue (spec: follow-up).
- [ ] Post the step-1 result to #374 (stylelint numbers, what stayed as data colours, Flevoland IT's open question about dark blue no longer applies since pink stays) — ask first.
- [ ] Ask to push and open the PR; housekeeping after merge.
