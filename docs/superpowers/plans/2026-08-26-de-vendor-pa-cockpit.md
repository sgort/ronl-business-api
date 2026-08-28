# De-vendoring the PA Cockpit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** delete `packages/pa-demo/src/vendor/` and the drift machinery that polices it, by moving 39 duplicated files into `@ronl/pa-cockpit`, a workspace package that `packages/frontend` and `packages/pa-demo` both import.

**Architecture:** the 39 files leave their own set through exactly five relative specifiers, and those five are precisely the five files `pa-demo` already overlays. That is the host contract. The package takes React seams as a required `host` prop on its root and the two non-React service seams through a `configurePaCockpit()` registration called once at startup. The two content-narrowing seams (`modes.config`, `changelog-data`), which today work by making `tsc` and Vite disagree about where a relative import resolves, become injected data instead.

**Tech Stack:** npm workspaces, TypeScript, React 18, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-de-vendor-pa-cockpit-design.md` — approved. Read §5 (host contract) and §8 (deletion checklist) before Task 2.

## Global Constraints

- **Ask before every commit.** The user's global `CLAUDE.md` requires it _every single time_; approval for one commit never carries to the next. Stage the work, report what is staged, then stop and ask. Do not fold a commit into the same turn as the work.
- **No `Co-Authored-By:` or `Claude-Session:` trailers** in any commit message. This overrides the harness prompt.
- **Never merge or push a shared branch** (`acc`, `main`) without an explicit in-the-moment go-ahead.
- **Never start, stop or restart a dev server.** If a task is blocked by a stale server, report and stop.
- **Do not self-drive a browser to verify UI.** Run type-check, lint and unit tests; for anything visual, hand the user the exact command and expected result and wait for their confirmation.
  - **Carve-out granted for this run only:** the user has explicitly approved running Playwright directly in Tasks 8, 10 and 11 (`npm run test:e2e --workspace=@ronl/pa-demo`). That approval does not extend to any other task, to a later run, or to standing up a browser harness of your own.
- **Package name:** `@ronl/pa-cockpit`, at `packages/pa-cockpit`, version pinned at `1.0.0` (never independently deployed; matches `@ronl/shared`).
- **Ships TypeScript source, not a build.** `exports` points at `src/`. No `dist/`, no `tsc` build step, no CJS interop.
- **The package must not know what a public site is.** `sections.allow.ts` and all narrowing policy stay in `packages/pa-demo`.
- **Files are moved, not rewritten.** Use `git mv` so history follows. The only content edits are the seam changes named in Tasks 2, 6, 7, 8 and 9.
- **Deny-by-default is a compiler guarantee.** The `host` prop and its `modes` member are **required**, never defaulted. A default of "the full set" would silently reopen IOU and Hulpmiddelen on a public site.
- Work on `feat/de-vendor-pa-cockpit`, which is already rebased onto `acc`.

---

## File Structure

### Created — `packages/pa-cockpit/`

| File                                | Responsibility                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                      | name, `1.0.0`, `exports` at `./src`, deps, test/lint/type-check scripts                                                         |
| `tsconfig.json`                     | `include: ["src"]`, extends the frontend's compiler options                                                                     |
| `vitest.config.ts`                  | jsdom, globals, setup file, coverage over `src/**`                                                                              |
| `src/host.ts`                       | **the host contract** — `PaCockpitHost`, `PaTenantConfig`, `configurePaCockpit()`, `getPaCockpitAuth()`, `getPaCockpitTenant()` |
| `src/host.test.ts`                  | contract tests, including the unconfigured-access error                                                                         |
| `src/modes/PaModesContext.tsx`      | `PaModesProvider`, `usePaModes()` — derives `allStaticSections`/`findPaModeForSection` from injected modes                      |
| `src/modes/PaModesContext.test.tsx` | derivation + the "no provider" error                                                                                            |
| `src/index.ts`                      | public entry — re-exports the root, the host contract, `PA_MODES` and the pure mode helpers                                     |
| `src/styles.css`                    | `@import`s the two cockpit stylesheets plus the cockpit's own global rules                                                      |

### Moved into `packages/pa-cockpit/src/` (38 of 39 — `index.css` stays)

Preserving the existing tree shape under `src/`, so every internal relative import keeps working unchanged:

- `services/` — `pa.api.ts`, `dossierbeheer.api.ts`, `mock-demo.store.ts`
- `pages/public-affairs-v2/` — 15 files (`Vandaag`, `Issuekaart`, `Monitoring`, `AgendaView`, `Voortgang`, `Kompas`, `FeitenCijfers`, `NotificationsPanel`, `PaDataProvider`, `pa.data`, `feiten.data`, `dossierbeheer.data`, `modes.config`, `dashboard-pa.css`, `dossierbeheer.css`)
- `pages/PADashboardV2.tsx`
- `components/PADashboardV2/` — 9 files
- `components/PADashboardV2/dossierbeheer/` — 8 files
- plus the 32 accompanying test files

### Staying in `packages/frontend` (with their tests)

`pages/ChangelogPanel.tsx`, `pages/changelog-data.ts`, `components/PADashboardV2/PASectionRouter.tsx`, `components/PADashboardV2/PADock.tsx`, `components/SessionExpiryWarning.tsx`, `services/keycloak.ts`, `services/tenant.ts`, `index.css`.

### Deleted (Task 12)

Everything in §8 of the spec.

---

## Task 1: Scaffold the package

**Files:**

- Create: `packages/pa-cockpit/package.json`, `packages/pa-cockpit/tsconfig.json`, `packages/pa-cockpit/vitest.config.ts`, `packages/pa-cockpit/src/test/setup.ts`, `packages/pa-cockpit/.eslintrc.cjs`
- Modify: `package.json` (root — `workspaces` array)

**Interfaces:**

- Consumes: nothing.
- Produces: the workspace `@ronl/pa-cockpit`, resolvable from both apps.

- [ ] **Step 1: Read the two precedents before writing anything**

`packages/pa-demo/package.json`, `packages/pa-demo/tsconfig.json`, `packages/pa-demo/.eslintrc.cjs` and `packages/pa-demo/vite.config.ts`'s `test` block. Copy their conventions; do not invent new ones.

- [ ] **Step 2: Write `packages/pa-cockpit/package.json`**

```json
{
  "name": "@ronl/pa-cockpit",
  "version": "1.0.0",
  "description": "The PA-Cockpit UI, shared by the caseworker app and the public demo",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/styles.css"
  },
  "scripts": {
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@ronl/shared": "*",
    "axios": "^1.6.5",
    "react-markdown": "^10.1.0",
    "rehype-sanitize": "^6.0.0",
    "remark-gfm": "^4.0.1"
  },
  "peerDependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.3"
  },
  "license": "EUPL-1.2"
}
```

Verify each version against `packages/frontend/package.json` before committing — three wrong versions were caught by exactly this check during the demo build. `react` and friends are peers so the two hosts do not end up with duplicate React copies.

- [ ] **Step 3: Add the workspace to the root `package.json`**

Add `"packages/pa-cockpit"` to the `workspaces` array, in the position that keeps the list alphabetical.

- [ ] **Step 4: Write the tsconfig and vitest config**

`tsconfig.json` mirrors `packages/pa-demo/tsconfig.json` with `"include": ["src"]`. `vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    exclude: [...configDefaults.exclude],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/index.ts'],
    },
  },
});
```

Copy `packages/pa-demo/src/test/setup.ts` to `packages/pa-cockpit/src/test/setup.ts`.

- [ ] **Step 5: Write a smoke test so the suite is not empty**

`packages/pa-cockpit/src/scaffold.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
);

describe('@ronl/pa-cockpit scaffold', () => {
  it('is pinned at 1.0.0 — it is compiled into two apps that carry their own CalVer', () => {
    expect(pkg.version).toBe('1.0.0');
  });

  it('ships source rather than a build', () => {
    expect(pkg.exports['.']).toBe('./src/index.ts');
    expect(pkg.main).toBeUndefined();
  });

  it('keeps React as a peer so the two hosts cannot end up with two copies', () => {
    expect(pkg.peerDependencies.react).toBeDefined();
    expect(pkg.dependencies?.react).toBeUndefined();
  });
});
```

- [ ] **Step 6: Install and verify**

Run: `npm install` then `npm test --workspace=@ronl/pa-cockpit`
Expected: 3 tests pass. Then `npm run type-check --workspace=@ronl/pa-cockpit` → clean.

- [ ] **Step 7: Report what is staged and ask before committing**

Stage with `git add packages/pa-cockpit package.json package-lock.json`, report the file list, then **ask**. Suggested message:

```
chore(pa-cockpit): scaffold the workspace package
```

---

## Task 2: The host contract

**Files:**

- Create: `packages/pa-cockpit/src/host.ts`, `packages/pa-cockpit/src/host.test.ts`

**Interfaces:**

- Consumes: `KeycloakUser` from `@ronl/shared`.
- Produces:
  - `interface PaTenantConfig { displayName: string }`
  - `interface PaCockpitAuth { authenticated: boolean; token: string | undefined; getUser(): KeycloakUser | null; updateToken(minValidity?: number): Promise<boolean>; logout(options?: { redirectUri?: string }): Promise<void> }`
  - `interface PaCockpitTenant { initializeTenantTheme(id: string): Promise<boolean>; loadTenantConfigs(): Promise<unknown>; getTenantConfig(id: string): PaTenantConfig | null; getDefaultTenantConfig(): PaTenantConfig | null }`
  - `configurePaCockpit(services: { auth: PaCockpitAuth; tenant: PaCockpitTenant }): void`
  - `getPaCockpitAuth(): PaCockpitAuth` and `getPaCockpitTenant(): PaCockpitTenant`, both throwing when unconfigured

**Why module registration and not context:** `services/pa.api.ts` and `services/dossierbeheer.api.ts` read auth at module scope and are not React, so they cannot consume a context. Token lookup is not reactive — the value is read at call time, not rendered — which is exactly the case where module state is correct. React seams go through props (Task 7). Do not blur the two: module-global state feeding React components is what produced the `DemoRoleContext` defect during the demo build.

- [ ] **Step 1: Write the failing tests**

`packages/pa-cockpit/src/host.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  configurePaCockpit,
  getPaCockpitAuth,
  getPaCockpitTenant,
  __resetPaCockpitHostForTests,
} from './host';

const auth = {
  authenticated: true,
  token: 'tok',
  getUser: () => null,
  updateToken: async () => false,
  logout: async () => {},
};
const tenant = {
  initializeTenantTheme: async () => true,
  loadTenantConfigs: async () => ({}),
  getTenantConfig: () => ({ displayName: 'Provincie Flevoland' }),
  getDefaultTenantConfig: () => null,
};

beforeEach(() => __resetPaCockpitHostForTests());

describe('the PA-Cockpit host contract', () => {
  it('hands back exactly what was registered', () => {
    configurePaCockpit({ auth, tenant });
    expect(getPaCockpitAuth().token).toBe('tok');
    expect(getPaCockpitTenant().getTenantConfig('x')?.displayName).toBe('Provincie Flevoland');
  });

  it('throws a named error when read before configuration', () => {
    // The failure mode this prevents: an undefined auth object surfacing as
    // `Cannot read properties of undefined (reading 'token')` from inside a
    // request helper, three layers from the actual mistake.
    expect(() => getPaCockpitAuth()).toThrow(/configurePaCockpit/);
    expect(() => getPaCockpitTenant()).toThrow(/configurePaCockpit/);
  });

  it('lets a host re-register, so a test can swap services between cases', () => {
    configurePaCockpit({ auth, tenant });
    configurePaCockpit({ auth: { ...auth, token: 'other' }, tenant });
    expect(getPaCockpitAuth().token).toBe('other');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/pa-cockpit src/host`
Expected: FAIL — `Failed to resolve import "./host"`.

- [ ] **Step 3: Write `src/host.ts`**

```ts
/**
 * What a host must supply before the cockpit can run.
 *
 * Two mechanisms, chosen by what each seam is. This module carries the two
 * NON-React services, because services/pa.api.ts and
 * services/dossierbeheer.api.ts read them at module scope and cannot consume a
 * React context. That is sound here specifically because token lookup is not
 * reactive: the value is read when a request is made, not when something
 * renders.
 *
 * React seams go through the `host` prop on PADashboardV2 instead (see
 * PaCockpitHost there). Do not move a React seam into this module. Module
 * state feeding React components is what caused the DemoRoleContext defect
 * during the demo build: a mount-effect snapshot never saw later mutations,
 * so the UI silently kept rendering a stale value.
 */
