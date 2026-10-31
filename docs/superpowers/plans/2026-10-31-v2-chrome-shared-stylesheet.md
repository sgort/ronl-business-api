# One shared stylesheet for the v2 chrome — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every chrome declaration identical in `dashboard-v2.css` and `dashboard-pa.css` lives once in `packages/shared/styles/v2-chrome.css`, proved unchanged per host by a new `check:css-move`.

**Architecture:** Grouped selectors (`.cwd-v2 .v2-x, .pac .pac-x`) on `--rba-*` tokens; one import point (`pa-cockpit/src/styles.css`) ahead of both host files; a cascade comparison per host replaces the per-file equivalence check for this move.

**Tech Stack:** Plain CSS, Node ESM + postcss, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-v2-chrome-shared-stylesheet-design.md`

## Global Constraints

- Pure refactor: `npm run check:css-move` reports 0 for both hosts and every tenant environment.
- No TSX change, no class rename.
- Never prettier CSS files. Write regexes with Edit/Write, never in a shell heredoc or `node -e`.
- Shared file uses `--rba-*` tokens only, never `--v2-*` or `--pac-*`.
- `v2-chrome.css` is imported only by `pa-cockpit/src/styles.css`, after the tokens, before `dashboard-pa.css`.

## Review Focus

- Two rules for different classes on the same element (`.v2-btn` + `.v2-btn-sm`, `.v2-rail-item` + `.active`): their order per property must survive the move (the order check).
- A host alias that looks alike but resolves differently (`--v2-green` = `--rba-ok`, `--pac-green` = `--rba-ok-ink-3`): such a declaration must not move.
- Rules inside `@media`/`@supports` keep their at-rule chain.
- A multi-selector rule in a host file where only some selectors' declarations move.
- `.pac *` box-sizing and other host-only globals must not leak into the shared file.

---

### Task 1: `check:css-move` with unit tests

**Files:** Create `scripts/css-colour/check-move.mjs`, `packages/frontend/src/css-move.test.ts`. Modify `scripts/css-colour/check-equivalence.mjs` (export `sameValue`, `tenantThemes` already exported, `collectEnv`), root `package.json` (`check:css-move`).

**Interfaces — Produces:** `compareCascades({ before: string[], after: string[], roots: string[], envsBefore, envsAfter }) → Finding[]` where a Finding is `{ kind: 'removed'|'added'|'changed'|'order', selector, prop, env, detail }`. CLI: `node scripts/css-colour/check-move.mjs [--base acc] [--host cwd-v2|pac]`.

- [ ] Tests first: (a) an identical rule moved from host to shared → `[]`; (b) a moved declaration with a changed value → `changed`; (c) a declaration dropped → `removed`; (d) two selectors declaring `padding`, order swapped by the move → `order`; (e) a selector of the other host's root in the shared file is ignored; (f) at-rule chain kept: same declaration moved out of `@media` → `removed` + `added`; (g) an alias resolving to the same token passes (`var(--a)` → `var(--rba-x)` with `--a: var(--rba-x)`).
- [ ] Run `npx vitest run src/css-move.test.ts` in packages/frontend → FAIL (module missing).
- [ ] Implement; winning declaration per (at-rule chain, single selector, prop) = last; order = sequence of selectors per (chain, prop) restricted to selectors present on both sides.
- [ ] Tests PASS; `npm run check:css-move` on the untouched tree → 0 findings.

### Task 2: Shared font and accent tokens

**Files:** `packages/shared/styles/tokens.css`, both host root blocks.

- [ ] Add `--rba-font-serif/-sans/-mono`, `--rba-accent-50`, `--rba-accent-d`; point `--v2-*`/`--pac-*` aliases at them.
- [ ] `npm run check:css-equivalence` → 0; `check:css-move` → 0; `css-tokens.test.ts` PASS.

### Task 3: Move the identical declarations

**Files:** Create `packages/shared/styles/v2-chrome.css`. Modify `dashboard-v2.css`, `dashboard-pa.css`, `pa-cockpit/src/styles.css`.

- [ ] Generate with a throwaway script (scratchpad, not committed): per selector pair, each side's aliases resolved to `--rba-*`, move a declaration only when equal text after resolution; shared file in `dashboard-v2.css` order, grouped by the spec's sections; strip moved declarations from both hosts, splitting multi-selector rules where needed; drop emptied rules.
- [ ] Add the `@import` to `styles.css`; header comments in all three files.
- [ ] `check:css-move` → 0 for both hosts. Fix by hand until it is.

### Task 4: Tests follow the move

**Files:** `pa-cockpit-class-coverage.test.ts`, `css-tokens.test.ts`.

- [ ] Coverage test reads `v2-chrome.css` as part of each host. Token test scans it, and asserts `styles.css` imports it before `dashboard-pa.css` and no other stylesheet imports it (RED first by asserting before adding where possible).
- [ ] Frontend + pa-cockpit focused tests PASS.

### Task 5: Docs with a diagram

**Files:** `docs/css-files.md`.

- [ ] New row for `v2-chrome.css`; host rows updated; item 4 done; `check:css-move` in the tools section.
- [ ] A mermaid diagram (user request): which file holds what, and the load order per host (frontend: tokens → styles.css → v2-chrome → dashboard-pa → … → dashboard-v2 → infra/woo overrides; pa-demo: tokens → v2-chrome → dashboard-pa → demo overrides).
- [ ] `npx prettier --check docs/css-files.md` clean; hand `npm test` + e2e to the user.
