# Accessibility checks with axe-core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The frontend E2E suite scans ten page types with axe-core and fails on any critical/serious finding outside a recorded, non-stale baseline.

**Architecture:** A helper runs axe and compares (rule, target) pairs per page against `a11y-baseline.ts`; one Playwright test per page type, reached as in the measurement; full results attached to the report.

**Tech Stack:** Playwright, `@axe-core/playwright` 4.13.0.

**Spec:** `docs/superpowers/specs/2026-11-03-axe-accessibility-baseline-design.md`

## Global Constraints

- Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.
- Enforced impacts: `critical`, `serious`. Everything else is attached, not enforced.
- Never run `npm ci`/`npm install` that touches `node_modules`; lockfile via `--package-lock-only`.
- The user runs the E2E suite (I may run single specs against the stack they started).
- Write regexes with Edit/Write, never in `node -e` or heredocs.

## Review Focus

- A baseline target that axe reports differently between runs (dynamic selectors) would make the test flaky.
- The sign-in screen trick (204 on the authorize request) must not leak into other tests (route is per page).
- A page that fails to load must fail the test, not pass with zero findings.
- The stale check must name the page and entry.
- Heusden user may be missing on ACC: the test should fail clearly, not silently skip.

---

### Task 1: Follow-up issue for the Heusden items

- [ ] File the issue with the measured colours, ratios, elements and both fix options; note its number.

### Task 2: Dependency

**Files:** `packages/frontend/package.json`, `package-lock.json`

- [ ] Add `"@axe-core/playwright": "^4.13.0"` to devDependencies; `npm install --package-lock-only`; `npm run -s deps:check` reports ready.

### Task 3: Helper, baseline, spec

**Files:** Create `packages/frontend/e2e/helpers/a11y.ts`, `packages/frontend/e2e/a11y-baseline.ts`, `packages/frontend/e2e/accessibility.spec.ts`; delete the untracked `a11y-measure.spec.ts`.

**Interfaces — Produces:** `expectNoNewViolations(page: Page, pageName: PageName, testInfo: TestInfo): Promise<void>`; `BASELINE: Record<PageName, { rule: string; target: string; reason: string }[]>`.

- [ ] With an empty baseline, run the spec against the local stack. Expected: the four Flevoland dashboards and Heusden FAIL listing the measured findings; landing, sign-in and Keycloak PASS.
- [ ] Fill the baseline. Expected: all ten PASS.
- [ ] Add a fake baseline entry to one page. Expected: that test FAILS as stale; remove it.
- [ ] Lint and type-check the e2e files.

### Task 4: Docs and hand-off

- [ ] Spec-file header (what it checks, how to read a failure, how to change the baseline).
- [ ] Hand the full E2E run to the user: expected 56 passed, 5 skipped.
- [ ] After merge: comment on #409 with the baseline and the public-site side finding.