import type { KeycloakUser } from '@ronl/shared';

/**
 * The only tenant field the cockpit reads is `displayName` (PADashboardV2's
 * tenant label). Kept minimal on purpose so each host can pass its own richer
 * config object unchanged — packages/frontend's TenantConfig carries theme,
 * features and contact blocks the cockpit has no business knowing about.
 */
export interface PaTenantConfig {
  displayName: string;
}

/** The subset of keycloak-js the cockpit touches. Signatures mirror the real ones. */
export interface PaCockpitAuth {
  authenticated: boolean;
  token: string | undefined;
  getUser(): KeycloakUser | null;
  updateToken(minValidity?: number): Promise<boolean>;
  logout(options?: { redirectUri?: string }): Promise<void>;
}

export interface PaCockpitTenant {
  initializeTenantTheme(municipalityId: string): Promise<boolean>;
  loadTenantConfigs(): Promise<unknown>;
  getTenantConfig(tenantId: string): PaTenantConfig | null;
  getDefaultTenantConfig(): PaTenantConfig | null;
}

export interface PaCockpitServices {
  auth: PaCockpitAuth;
  tenant: PaCockpitTenant;
}

let services: PaCockpitServices | null = null;

/** Call once at startup, before the first render. */
export function configurePaCockpit(next: PaCockpitServices): void {
  services = next;
}

function require_(): PaCockpitServices {
  if (!services) {
    throw new Error(
      'PA-Cockpit is not configured: call configurePaCockpit({ auth, tenant }) at startup, ' +
        'before rendering PADashboardV2.'
    );
  }
  return services;
}

export function getPaCockpitAuth(): PaCockpitAuth {
  return require_().auth;
}

export function getPaCockpitTenant(): PaCockpitTenant {
  return require_().tenant;
}

