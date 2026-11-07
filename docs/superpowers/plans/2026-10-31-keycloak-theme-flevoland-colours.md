# Keycloak login theme: Flevoland colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Keycloak login theme takes Flevoland's colours from a committed copy of their token file, guarded by tests.

**Architecture:** A byte-identical copy of `packages/shared/styles/flevoland/tokens.css` lives in the theme and is loaded before `login.css`; `login.css` uses Flevoland semantic tokens only. Frontend Vitest tests guard the copy, the load order, the token use and new hex values.

**Tech Stack:** Plain CSS (Keycloak 23 theme), Node ESM script, Vitest, stylelint.

**Spec:** `docs/superpowers/specs/2026-10-31-keycloak-theme-flevoland-colours-design.md`

## Global Constraints

- Colours only: no shape, size, radius, font, shadow-geometry or gradient-structure change.
- Semantic tokens (`--flevoland-color-<role>-…`) only in `login.css`; never palette (`--flevoland-color-<hue>-<n>`).
- Never prettier CSS files.
- Provider colours `#f97316 #ea580c #3b82f6 #2563eb #4f46e5 #3730a3` stay, in the provider rules only.

## Review Focus

- A Windows checkout with CRLF must not fail the byte-identity test: compare with line endings normalised.
- The copy must stay loadable on its own (no `@import` in the source file).
- `color-mix()` percentages match the old `rgba` alphas (10%, 20%, 30%).
- The hex gate's provider-colour entries must not let `#3b82f6` back into a non-provider rule unnoticed — accepted limit of the per-file list; noted in its reason.
- `theme.properties` `styles=` order: tokens first.

---

### Task 1: Token copy, sync script, theme guard test

**Files:**

- Create: `scripts/keycloak/sync-tokens.mjs`, `keycloak-themes/ronl/login/resources/css/flevoland-tokens.css` (generated)
- Create: `packages/frontend/src/keycloak-theme.test.ts`
- Modify: `package.json` (script `sync:keycloak-tokens`), `keycloak-themes/ronl/login/theme.properties`, `stylelint.config.mjs` (HEX_ALLOWED gets the copy)

- [ ] Write `keycloak-theme.test.ts` with: copy equals source (CRLF-normalised; message names `npm run sync:keycloak-tokens`); `styles=` lists `css/flevoland-tokens.css` before `css/login.css`; every `var(--flevoland-*)` in `login.css` is defined in the copy; no palette token in `login.css`; `login.css` uses at least one `--flevoland-color-` token.
- [ ] Run `npx vitest run src/keycloak-theme.test.ts` in `packages/frontend`. Expected: FAIL (copy missing, order missing, no tokens used).
- [ ] Add the script (`copyFileSync`), run it, set `styles=css/flevoland-tokens.css css/login.css`.
- [ ] Re-run. Expected: only the "uses tokens" test fails (Task 2 fixes it).

### Task 2: login.css through the tokens; hex gate covers the theme

**Files:**

- Modify: `keycloak-themes/ronl/login/resources/css/login.css` (mapping table in the spec), `packages/frontend/src/css-hex.test.ts`, `stylelint.config.mjs`

- [ ] Add `keycloak-themes/**/*.css` to `STYLESHEETS`, remove `login.css` from `HEX_ALLOWED`. Run `css-hex.test.ts`. Expected: FAIL listing login.css hex values.
- [ ] Apply the spec's mapping; add the six provider colours to `DATA_COLOURS` for `login.css`.
- [ ] Run `keycloak-theme.test.ts css-hex.test.ts css-tokens.test.ts`. Expected: PASS.

### Task 3: CI filter and docs

**Files:**

- Modify: `.github/workflows/azure-frontend-acc.yml` (`paths`: `keycloak-themes/**`), `docs/css-files.md`, `login.css` header comment

- [ ] Edit; run `npx prettier --check docs/css-files.md`. Expected: clean.
- [ ] Hand `npm test` to the user; wait for green before committing.