/** Test-only. Not exported from src/index.ts. */
export function __resetPaCockpitHostForTests(): void {
  services = null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/pa-cockpit src/host`
Expected: 3 pass.

- [ ] **Step 5: Report what is staged and ask before committing**

```
feat(pa-cockpit): add the host service contract
```

---

## Task 3: Move the pure data and config modules

**Files:**

- Move (with `git mv`): from `packages/frontend/src/` to `packages/pa-cockpit/src/`
  - `pages/public-affairs-v2/pa.data.ts` + `kompas.test.ts`
  - `pages/public-affairs-v2/feiten.data.ts`
  - `pages/public-affairs-v2/dossierbeheer.data.ts`
  - `pages/public-affairs-v2/modes.config.ts` + `notificaties-nav.test.ts`
  - `services/mock-demo.store.ts` + `mock-demo.store.test.ts`

**Interfaces:**

- Consumes: `configurePaCockpit` is not needed — none of these touch auth or tenant.
- Produces: `PA_MODES`, `SORT_SECTION_IDS`, `isPaItemVisible`, `findPaModeForSection`, `allStaticSections`, `type PaModeId`, `type PaModeConfig`, `type PaRailItem`, `type PaRailGroup`, `type PaGateContext`, `type OrgTypeGate` — all unchanged from `modes.config.ts`; plus `deriveDossierRole` and `type DossierRole` from `dossierbeheer.data.ts`.

These five carry no seams: they import only `react`, `@ronl/shared` and each other. They move first so later tasks have something to import.

- [ ] **Step 1: Move the files**

```bash
cd packages
mkdir -p pa-cockpit/src/pages/public-affairs-v2 pa-cockpit/src/services
git mv frontend/src/pages/public-affairs-v2/pa.data.ts            pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/pages/public-affairs-v2/kompas.test.ts        pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/pages/public-affairs-v2/feiten.data.ts        pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/pages/public-affairs-v2/dossierbeheer.data.ts pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/pages/public-affairs-v2/modes.config.ts       pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/pages/public-affairs-v2/notificaties-nav.test.ts pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/services/mock-demo.store.ts                   pa-cockpit/src/services/
git mv frontend/src/services/mock-demo.store.test.ts              pa-cockpit/src/services/
```

- [ ] **Step 2: Run the package suite to see what broke**

Run: `npm test --workspace=@ronl/pa-cockpit`
Expected: the moved tests run here now. Any failure is a missing dependency in `package.json` — fix that, not the test.

- [ ] **Step 3: Run the frontend suite to see what broke there**

Run: `npm run type-check --workspace=@ronl/frontend`
Expected: FAIL, with "Cannot find module" at each frontend file that imported a moved module. Record the list — Task 9 fixes them. Do not fix them yet; a half-migrated frontend is expected until then.

- [ ] **Step 4: Report and ask before committing**

```
refactor(pa-cockpit): move the pure data and mode config out of frontend
```

Note in the report that `packages/frontend` does not type-check at this commit and is repaired in Task 9.

---

## Task 4: Move the API services onto the host auth

**Files:**

- Move: `packages/frontend/src/services/pa.api.ts` (+ `pa.api.test.ts`), `dossierbeheer.api.ts` (+ `dossierbeheer.api.test.ts`) → `packages/pa-cockpit/src/services/`
- Modify: both moved files' auth imports

**Interfaces:**

- Consumes: `getPaCockpitAuth()` from Task 2.
- Produces: the same exported request functions, unchanged in name and signature.

- [ ] **Step 1: Move the four files**

```bash
cd packages
git mv frontend/src/services/pa.api.ts               pa-cockpit/src/services/
git mv frontend/src/services/pa.api.test.ts          pa-cockpit/src/services/
git mv frontend/src/services/dossierbeheer.api.ts    pa-cockpit/src/services/
git mv frontend/src/services/dossierbeheer.api.test.ts pa-cockpit/src/services/
```

- [ ] **Step 2: Rewire the auth import in both**

Replace `import keycloak from './keycloak';` with:

```ts
import { getPaCockpitAuth } from '../host';
```

Then, at each of the call sites (`pa.api.ts` lines ~26, 40, 54 and `dossierbeheer.api.ts` line ~38), replace `keycloak.` with a local read:

```ts
const auth = getPaCockpitAuth();
if (auth.authenticated) {
  try {
    await auth.updateToken(120);
  } catch {
    // unchanged — keep whatever the existing catch body is
  }
}
// headers:
headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
```

Read the auth object **inside** each function, never once at module load. A module-load read would capture the object before `configurePaCockpit` runs and throw at import time.

- [ ] **Step 3: Configure the host in the moved tests**

Both test files currently mock `./keycloak`. Replace that mock with a real registration in a `beforeEach`:

```ts
import { configurePaCockpit, __resetPaCockpitHostForTests } from '../host';

beforeEach(() => {
  __resetPaCockpitHostForTests();
  configurePaCockpit({
    auth: {
      authenticated: true,
      token: 'test-token',
      getUser: () => null,
      updateToken: async () => false,
      logout: async () => {},
    },
    tenant: {
      initializeTenantTheme: async () => true,
      loadTenantConfigs: async () => ({}),
      getTenantConfig: () => null,
      getDefaultTenantConfig: () => null,
    },
  });
});
```

This is a real improvement, not just a port: the old mock stubbed the module these tests depend on, so it could pass vacuously against a keycloak module that had changed shape. A registered object is checked against `PaCockpitAuth` by the compiler.

- [ ] **Step 4: Add a test proving the unconfigured path fails loudly**

```ts
it('fails with a named error when no host has been configured', async () => {
  __resetPaCockpitHostForTests();
  await expect(fetchDossiers()).rejects.toThrow(/configurePaCockpit/);
});
```

Use whichever exported request function is first in the file; name it exactly.

- [ ] **Step 5: Run**

Run: `npm test --workspace=@ronl/pa-cockpit`
Expected: all moved API tests pass, plus the new one.

- [ ] **Step 6: Report and ask before committing**

```
refactor(pa-cockpit): move the API services onto the injected auth
```

---

## Task 5: Move the views, components and stylesheets

**Files:**

- Move: the remaining 26 source files + their tests, per the File Structure section
- Move: `dashboard-pa.css`, `dossierbeheer.css`
- Create: `packages/pa-cockpit/src/styles.css`

**Interfaces:**

- Consumes: everything from Tasks 3 and 4.
- Produces: every moved component under its original name and default/named export.

`PADashboardV2.tsx` is **not** moved in this task — it carries all five seams and gets Task 7 to itself.

- [ ] **Step 1: Move the view layer**

```bash
cd packages
mkdir -p pa-cockpit/src/components/PADashboardV2/dossierbeheer
for f in Vandaag Issuekaart Monitoring AgendaView Voortgang Kompas FeitenCijfers NotificationsPanel PaDataProvider; do
  git mv frontend/src/pages/public-affairs-v2/$f.tsx pa-cockpit/src/pages/public-affairs-v2/
  git mv frontend/src/pages/public-affairs-v2/$f.test.tsx pa-cockpit/src/pages/public-affairs-v2/ 2>/dev/null || true
done
git mv frontend/src/pages/public-affairs-v2/dashboard-pa.css  pa-cockpit/src/pages/public-affairs-v2/
git mv frontend/src/pages/public-affairs-v2/dossierbeheer.css pa-cockpit/src/pages/public-affairs-v2/
```

- [ ] **Step 2: Move the components**

```bash
cd packages
for f in BronnenSection CuratiePijplijnFlow CuratieSpecSection KompasSpecSection \
         NotificatiesSection PACommandPalette PANoAccessPanel WatchBell ZoekcriteriaSection; do
  git mv frontend/src/components/PADashboardV2/$f.tsx pa-cockpit/src/components/PADashboardV2/
  git mv frontend/src/components/PADashboardV2/$f.test.tsx pa-cockpit/src/components/PADashboardV2/ 2>/dev/null || true
done
for f in ArchiveDialog DeleteDialog Dossierbeheer DossierEditor DossierRow \
         KompasScorer MdEditor TemplateGallery; do
  git mv frontend/src/components/PADashboardV2/dossierbeheer/$f.tsx pa-cockpit/src/components/PADashboardV2/dossierbeheer/
  git mv frontend/src/components/PADashboardV2/dossierbeheer/$f.test.tsx pa-cockpit/src/components/PADashboardV2/dossierbeheer/ 2>/dev/null || true
done
```

- [ ] **Step 3: Confirm every internal relative import still resolves**

Because the tree shape under `src/` was preserved, no import path should need editing. Prove it rather than assume it:

Run: `npm run type-check --workspace=@ronl/pa-cockpit`
Expected: errors ONLY about `PACommandPalette`'s `modes.config` value imports (fixed in Task 6) and anything importing `PADashboardV2` (Task 7). Any _other_ "cannot find module" means a file was moved to the wrong depth — fix the move, not the import.

- [ ] **Step 4: Write `src/styles.css`**

```css
/*
 * The cockpit's stylesheet entry. Hosts import '@ronl/pa-cockpit/styles.css'.
 *
 * index.css is deliberately NOT here: it is the generic RONL app shell style
 * (Tailwind entry plus resets), not cockpit code, and it stays in
 * packages/frontend. Anything the cockpit genuinely needs globally belongs
 * below, so a host does not have to guess.
 */
@import './pages/public-affairs-v2/dashboard-pa.css';
@import './pages/public-affairs-v2/dossierbeheer.css';
```

- [ ] **Step 5: Report and ask before committing**

```
refactor(pa-cockpit): move the cockpit views, components and stylesheets
```

---

## Task 6: Injected modes, replacing the alias

**Files:**

- Create: `packages/pa-cockpit/src/modes/PaModesContext.tsx`, `packages/pa-cockpit/src/modes/PaModesContext.test.tsx`
- Modify: `packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx:11-16`, `PACommandPalette.test.tsx`

**Interfaces:**

- Consumes: `PA_MODES`, `SORT_SECTION_IDS`, `type PaModeConfig`, `type PaRailItem`, `type PaModeId` from `pages/public-affairs-v2/modes.config`.
- Produces:
  - `PaModesProvider({ modes, children })`
  - `usePaModes(): { modes: PaModeConfig[]; allStaticSections(): PaRailItem[]; findPaModeForSection(id: string): PaModeId | null }`

**Why this replaces the alias:** today `pa-demo` aliases four relative spellings of `./modes.config` and relies on `tsc` and Vite disagreeing about where it resolves. Inside a package those imports are internal and a host-side alias cannot reliably reach them. Deriving the helpers from injected data also makes ⌘K structurally incapable of diverging from the rail, which is the bug class this replaces.

- [ ] **Step 1: Write the failing tests**

`packages/pa-cockpit/src/modes/PaModesContext.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaModesProvider, usePaModes } from './PaModesContext';
import { PA_MODES } from '../pages/public-affairs-v2/modes.config';
import type { PaModeConfig } from '../pages/public-affairs-v2/modes.config';

function Probe() {
  const { allStaticSections, findPaModeForSection } = usePaModes();
  return (
    <>
      <span data-testid="ids">
        {allStaticSections()
          .map((s) => s.id)
          .join(',')}
      </span>
      <span data-testid="mode">{String(findPaModeForSection('vandaag'))}</span>
    </>
  );
}

const narrowed: PaModeConfig[] = PA_MODES.map((m) => ({
  ...m,
  groups: m.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.id === 'vandaag') }))
    .filter((g) => g.items.length > 0),
}));

describe('PaModesProvider', () => {
  it('derives the searchable sections from the modes it was given, not from PA_MODES', () => {
    // The whole point: a host that narrows the mode set narrows ⌘K with it.
    render(
      <PaModesProvider modes={narrowed}>
        <Probe />
      </PaModesProvider>
    );
    expect(screen.getByTestId('ids')).toHaveTextContent('vandaag');
    expect(screen.getByTestId('ids')).not.toHaveTextContent('iou-feedback');
  });

  it('excludes the sort sentinels from the searchable sections', () => {
    // sort-kompas / sort-momentum are rail affordances, not destinations.
    // They leaked into the palette once already during the demo build.
    render(
      <PaModesProvider modes={PA_MODES}>
        <Probe />
      </PaModesProvider>
    );
    const ids = screen.getByTestId('ids').textContent!.split(',');
    expect(ids).not.toContain('sort-kompas');
    expect(ids).not.toContain('sort-momentum');
    expect(ids).toContain('vandaag');
  });

  it('resolves a section back to its mode', () => {
    render(
      <PaModesProvider modes={PA_MODES}>
        <Probe />
      </PaModesProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('vandaag');
  });

  it('throws outside a provider rather than silently offering the full set', () => {
    expect(() => render(<Probe />)).toThrow(/PaModesProvider/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root packages/pa-cockpit src/modes`
Expected: FAIL — cannot resolve `./PaModesContext`.

- [ ] **Step 3: Write the provider**

```tsx
/**
 * The mode set the cockpit renders, supplied by the host.
 *
 * PA_MODES is still exported as data — a host that wants the full cockpit
 * imports it and passes it straight through. What changed is that no component
 * reaches for it directly any more, so a host can narrow the set and have every
 * consumer follow, including ⌘K.
 *
 * That last part is the reason this exists rather than a filter in the section
 * router: PACommandPalette used to call allStaticSections() itself, so filtering
 * at the router left the palette still offering sections the rail had dropped.
 * Deriving both from one injected value makes the two incapable of diverging.
 */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  SORT_SECTION_IDS,
  type PaModeConfig,
  type PaModeId,
  type PaRailItem,
} from '../pages/public-affairs-v2/modes.config';

interface PaModesValue {
  modes: PaModeConfig[];
  allStaticSections: () => PaRailItem[];
  findPaModeForSection: (sectionId: string) => PaModeId | null;
}

const PaModesCtx = createContext<PaModesValue | null>(null);

export function PaModesProvider({
  modes,
  children,
}: {
  modes: PaModeConfig[];
  children: ReactNode;
}) {
  const value = useMemo<PaModesValue>(
    () => ({
      modes,
      allStaticSections: () => {
        const out: PaRailItem[] = [];
        for (const mode of modes) {
          for (const group of mode.groups) {
            for (const item of group.items) {
              // Sort sentinels are rail affordances, not destinations.
              if (!SORT_SECTION_IDS.has(item.id)) out.push(item);
            }
          }
        }
        return out;
      },
      findPaModeForSection: (sectionId: string) => {
        for (const mode of modes) {
          for (const group of mode.groups) {
            if (group.items.some((i) => i.id === sectionId)) return mode.id;
          }
        }
        return null;
      },
    }),
    [modes]
  );

  return <PaModesCtx.Provider value={value}>{children}</PaModesCtx.Provider>;
}

export function usePaModes(): PaModesValue {
  const ctx = useContext(PaModesCtx);
  if (!ctx) {
    throw new Error(
      'usePaModes must be used inside PaModesProvider — pass `modes` on the cockpit host prop.'
    );
  }
  return ctx;
}
```

- [ ] **Step 4: Rewire `PACommandPalette.tsx`**

Replace the module import at lines 11–16:

```ts
import {
  allStaticSections,
  findPaModeForSection,
  type PaModeId,
} from '../../pages/public-affairs-v2/modes.config';
```

with:

```ts
import type { PaModeId } from '../../pages/public-affairs-v2/modes.config';
import { usePaModes } from '../../modes/PaModesContext';
```

and inside the component body, above the existing `useMemo`:

```ts
const { allStaticSections, findPaModeForSection } = usePaModes();
```

Add `allStaticSections` and `findPaModeForSection` to that `useMemo`'s dependency array.

- [ ] **Step 5: Wrap the palette's own tests in a provider**

`PACommandPalette.test.tsx` renders the palette directly. Add a helper and use it at every render site:

```tsx
import { PaModesProvider } from '../../modes/PaModesContext';
import { PA_MODES } from '../../pages/public-affairs-v2/modes.config';

function renderPalette(ui: React.ReactElement) {
  return render(<PaModesProvider modes={PA_MODES}>{ui}</PaModesProvider>);
}
```

- [ ] **Step 6: Run**

Run: `npx vitest run --root packages/pa-cockpit src/modes src/components/PADashboardV2/PACommandPalette`
Expected: 4 new tests pass, and every pre-existing palette test still passes unchanged in its assertions.

- [ ] **Step 7: Report and ask before committing**

```
feat(pa-cockpit): derive the rail and the palette from injected modes
```

---

## Task 7: Move the shell and give it the host prop

**Files:**

- Move: `packages/frontend/src/pages/PADashboardV2.tsx` (+ `PADashboardV2.test.tsx`) → `packages/pa-cockpit/src/pages/`
- Modify: the moved file's seam imports and signature
- Create: `packages/pa-cockpit/src/index.ts`

**Interfaces:**

- Consumes: Tasks 2, 3, 5, 6.
- Produces:
  - `interface PaSectionRouterProps { sectionId: string; prioritering: Prioritering; kompasViz: KompasViz; user: KeycloakUser | null; tenantConfig: PaTenantConfig | null; onOpenDossier: (id: string) => void; onNavigate?: (mode: PaModeId, sectionId: string) => void }`
  - `interface PaDockProps { user: KeycloakUser | null; onClose: () => void }`
  - `interface PaChangelogPanelProps { isOpen: boolean; onClose: () => void }`
  - `interface PaCockpitHost { modes: PaModeConfig[]; SectionRouter: ComponentType<PaSectionRouterProps>; Dock: ComponentType<PaDockProps>; SessionExpiryWarning: ComponentType; ChangelogPanel: ComponentType<PaChangelogPanelProps> }`
  - `export default function PADashboardV2({ host }: { host: PaCockpitHost })`

- [ ] **Step 1: Move the two files**

```bash
cd packages
git mv frontend/src/pages/PADashboardV2.tsx      pa-cockpit/src/pages/
git mv frontend/src/pages/PADashboardV2.test.tsx pa-cockpit/src/pages/
```

- [ ] **Step 2: Replace the five seam imports with the host prop**

Delete these imports from the moved file:

```ts
import keycloak, { getUser } from '../services/keycloak';          // line ~27
import { initializeTenantTheme, loadTenantConfigs, getTenantConfig,
         getDefaultTenantConfig } from '../services/tenant';        // lines ~28-33
import type { TenantConfig } from '../services/tenant';             // line ~34
import PADock from '../components/PADashboardV2/PADock';            // line ~53
import PASectionRouter from '../components/PADashboardV2/PASectionRouter';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';                      // line ~56
import { PA_MODES, SORT_SECTION_IDS, isPaItemVisible, ... } from './public-affairs-v2/modes.config';
```

Add:

```ts
import type { ComponentType } from 'react';
import { getPaCockpitAuth, getPaCockpitTenant, type PaTenantConfig } from '../host';
import { PaModesProvider, usePaModes } from '../modes/PaModesContext';
import {
  SORT_SECTION_IDS,
  isPaItemVisible,
  type PaGateContext,
  type PaModeId,
  type OrgTypeGate,
  type PaModeConfig,
} from './public-affairs-v2/modes.config';
```

Then, inside the component: replace `keycloak.` with `getPaCockpitAuth().`, `getUser()` with `getPaCockpitAuth().getUser()`, the four tenant calls with `getPaCockpitTenant().<same name>`, `TenantConfig` with `PaTenantConfig`, and `PA_MODES` with the modes from context. Render `host.SectionRouter`, `host.Dock`, `host.SessionExpiryWarning` and `host.ChangelogPanel` where the imported components were rendered — capitalised locals, e.g. `const { SectionRouter } = host;` then `<SectionRouter … />`.

**Split the component in two** so the shell can consume its own provider: an outer `PADashboardV2({ host })` that renders `<PaModesProvider modes={host.modes}>` around an inner `PADashboardV2Inner({ host })` holding the existing body. A component cannot `useContext` a provider it renders itself.

- [ ] **Step 3: Write the failing test for the required prop**

Append to `PADashboardV2.test.tsx`:

```tsx
it('renders only the modes the host supplied', () => {
  // Deny-by-default made observable: a host narrowing its mode set must not
  // find the full rail rendered anyway. This is the guarantee that replaces
  // pa-demo's Vite alias, and the reason `modes` is required rather than
  // defaulted to PA_MODES.
  const narrowed = PA_MODES.filter((m) => m.id === 'vandaag');
  render(<PADashboardV2 host={{ ...testHost, modes: narrowed }} />);

  expect(screen.queryByRole('button', { name: 'Beheer' })).not.toBeInTheDocument();
});
```

Define `testHost` at the top of the file as a `PaCockpitHost` whose four components render `null` and whose `modes` is `PA_MODES`, and call `configurePaCockpit` in a `beforeEach` exactly as Task 4 Step 3 does.

- [ ] **Step 4: Run**

Run: `npx vitest run --root packages/pa-cockpit src/pages/PADashboardV2`
Expected: the new test passes and the pre-existing shell tests pass once they are given `host={testHost}`.

- [ ] **Step 5: Write `src/index.ts`**

```ts
/**
 * The package's public surface. Everything a host needs and nothing it does not
 * — notably not __resetPaCockpitHostForTests, and not the internal components,
 * which are reached only through the shell.
 */
export { default as PADashboardV2 } from './pages/PADashboardV2';
export type {
  PaCockpitHost,
  PaSectionRouterProps,
  PaDockProps,
  PaChangelogPanelProps,
} from './pages/PADashboardV2';

export { configurePaCockpit, getPaCockpitAuth, getPaCockpitTenant } from './host';
export type { PaCockpitAuth, PaCockpitTenant, PaCockpitServices, PaTenantConfig } from './host';

export {
  PA_MODES,
  SORT_SECTION_IDS,
  isPaItemVisible,
  findPaModeForSection,
  allStaticSections,
} from './pages/public-affairs-v2/modes.config';
export type {
  PaModeId,
  PaModeConfig,
  PaRailItem,
  PaRailGroup,
  PaGateContext,
  OrgTypeGate,
} from './pages/public-affairs-v2/modes.config';

export { deriveDossierRole } from './pages/public-affairs-v2/dossierbeheer.data';
export type { DossierRole } from './pages/public-affairs-v2/dossierbeheer.data';
```

- [ ] **Step 6: Report and ask before committing**

```
feat(pa-cockpit): move the shell and take its host seams as a required prop
```

---

## Task 8: Drop the package's Tailwind dependency

**Files:**

- Modify: `packages/pa-cockpit/src/pages/public-affairs-v2/NotificationsPanel.tsx`, `packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css`
- Create: `packages/pa-cockpit/src/no-tailwind.test.ts`

**Why:** measured across the 39, exactly two files used Tailwind utility classes — `ChangelogPanel.tsx` (58 occurrences) and `NotificationsPanel.tsx` (19). `ChangelogPanel` stays in `packages/frontend`, so this is the last one. Converting it lets the package declare no Tailwind dependency at all, which removes the failure mode where a host forgets the `content` glob and the classes are silently purged — an unstyled box with no build error.

- [ ] **Step 1: Write the failing guard**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

// Deliberately narrow: matches a hyphenated Tailwind scale token, not the bare
// words `flex` or `grid`, which appear inside this project's own pac-* class
// strings. A looser pattern reported six files here when the real answer was
// two.
const TAILWIND =
  /\b(?:bg|text|border|rounded|shadow|ring|w|h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|grid-cols|col-span|items|justify|z|opacity|font|leading|tracking|overflow|inset|space-[xy]|divide)-[a-z0-9[\]./-]+/;

describe('@ronl/pa-cockpit styling', () => {
  it('uses no Tailwind utility classes, so no host needs a content glob for it', () => {
    const offenders = walk(SRC).filter((file) =>
      [...readFileSync(file, 'utf-8').matchAll(/className=["'`]([^"'`]+)["'`]/g)].some((m) =>
        TAILWIND.test(m[1])
      )
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root packages/pa-cockpit src/no-tailwind`
Expected: FAIL, listing `NotificationsPanel.tsx` and nothing else. If it lists more, the extra files are real and must be converted too — do not loosen the regex to make the test pass.

- [ ] **Step 3: Convert the 19 classNames**

For each `className` on `NotificationsPanel.tsx`, replace the Tailwind utilities with a `pac-notif-*` class and add the equivalent rule to `dashboard-pa.css`, scoped under `.pac` to match every other rule in that file. Keep the rendered result identical — this is a translation, not a redesign.

- [ ] **Step 4: Run the guard and the panel's own tests**

Run: `npx vitest run --root packages/pa-cockpit src/no-tailwind src/pages/public-affairs-v2/NotificationsPanel`
Expected: all pass, with the panel's 19 pre-existing tests unchanged.

- [ ] **Step 5: Hand the visual check to the user**

Per the global constraints, do not self-verify this in a browser. Report: "NotificationsPanel's Tailwind classes are converted to `pac-notif-*`. Please open Meldingen in the running app and confirm it looks unchanged." Wait for confirmation before asking to commit.

- [ ] **Step 6: Report and ask before committing**

```
refactor(pa-cockpit): replace NotificationsPanel's Tailwind classes with pac-* rules
```

---

## Task 9: Rewire packages/frontend onto the package

**Files:**

- Modify: `packages/frontend/package.json` (add the dependency), `packages/frontend/src/App.tsx`, `packages/frontend/src/main.tsx`, `packages/frontend/src/components/PADashboardV2/PASectionRouter.tsx:60`, `packages/frontend/src/components/CaseworkerDashboard/ProfielSection.tsx:15`
- Create: `packages/frontend/src/pages/pa-cockpit-host.tsx`

**Interfaces:**

- Consumes: `PaCockpitHost`, `configurePaCockpit`, `PA_MODES`, `PADashboardV2` from `@ronl/pa-cockpit`.
- Produces: `paCockpitHost: PaCockpitHost` from the new module.

- [ ] **Step 1: Add the dependency**

`"@ronl/pa-cockpit": "*"` in `packages/frontend/package.json` dependencies, then `npm install`.

- [ ] **Step 2: Widen the two tenantConfig prop types**

The whole consumer chain reads only `tenantConfig?.displayName` (verified: `PASectionRouter.tsx:135,158` → `ProfielSection.tsx:44`). Change the prop type in both files from `TenantConfig | null` to `PaTenantConfig | null`, importing the type from `@ronl/pa-cockpit`. Without this, `PASectionRouter` is not assignable to `ComponentType<PaSectionRouterProps>` — a component wanting _richer_ props than the contract promises is rejected under `strictFunctionTypes`, correctly.

- [ ] **Step 3: Write the host module**

`packages/frontend/src/pages/pa-cockpit-host.tsx`:

```tsx
/**
 * What packages/frontend supplies to @ronl/pa-cockpit.
 *
 * These five were the cockpit's only imports outside its own tree before it
 * became a package; the overlay files packages/pa-demo used to keep alongside
 * its vendored copy were the same five. Extraction turned that discovered
 * contract into a type.
 */
import keycloak, { getUser } from '../services/keycloak';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from '../services/tenant';
import { configurePaCockpit, PA_MODES, type PaCockpitHost } from '@ronl/pa-cockpit';
import PASectionRouter from '../components/PADashboardV2/PASectionRouter';
import PADock from '../components/PADashboardV2/PADock';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';

configurePaCockpit({
  auth: {
    get authenticated() {
      return !!keycloak.authenticated;
    },
    get token() {
      return keycloak.token;
    },
    getUser,
    updateToken: (minValidity) => keycloak.updateToken(minValidity ?? 0),
    logout: async (options) => {
      await keycloak.logout(options);
    },
  },
  tenant: { initializeTenantTheme, loadTenantConfigs, getTenantConfig, getDefaultTenantConfig },
});

// Getters, not snapshots: keycloak.token is replaced on every refresh, so a
// plain `token: keycloak.token` would freeze the value captured at module load
// and every request after the first refresh would send a stale bearer.
export const paCockpitHost: PaCockpitHost = {
  modes: PA_MODES,
  SectionRouter: PASectionRouter,
  Dock: PADock,
  SessionExpiryWarning,
  ChangelogPanel,
};
```

- [ ] **Step 4: Render it from the route**

In `App.tsx`, replace the line-6 import and the line-92 route element:

```tsx
import { PADashboardV2 } from '@ronl/pa-cockpit';
import { paCockpitHost } from './pages/pa-cockpit-host';
import '@ronl/pa-cockpit/styles.css';
// ...
<Route path="/dashboard/public-affairs" element={<PADashboardV2 host={paCockpitHost} />} />;
```

- [ ] **Step 5: Write a test for the stale-token trap**

`packages/frontend/src/pages/pa-cockpit-host.test.ts`:

```ts
it('reads the token at call time, not at module load', async () => {
  // A plain `token: keycloak.token` passes every other test in this file and
  // then sends a stale bearer after the first silent refresh.
  const before = getPaCockpitAuth().token;
  keycloak.token = 'refreshed-token';
  expect(getPaCockpitAuth().token).not.toBe(before);
  expect(getPaCockpitAuth().token).toBe('refreshed-token');
});
```

- [ ] **Step 6: Run the frontend suite and type-check**

Run: `npm run type-check --workspace=@ronl/frontend` then `npm test --workspace=@ronl/frontend`
Expected: both clean. The frontend suite is now smaller by the 32 moved files; record the new file/test counts for Task 13.

- [ ] **Step 7: Report and ask before committing**

```
refactor(frontend): consume the PA-Cockpit from @ronl/pa-cockpit
```

---

## Task 10: Build the demo's own changelog panel

**Files:**

- Create: `packages/pa-demo/src/demo/changelog/changelog.data.ts`, `DemoChangelogPanel.tsx`, `DemoChangelogPanel.test.tsx`, `changelog.data.test.ts`
- Delete: `packages/pa-demo/src/demo/changelog-data.filtered.ts`

**Interfaces:**

- Consumes: `PaChangelogPanelProps` from `@ronl/pa-cockpit` (Task 7) — `{ isOpen: boolean; onClose: () => void }`.
- Produces: `DemoChangelogPanel`, assignable to `PaCockpitHost['ChangelogPanel']`; `DEMO_CHANGELOG: DemoRelease[]`.

**Why a purpose-built panel rather than a copy or a dependency.** The spec left this open, and the user resolved it: neither take `@ronl/frontend` as a dependency of `pa-demo` nor copy `ChangelogPanel.tsx` across — a copied file would leave one vendored file behind and partly defeat the whole exercise. Build a small one instead, designed for the audience that actually reads it.

The frontend panel is an engineering changelog: per-commit headers with SHA and author, scope badges reading "Frontend + Backend", status pills, coloured left borders, collapsible cards, a GitLab link. A prospective province cares about none of that. The curated data is already written for them — 8 themed entries covering 25 releases, in plain Dutch prose — and the panel should stop working against it.

**The content is re-derived, not ported.** The existing curated entries were hand-picked across the whole product. The demo's changelog should describe the _cockpit_ — so select by path and summarise in Dutch for a prospective province. Extraction makes that selection crisp and, from here on, mechanical.

**The data shape simplifies too.** Measured against the current curated file: 8 entries, each with exactly **one** section. So `sections[]` flattens into the entry, and four fields go away entirely — `statusColor` and `borderColor` (all eight are `'green'`, and nothing in the new panel reads them), `status` (all eight are `'Released'`; an unreleased entry has no business on a public demo), and `scope` (`['frontend','backend']` is meaningless to this reader).

**Copy constraint, unchanged:** everything here ships in the public bundle, so it must stay clear of `scripts/check-bundle.mjs`'s FORBIDDEN list — no auth-library names, no telemetry names, no backend origin. Describe what a change does rather than naming the library it forbids.

- [ ] **Step 1: Write the failing data test**

`packages/pa-demo/src/demo/changelog/changelog.data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEMO_CHANGELOG } from './changelog.data';

describe('the demo changelog', () => {
  it('covers every release with a version, a date, a heading and at least one item', () => {
    // No hard-coded count: the entries are re-derived from the cockpit's own
    // commit history (Step 3) and will grow with each release.
    expect(DEMO_CHANGELOG.length).toBeGreaterThan(0);
    for (const release of DEMO_CHANGELOG) {
      expect(release.version).toMatch(/\d{4}\.\d{2}/);
      expect(release.date).toBeTruthy();
      expect(release.title).toBeTruthy();
      expect(release.items.length).toBeGreaterThan(0);
    }
  });

  it('runs newest first', () => {
    const versions = DEMO_CHANGELOG.map((r) => r.version);
    expect(versions).toEqual([...versions].sort().reverse());
  });

  it('names nothing on the bundle gate's forbidden list', () => {
    // This copy ships in a public bundle. check-bundle.mjs fails the build on
    // these, but it runs at build time — this fails in a second instead.
    const text = JSON.stringify(DEMO_CHANGELOG).toLowerCase();
    for (const forbidden of ['keycloak-js', 'msal', 'oidc-client', 'react-ga', 'gtag(', 'api.open-regels.nl']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root packages/pa-demo src/demo/changelog`
Expected: FAIL — cannot resolve `./changelog.data`.

- [ ] **Step 3: Write `changelog.data.ts`**

Own the types outright — after Task 11 there is no vendored `changelog-data` to re-export from, and this shape is narrower than the product's anyway:

```ts
/**
 * The demo's changelog, and its own type.
 *
 * Not the engineering changelog. packages/frontend's changelog-data.ts is the
 * project's real commit history rendered as UI copy — thousands of lines of
 * diary, quoting internal hostnames and library names verbatim. Appropriate for
 * an authenticated internal tool; on a public unauthenticated demo it would both
 * leak infrastructure detail and trip scripts/check-bundle.mjs, since the whole
 * module is bundled the moment a panel imports it.
 *
 * So this is a curated executive summary: 8 themed entries distilling the 25
 * CalVer releases (2026.07.0 and 2026.08.0-2026.08.23) into what shipped and why
 * a province should care. The 68 pre-CalVer releases are out of scope by design.
 *
 * Constraint for whoever edits this next: this copy ships in the public bundle,
 * so keep it clear of check-bundle.mjs's FORBIDDEN list — describe what a gate
 * or fix does rather than naming the library it forbids.
 */
export interface DemoRelease {
  /** CalVer, or a range where several small releases are summarised together. */
  version: string;
  /** Human date or range, as displayed. */
  date: string;
  icon: string;
  title: string;
  items: string[];
}

export const DEMO_CHANGELOG: DemoRelease[] = [
  // ... port all 8 entries from changelog-data.filtered.ts verbatim, flattening
  // each entry's single `sections[0]` into icon/title/items and dropping
  // status, statusColor, borderColor and scope.
];
```

**Deriving the entries.** Select by path, then summarise. The cockpit's history is exactly the history of the files Tasks 3-7 moved, so:

```bash
# Everything that touched the cockpit, across the rename. --follow does not
# accept multiple paths, so run it per path and merge, or use the pre-extraction
# paths directly since the move is the last commit in each file's history.
git log --oneline --no-merges -- \
  packages/pa-cockpit \
  packages/frontend/src/pages/PADashboardV2.tsx \
  packages/frontend/src/pages/public-affairs-v2 \
  packages/frontend/src/components/PADashboardV2 \
  packages/frontend/src/services/pa.api.ts \
  packages/frontend/src/services/dossierbeheer.api.ts \
  packages/frontend/src/services/mock-demo.store.ts
```

Then, for each release in `packages/frontend/src/pages/changelog-data.ts` from `2026.07.0` onward, keep only the commits that appear in that list and write **one Dutch entry per release, or per run of small releases**, at the level a province reads: what got better and why it matters. Not the commit subject translated — the commit body says what changed in the code, and this says what changed for the user.

Three rules the existing curated copy already follows and the new copy must keep:

- **Name no internals.** Not the library, not the hostname, not the file. "Een mapping-fout die zonder waarschuwing de helft van de plenaire feed liet wegvallen, is gevonden en gerepareerd" — not the module it lived in.
- **Skip anything with no user-visible effect.** A refactor, a test-only commit, a CI change: out. The changelog is a sales artefact, and padding it with plumbing reads as padding.
- **Summarise runs.** Where several same-week releases each moved one thing, merge them into one entry with a range version (`'2026.08.19–2026.08.21'`), as the current file already does.

The 68 pre-CalVer semantic-version releases stay out of scope, as before.

**Show the drafted entries to the user before writing the file.** This is sales copy in a language the reviewer speaks better than you; a draft in the chat costs nothing and a wrong register costs a rewrite. Do not skip to the implementation because the tests would pass either way — they assert shape, not register.

- [ ] **Step 4: Write the failing panel test**

`DemoChangelogPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoChangelogPanel from './DemoChangelogPanel';
import { DEMO_CHANGELOG } from './changelog.data';

describe('DemoChangelogPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DemoChangelogPanel isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows every release expanded, because eight entries do not need collapsing', () => {
    // The product panel collapses because it carries 90-odd releases. Eight is
    // short enough that a chevron per entry is friction with nothing bought.
    render(<DemoChangelogPanel isOpen onClose={vi.fn()} />);
    for (const release of DEMO_CHANGELOG) {
      expect(screen.getByText(release.title)).toBeVisible();
      expect(screen.getByText(release.items[0])).toBeVisible();
    }
  });

  it('shows no engineering metadata', () => {
    // The whole reason this panel exists rather than the product one.
    const { container } = render(<DemoChangelogPanel isOpen onClose={vi.fn()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Frontend \+ Backend|Full-stack/);
    expect(text).not.toMatch(/GitLab/i);
    expect(container.querySelector('a[href*="git."]')).toBeNull();
  });

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DemoChangelogPanel isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /sluiten/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores body scroll when it closes', () => {
    // The product panel locks body scroll while open; a panel that locks and
    // never unlocks leaves the page dead with no visible cause.
    const { rerender } = render(<DemoChangelogPanel isOpen onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<DemoChangelogPanel isOpen={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run --root packages/pa-demo src/demo/changelog`
Expected: FAIL — cannot resolve `./DemoChangelogPanel`.

- [ ] **Step 6: Write the panel**

A slide-over opened by the shell's existing changelog trigger, rendering a plain vertical list: version and date as a quiet left column, the themed heading with its icon, then the bullets. All entries expanded. `role="dialog"` with `aria-modal`, an overlay that closes on click, Escape to close, and body-scroll lock released on close. Style it with `pac-*` classes in a colocated `changelog.css` — **not** Tailwind, matching Task 8's decision, since `pa-demo` should not need a `content` glob either.

Keep it under ~120 lines. If it grows past that, the design has drifted back toward the product panel.

- [ ] **Step 7: Run**

Run: `npx vitest run --root packages/pa-demo src/demo/changelog`
Expected: all 8 tests pass.

- [ ] **Step 8: Have the user look at it**

This is a deliberate redesign, so behaviour tests cannot tell you whether it reads well. Report: "The demo changelog panel is rebuilt. Please open it from the cockpit header and tell me whether the framing works." Wait for their answer before asking to commit — and expect to iterate here rather than treating first-draft-green as done.

- [ ] **Step 9: Report and ask before committing**

```
feat(pa-demo): give the demo its own changelog panel
```

---

## Task 11: Rewire packages/pa-demo and delete src/vendor

**Files:**

- Delete: `packages/pa-demo/src/vendor/` (entire tree), `packages/pa-demo/src/demo/modes.filtered.ts`, `packages/pa-demo/src/demo/modes.filtered.exports.test.ts`, `packages/pa-demo/src/demo/changelog-data.filtered.exports.test.ts`
- Create: `packages/pa-demo/src/demo/pa-cockpit-host.tsx`, `packages/pa-demo/src/demo/allowed-modes.ts` (+ test)
- Modify: `packages/pa-demo/package.json`, `packages/pa-demo/src/App.tsx`, `packages/pa-demo/vite.config.ts` (drop both `resolve.alias` entries), `packages/pa-demo/src/demo/modes.filtered.test.ts` (retarget), `packages/pa-demo/src/demo/DemoSectionRouter.tsx`, `packages/pa-demo/src/demo/shims/*`

**Interfaces:**

- Consumes: everything the frontend host consumes, with demo implementations.
- Produces: `buildAllowedModes(all: PaModeConfig[]): PaModeConfig[]`.

**`vite.config.ts` warning:** remove the two `resolve.alias` entries **only**. The file also carries the social card's `transformIndexHtml` plugin (`scripts/social-card-origin.ts`), which must survive.

- [ ] **Step 1: Write the allow-list filter and its test**

`packages/pa-demo/src/demo/allowed-modes.ts`:

```ts
/**
 * Narrows the cockpit's mode set to what plato is allowed to show.
 *
 * This is the successor to modes.filtered.ts, and the policy is unchanged —
 * only the mechanism is. The old version worked by aliasing four relative
 * spellings of './modes.config' so Vite resolved them here while tsc resolved
 * them to the real module. That divergence needed its own parity test to catch
 * a name silently becoming undefined. Passing data to a required prop needs
 * none of it.
 */
import type { PaModeConfig } from '@ronl/pa-cockpit';
import { isAllowedSection } from './sections.allow';

export function buildAllowedModes(all: PaModeConfig[]): PaModeConfig[] {
  return all.map((mode) => ({
    ...mode,
    groups: mode.groups
      .map((group) => ({ ...group, items: group.items.filter((i) => isAllowedSection(i.id)) }))
      // A group whose every item was dropped would render as an empty heading.
      .filter((group) => group.items.length > 0),
  }));
}
```

Rename `modes.filtered.test.ts` to `allowed-modes.test.ts` and retarget its assertions at `buildAllowedModes(PA_MODES)`. Its behavioural cases survive; only the import changes. Add:

```ts
it('drops every section on the deny list', () => {
  const ids = buildAllowedModes(PA_MODES).flatMap((m) =>
    m.groups.flatMap((g) => g.items.map((i) => i.id))
  );
  for (const dropped of DROPPED_SECTION_IDS) expect(ids).not.toContain(dropped);
});
```

- [ ] **Step 2: Write the demo host module**

`packages/pa-demo/src/demo/pa-cockpit-host.tsx` — same shape as Task 9's, wired to the existing shims:

```tsx
import { configurePaCockpit, PA_MODES, type PaCockpitHost } from '@ronl/pa-cockpit';
import keycloak, { getUser } from './shims/keycloak';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from './shims/tenant';
import SessionExpiryWarning from './shims/SessionExpiryWarning';
import PADock from './shims/PADock';
import DemoSectionRouter from './DemoSectionRouter';
import DemoChangelogPanel from './DemoChangelogPanel';
import { buildAllowedModes } from './allowed-modes';

configurePaCockpit({
  auth: {
    get authenticated() {
      return keycloak.authenticated;
    },
    get token() {
      return keycloak.token;
    },
    getUser,
    updateToken: (minValidity) => keycloak.updateToken(minValidity),
    logout: async (options) => {
      await keycloak.logout(options);
    },
  },
  tenant: { initializeTenantTheme, loadTenantConfigs, getTenantConfig, getDefaultTenantConfig },
});

export const demoCockpitHost: PaCockpitHost = {
  modes: buildAllowedModes(PA_MODES),
  SectionRouter: DemoSectionRouter,
  Dock: PADock,
  SessionExpiryWarning,
  ChangelogPanel: DemoChangelogPanel,
};
```

- [ ] **Step 3: Create `DemoChangelogPanel`**

`changelog-data.filtered.ts` survives as plain data. Create `packages/pa-demo/src/demo/DemoChangelogPanel.tsx` rendering the _frontend's_ panel component bound to the curated data. Because `ChangelogPanel` stays in `packages/frontend`, copy it into `packages/pa-demo/src/demo/ChangelogPanel.tsx` **only if** it cannot be imported — check first whether a `@ronl/frontend` dependency is acceptable. If not, note it in the report and hand the decision to the user rather than choosing silently; a second vendored file would partly defeat this whole exercise.

- [ ] **Step 4: Delete the vendored tree and the aliases**

```bash
cd packages/pa-demo
git rm -r --quiet src/vendor
git rm --quiet src/demo/modes.filtered.ts src/demo/modes.filtered.exports.test.ts \
                src/demo/changelog-data.filtered.exports.test.ts
```

Then remove both `resolve.alias` entries from `vite.config.ts`, keeping the `transformIndexHtml` plugin and everything else. Remove the `src/vendor/**` entry from `vitest.coverage.exclude` — there is nothing to exclude.

- [ ] **Step 5: Rewire `App.tsx`**

```tsx
import { PADashboardV2 } from '@ronl/pa-cockpit';
import { DemoRoleProvider } from './demo/DemoRoleContext';
import { demoCockpitHost } from './demo/pa-cockpit-host';
import '@ronl/pa-cockpit/styles.css';
import './demo/demo-overrides.css';

export default function App() {
  return (
    <DemoRoleProvider>
      <PADashboardV2 host={demoCockpitHost} />
    </DemoRoleProvider>
  );
}
```

Keep `demo-overrides.css` imported **after** the package styles — both its rules depend on losing no cascade fight, and the dock-toggle rule specifically needs to come after `dashboard-pa.css`.

- [ ] **Step 6: Run, then hand the browser check to the user**

Run: `npm run type-check --workspace=@ronl/pa-demo`, `npm run lint --workspace=@ronl/pa-demo`, `npm test --workspace=@ronl/pa-demo`
Expected: all clean; `src/vendor` gone from `git status`.

Then report to the user: "pa-demo now renders from `@ronl/pa-cockpit` with no vendored copy. Please run `npm run test:e2e --workspace=@ronl/pa-demo` — expected: 11 passed — and confirm the site looks unchanged." Do not run Playwright yourself.

- [ ] **Step 7: Report and ask before committing**

```
refactor(pa-demo): render from @ronl/pa-cockpit and delete the vendored fork
```

---

## Task 12: Retire the drift machinery

**Files:**

- Delete: `packages/pa-demo/scripts/vendor-manifest.mjs`, `vendor-sync.mjs`, `check-drift.mjs`, `check-drift.test.ts`, `.github/workflows/pa-demo-drift.yml`
- Modify: `packages/pa-demo/package.json`, root `package.json`, `.github/workflows/azure-pa-demo-acc.yml`, `.claude/commands/bump-release.md`

- [ ] **Step 1: Delete the scripts and the workflow**

```bash
cd /home/steven/Development/ronl-business-api
git rm --quiet packages/pa-demo/scripts/vendor-manifest.mjs \
               packages/pa-demo/scripts/vendor-sync.mjs \
               packages/pa-demo/scripts/check-drift.mjs \
               packages/pa-demo/scripts/check-drift.test.ts \
               .github/workflows/pa-demo-drift.yml
```

- [ ] **Step 2: Remove the npm scripts**

Delete `vendor:sync` and `vendor:check` from `packages/pa-demo/package.json` and any `vendor:*` passthrough in the root `package.json`.

- [ ] **Step 3: Remove the blocking CI step**

In `.github/workflows/azure-pa-demo-acc.yml`, delete the step named "Vendored copy matches packages/frontend".

- [ ] **Step 4: Remove the re-sync section from `/bump-release`**

Delete the entire **"Vendored-copy re-sync"** subsection from `.claude/commands/bump-release.md`, plus:

- the `packages/pa-demo/src/vendor/pages/changelog-data.ts` exemption sentence in the scope cross-check
- the `packages/pa-demo/**` bullet's "read the re-sync carve-out below first" qualifier, which now has nothing to refer to
- the step-7 reporting bullet about what the re-sync rewrote

- [ ] **Step 5: Prove nothing still references the machinery**

Run:

```bash
grep -rn "vendor:check\|vendor:sync\|src/vendor\|check-drift\|vendor-manifest" \
  --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yml' --include='*.md' \
  packages .github .claude docs | grep -v docs/superpowers
```

Expected: no output. Hits in `docs/superpowers/` are the spec and this plan describing the removal, which is correct.

- [ ] **Step 6: Report and ask before committing**

```
chore: retire the pa-demo vendored-copy drift machinery
```

---

## Task 13: CI path filters, release scoping and docs

**Files:**

- Modify: `.github/workflows/azure-frontend-acc.yml`, `azure-frontend-prod.yml`, `azure-pa-demo-acc.yml`, `azure-pa-demo-prod.yml`, `.claude/commands/bump-release.md`, `docs/PA-DEMO-GO-LIVE.md`

- [ ] **Step 1: Add the path filter to all four deploy workflows**

Add `- 'packages/pa-cockpit/**'` to each `paths:` list. The package is not deployed on its own, so a change to it must rebuild **both** apps — the same reasoning `packages/shared/**` already carries in the frontend and backend workflows.

- [ ] **Step 2: Add the scope mapping to `/bump-release`**

In the step-2 touched-dirs map, add:

```
- `packages/pa-cockpit/**` → include **both** `'frontend'` and `'pa-demo'` (the
  package is compiled into both apps and deployed on its own by neither; same
  rule `packages/shared/**` already follows for frontend + backend)
```

**No new `ScopeTag`.** Do not add `'pa-cockpit'` to `packages/frontend/src/pages/changelog-data.ts`.

- [ ] **Step 3: Update `docs/PA-DEMO-GO-LIVE.md`**

Delete the "The drift workflow" subsection (§4). In §4's workflow table, remove the drift row. In §5, the four no-Live layers are unchanged in substance, but the bundle-gate and CSP descriptions should no longer refer to a vendored tree.

- [ ] **Step 4: Re-measure the test counts and report them**

Run each suite and record real numbers — `--reporter=json --outputFile=…` rather than a grep for `it(`, which miscounts parameterised cases:

```bash
npm test --workspace=@ronl/frontend
npm test --workspace=@ronl/pa-cockpit
npm test --workspace=@ronl/pa-demo
```

Expected: frontend + pa-cockpit together account for at least the 1162 tests frontend carried before, and pa-demo for at least 86. A _drop_ means a test file was lost in a move — find it before proceeding.

Report the three figures to the user for the `iou-architectuur` testing docs, which are already stale on a separate count and need a re-measure pass there. Do not edit that repo from here.

- [ ] **Step 5: Full verification**

```bash
npm run format && npm run check-format
npm run lint
npm run type-check
npm test --workspace=@ronl/frontend
npm test --workspace=@ronl/pa-cockpit
npm test --workspace=@ronl/pa-demo
npm run build --workspace=@ronl/pa-demo
npm run build --workspace=@ronl/frontend
```

Expected: all clean, both builds passing, and pa-demo's build still passing its bundle gate.

Then hand off the E2E check: "Please run `npm run test:e2e --workspace=@ronl/pa-demo` — expected: 11 passed."

- [ ] **Step 6: Report and ask before committing**

```
chore: wire packages/pa-cockpit into CI path filters and release scoping
```

---

## Self-Review

**Spec coverage.** §1 (why the fork goes) → Tasks 3–7 and 11. §2 (the five seams) → Tasks 2, 7, 9, 11. §3 (changelog injected) → Tasks 7 and 9 inject it; Task 10 supplies the demo's own. §4 (modes as a required prop) → Task 6, Task 7 Step 3, Task 11 Step 1. §5 (host contract, split by React vs non-React) → Tasks 2 and 7. §6 (package shape) → Task 1; the Tailwind decision → Task 8. §7 (32 test files move, 2 stay) → Tasks 3–7 move them, Task 13 Step 4 verifies the count did not drop. §8 (deletion checklist) → Tasks 11 and 12. §9 (CI filters, no new `ScopeTag`) → Task 13. §10 (risk) → the move-don't-rewrite constraint in Global Constraints, plus Task 13's count check.

**The spec's one open question is now closed.** §3 kept `ChangelogPanel` in `packages/frontend`, which left `pa-demo` needing a panel component it could not import without either taking a `@ronl/frontend` dependency or copying a file — the second of which would have left a single vendored file behind and partly defeated the exercise. The user resolved it: neither. Task 10 builds a purpose-built demo panel whose data is re-derived by filtering the cockpit's own commit history and summarising it in Dutch. That is a better outcome than the spec anticipated, since the product panel's engineering metadata — SHAs, authors, scope badges, a repo link — was never right for this audience.

**Task ordering.** Tasks 3–7 leave `packages/frontend` un-type-checkable until Task 9 repairs it. That is stated in Task 3 Step 3 so an implementer does not try to fix it early and fight the migration. Task 10 must precede Task 11, which imports `DemoChangelogPanel`.

**Type consistency.** `PaTenantConfig` has the same single-field shape in Tasks 2, 7 and 9. `PaCockpitHost`'s five members are named `modes`, `SectionRouter`, `Dock`, `SessionExpiryWarning`, `ChangelogPanel` identically in Tasks 7, 9 and 11. `configurePaCockpit({ auth, tenant })` is identical in Tasks 2, 4, 7, 9 and 11. `buildAllowedModes` appears only in Task 11; `DEMO_CHANGELOG` and `DemoRelease` only in Task 10.

**Two places the plan expects iteration rather than first-draft-green.** Task 8 Step 5 (does Meldingen still look right after the Tailwind conversion) and Task 10 Steps 3 and 8 (is the Dutch copy at the right register, does the rebuilt panel read well). Both hand off to the user by design: behaviour tests assert shape, not whether something reads well.
