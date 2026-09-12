# Public mock-only PA Cockpit (plato.open-regels.nl) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/pa-demo`, a mock-only PA Cockpit on an unauthenticated public site at `plato.open-regels.nl`, with no option to switch to Live.

**Architecture:** A standalone Vite + React package holding a **byte-identical vendored copy** of the cockpit from `packages/frontend`, whose external imports resolve through Vite/tsconfig path aliases to demo-owned shims. Nothing inside `src/vendor/` is ever edited, so the copy can be deleted wholesale once `@ronl/pa-cockpit` is extracted. All demo-specific behaviour — auth shim, section allow-list, role switcher, two new Beheer pages — lives in `src/demo/`, which survives that extraction.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Vitest + jsdom, Playwright, Azure Static Web Apps.

**Spec:** `docs/superpowers/specs/2026-08-24-public-pa-cockpit-design.md`

## Global Constraints

- **Never edit a file under `src/vendor/`.** Every adaptation is an alias to `src/demo/`. A vendored file that needs changing means the alias map is wrong.
- **Red before green.** Every test must be observed failing for the intended reason before the implementation is written. Negative assertions (no backend origin, no auth library, mock cannot be flipped) pass vacuously when wrong — for those, the step says exactly what to break to see red, and to restore it after.
- **Colocate tests:** `foo.tsx` → `foo.test.tsx`, next to the source. No `__tests__/` or `tests/` directories.
- **Vitest environment:** `jsdom` by default for this package (matching `public-site`), `globals: true`.
- **Coverage excludes `src/vendor/**`.\*\* Those files are covered by the frontend suite's 1155 tests.
- **No network.** `pa-demo` issues no HTTP request. `VITE_API_URL` must not appear in any env file.
- **`VITE_PA_AGENDA_MOCK=true`** in every env file — `fetchAgenda` sits outside the unified mock switch and otherwise calls `paGet('/pa/agenda')`.
- **Package name:** `@ronl/pa-demo`. **Dev port:** `5176` (5173 frontend, 5175 public-site are taken).
- **Prettier:** run `npx prettier --write` on touched files before every commit; the pre-commit hook enforces it.
- **Commit style:** conventional commits, imperative subject, no scope invented beyond `pa-demo`.

---

## File Structure

**Created — package scaffolding**

| File                                  | Responsibility                                       |
| ------------------------------------- | ---------------------------------------------------- |
| `packages/pa-demo/package.json`       | Workspace manifest, scripts, deps                    |
| `packages/pa-demo/tsconfig.json`      | Compiler options + the vendor alias map              |
| `packages/pa-demo/tsconfig.node.json` | Config-file project reference                        |
| `packages/pa-demo/.eslintrc.cjs`      | Lint rules (copy of public-site's)                   |
| `packages/pa-demo/vite.config.ts`     | Plugins, `__APP_VERSION__`, alias map, Vitest config |
| `packages/pa-demo/index.html`         | Vite entry document                                  |
| `packages/pa-demo/src/test/setup.ts`  | `@testing-library/jest-dom/vitest`                   |
| `packages/pa-demo/src/vite-env.d.ts`  | `__APP_VERSION__` + `VITE_*` types                   |

**Created — vendoring tooling**

| File                                           | Responsibility                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/pa-demo/scripts/vendor-manifest.mjs` | The single list of 38 vendored files; imported by both scripts below     |
| `packages/pa-demo/scripts/vendor-sync.mjs`     | Copies those files from `packages/frontend` into `src/vendor/`           |
| `packages/pa-demo/scripts/check-drift.mjs`     | Diffs `src/vendor/` against origin; exits non-zero on divergence         |
| `packages/pa-demo/scripts/check-drift.test.ts` | Proves the drift check detects a changed file                            |
| `packages/pa-demo/src/vendor/README.md`        | States the fork is temporary; names the extraction as its exit condition |

**Created — demo-owned source (survives the extraction)**

| File                                      | Responsibility                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `src/demo/shims/keycloak.ts`              | Synthetic `KeycloakUser`; `getUser()`; role mutation                           |
| `src/demo/shims/tenant.ts`                | Static Flevoland `TenantConfig`; no-op theme init                              |
| `src/demo/shims/SessionExpiryWarning.tsx` | Renders nothing                                                                |
| `src/demo/shims/PADock.tsx`               | Renders nothing (the real one pulls in `McpChatSection` → `businessApi`)       |
| `src/demo/sections.allow.ts`              | Allow-listed section ids                                                       |
| `src/demo/modes.filtered.ts`              | Re-exports `PA_MODES` / `allStaticSections` / `findPaModeForSection`, filtered |
| `src/demo/DemoRoleContext.tsx`            | Selected role state; writes it into the shim's `roles`                         |
| `src/demo/DemoSectionRouter.tsx`          | Section dispatch for the allow-listed sections                                 |
| `src/demo/Profiel.tsx`                    | PA-native profile page                                                         |
| `src/demo/RollenRechten.tsx`              | PA-native roles page, explains the switcher                                    |
| `src/demo/DemoBar.tsx`                    | Persistent role selector + reset + disclaimer                                  |
| `src/App.tsx`                             | Shell: providers, demo bar, cockpit                                            |
| `src/main.tsx`                            | Forces mock mode, then mounts                                                  |

**Created — deployment & guarantees**

| File                                                                        | Responsibility                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/pa-demo/public/staticwebapp.config.json`                          | SWA routing + CSP with no backend origin          |
| `packages/pa-demo/src/staticwebapp-csp.test.ts`                             | Asserts `connect-src` names no backend            |
| `packages/pa-demo/scripts/check-bundle.mjs`                                 | Build gate: no auth library, no backend origin    |
| `packages/pa-demo/scripts/check-bundle.test.ts`                             | Proves the gate catches each forbidden class      |
| `packages/pa-demo/.env.development` / `.env.acceptance` / `.env.production` | Mock flags + `VITE_SITE_URL`                      |
| `packages/pa-demo/e2e/playwright.config.ts`                                 | Self-contained Playwright config                  |
| `packages/pa-demo/e2e/plato-demo.spec.ts`                                   | The demo journey                                  |
| `.github/workflows/azure-pa-demo-acc.yml`                                   | `acc` → `acc.plato.open-regels.nl`                |
| `.github/workflows/azure-pa-demo-prod.yml`                                  | `main` → `plato.open-regels.nl`                   |
| `.github/workflows/pa-demo-drift.yml`                                       | Annotates drift on `packages/frontend/**` changes |

**Modified**

| File                  | Change                                        |
| --------------------- | --------------------------------------------- |
| `package.json` (root) | Add `dev:pa-demo` and `build:pa-demo` scripts |

---

## Task 1: Scaffold the package

**Files:**

- Create: `packages/pa-demo/package.json`, `tsconfig.json`, `tsconfig.node.json`, `.eslintrc.cjs`, `vite.config.ts`, `index.html`, `src/vite-env.d.ts`, `src/test/setup.ts`
- Test: `packages/pa-demo/src/scaffold.test.ts`

**Interfaces:**

- Produces: a workspace named `@ronl/pa-demo` whose `npm test`, `npm run lint` and `npm run type-check` all run. Later tasks add files under `src/`.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/src/scaffold.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('pa-demo scaffold', () => {
  it('injects the build version as a global', () => {
    // mock-demo.store stamps persisted state with this; without it the store
    // falls back to 'dev' and a release would not reset a visitor's demo.
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
  });

  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts`
Expected: FAIL — `Cannot find module 'packages/pa-demo/vite.config.ts'` (the config does not exist yet).

- [ ] **Step 3: Create `packages/pa-demo/package.json`**

```json
{
  "name": "@ronl/pa-demo",
  "version": "2026.08.24",
  "description": "Public mock-only PA Cockpit demo — plato.open-regels.nl",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build --mode production && node scripts/check-bundle.mjs",
    "build:acc": "tsc && vite build --mode acceptance && node scripts/check-bundle.mjs",
    "build:prod": "tsc && vite build --mode production && node scripts/check-bundle.mjs",
    "preview": "vite preview --port 5176",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "test:e2e": "playwright test --config=e2e/playwright.config.ts",
    "vendor:sync": "node scripts/vendor-sync.mjs",
    "vendor:check": "node scripts/check-drift.mjs"
  },
  "dependencies": {
    "@ronl/shared": "*",
    "axios": "^1.7.9",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-markdown": "^9.0.1",
    "react-router-dom": "^6.21.1",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "@vitejs/plugin-react": "^5.2.0",
    "@vitest/coverage-v8": "^4.1.9",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "jsdom": "^29.1.1",
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "vitest": "^4.1.9"
  }
}
```

Note: `react-markdown` and `remark-gfm` are required because vendored `MdEditor.tsx` and other cockpit components render Markdown. Verify the exact versions against `packages/frontend/package.json` before committing — they must match, or the vendored copy compiles against a different API than its origin.

- [ ] **Step 4: Create `packages/pa-demo/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

The alias `paths` block is added in Task 3, once the shims it points at exist.

- [ ] **Step 5: Create `packages/pa-demo/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `packages/pa-demo/.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  // src/vendor is a byte-identical copy of packages/frontend and is linted
  // there. Linting it here would produce findings that cannot be fixed
  // without editing a vendored file, which this package forbids.
  ignorePatterns: ['dist', '.eslintrc.cjs', 'src/vendor'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
```

- [ ] **Step 7: Create `packages/pa-demo/vite.config.ts`**

```ts
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Stamped onto the mock demo store's persisted state, so shipping a release
// with changed fixtures resets every visitor instead of leaving them on a
// browser copy of the previous ones.
const pkgVersion = (createRequire(import.meta.url)('./package.json') as { version: string })
  .version;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  server: {
    port: 5176,
    host: '0.0.0.0',
  },
  // @ronl/shared compiles to CommonJS for its Node consumer. Vite does not
  // apply CJS→ESM interop to workspace-linked packages unless they are in the
  // dependency optimizer, so named value imports fail in the browser without
  // this. Copied from packages/frontend/vite.config.ts, where the same two
  // settings were needed for the same reason.
  optimizeDeps: {
    include: ['@ronl/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/shared\/dist/, /node_modules/],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      // src/vendor is covered by the frontend suite. Counting it here would
      // inflate this package's figures with work done elsewhere and make the
      // fork look well-tested while demo-owned code hid behind it.
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/vendor/**',
      ],
    },
  },
});
```

- [ ] **Step 8: Create the remaining scaffold files**

`packages/pa-demo/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`packages/pa-demo/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_PA_DOSSIERS_MOCK?: string;
  readonly VITE_PA_SIGNALS_MOCK?: string;
  readonly VITE_PA_AGENDA_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`packages/pa-demo/index.html`:

```html
<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index, follow" />
    <title>PA-Cockpit demo — Open Regels Nederland</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Install and run the test**

Run: `npm install` (from the repo root — `workspaces: ["packages/*"]` picks the new package up automatically), then:
`npx vitest run --config packages/pa-demo/vite.config.ts`
Expected: PASS, 2 tests.

If `__APP_VERSION__` is reported as undefined, the `define` block is not being applied — check that the test is run with `--config packages/pa-demo/vite.config.ts` and not the repo-root default.

- [ ] **Step 10: Commit**

```bash
npx prettier --write "packages/pa-demo/**/*.{ts,tsx,json}"
git add packages/pa-demo package-lock.json
git commit -m "feat(pa-demo): scaffold the package"
```

---

## Task 2: Vendor sync and drift check

**Files:**

- Create: `packages/pa-demo/scripts/vendor-manifest.mjs`, `scripts/vendor-sync.mjs`, `scripts/check-drift.mjs`, `scripts/check-drift.test.ts`, `src/vendor/README.md`
- Test: `packages/pa-demo/scripts/check-drift.test.ts`

**Interfaces:**

- Produces: `VENDORED_FILES` (array of repo-relative source paths), `syncVendor()`, `findDrift(): Promise<{file, status}[]>` where `status` is `'changed' | 'missing'`. Task 11's drift workflow calls `findDrift`.

Copying is script-driven rather than manual so that the same file list defines both the copy and the drift check — a manually copied file that nobody recorded would be invisible to the check.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/scripts/check-drift.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareTrees } from './check-drift.mjs';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function fixture(): Promise<{ origin: string; vendor: string }> {
  dir = await mkdtemp(path.join(tmpdir(), 'drift-'));
  const origin = path.join(dir, 'origin');
  const vendor = path.join(dir, 'vendor');
  await mkdir(origin, { recursive: true });
  await mkdir(vendor, { recursive: true });
  return { origin, vendor };
}

describe('compareTrees', () => {
  it('reports nothing when the copy is byte-identical', async () => {
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 1;\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    expect(await compareTrees(origin, vendor, ['a.ts'])).toEqual([]);
  });

  it('reports a file whose origin has changed', async () => {
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 2;\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    const drift = await compareTrees(origin, vendor, ['a.ts']);
    expect(drift).toEqual([{ file: 'a.ts', status: 'changed' }]);
  });

  it('reports a file that was never vendored', async () => {
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'b.ts'), 'export const b = 1;\n');
    const drift = await compareTrees(origin, vendor, ['b.ts']);
    expect(drift).toEqual([{ file: 'b.ts', status: 'missing' }]);
  });

  it('ignores a trailing-newline difference nowhere and reports it as drift', async () => {
    // Byte-identical means byte-identical. A formatter that rewrites the origin
    // is real drift, because the next sync would bring the change across.
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 1;\n\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    expect(await compareTrees(origin, vendor, ['a.ts'])).toEqual([
      { file: 'a.ts', status: 'changed' },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts scripts/check-drift`
Expected: FAIL — `Failed to resolve import "./check-drift.mjs"`.

- [ ] **Step 3: Create `packages/pa-demo/scripts/vendor-manifest.mjs`**

```js
/**
 * The single source of truth for what is vendored.
 *
 * Paths are relative to packages/frontend/src on the origin side and to
 * packages/pa-demo/src/vendor on the copy side, so the two trees mirror each
 * other exactly and a diff needs no path translation.
 *
 * Deliberately absent:
 *   components/PADashboardV2/PASectionRouter.tsx — the only carrier of the six
 *     ../CaseworkerDashboard/* imports, and section curation is what differs
 *     here. Replaced by src/demo/DemoSectionRouter.tsx.
 *   components/PADashboardV2/PADock.tsx — imports McpChatSection, which pulls
 *     in businessApi and would fire real LLM calls from a public page.
 *     Replaced by src/demo/shims/PADock.tsx.
 */
export const VENDORED_FILES = [
  'services/pa.api.ts',
  'services/dossierbeheer.api.ts',
  'services/mock-demo.store.ts',
  'pages/PADashboardV2.tsx',
  'pages/ChangelogPanel.tsx',
  'pages/changelog-data.ts',
  'pages/public-affairs-v2/AgendaView.tsx',
  'pages/public-affairs-v2/dashboard-pa.css',
  'pages/public-affairs-v2/dossierbeheer.css',
  'pages/public-affairs-v2/dossierbeheer.data.ts',
  'pages/public-affairs-v2/FeitenCijfers.tsx',
  'pages/public-affairs-v2/feiten.data.ts',
  'pages/public-affairs-v2/Issuekaart.tsx',
  'pages/public-affairs-v2/Kompas.tsx',
  'pages/public-affairs-v2/modes.config.ts',
  'pages/public-affairs-v2/Monitoring.tsx',
  'pages/public-affairs-v2/NotificationsPanel.tsx',
  'pages/public-affairs-v2/PaDataProvider.tsx',
  'pages/public-affairs-v2/pa.data.ts',
  'pages/public-affairs-v2/Vandaag.tsx',
  'pages/public-affairs-v2/Voortgang.tsx',
  'components/PADashboardV2/BronnenSection.tsx',
  'components/PADashboardV2/CuratiePijplijnFlow.tsx',
  'components/PADashboardV2/CuratieSpecSection.tsx',
  'components/PADashboardV2/KompasSpecSection.tsx',
  'components/PADashboardV2/NotificatiesSection.tsx',
  'components/PADashboardV2/PACommandPalette.tsx',
  'components/PADashboardV2/PANoAccessPanel.tsx',
  'components/PADashboardV2/WatchBell.tsx',
  'components/PADashboardV2/ZoekcriteriaSection.tsx',
  'components/PADashboardV2/dossierbeheer/ArchiveDialog.tsx',
  'components/PADashboardV2/dossierbeheer/DeleteDialog.tsx',
  'components/PADashboardV2/dossierbeheer/Dossierbeheer.tsx',
  'components/PADashboardV2/dossierbeheer/DossierEditor.tsx',
  'components/PADashboardV2/dossierbeheer/DossierRow.tsx',
  'components/PADashboardV2/dossierbeheer/KompasScorer.tsx',
  'components/PADashboardV2/dossierbeheer/MdEditor.tsx',
  'components/PADashboardV2/dossierbeheer/TemplateGallery.tsx',
];

export const ORIGIN_ROOT = '../frontend/src';
export const VENDOR_ROOT = './src/vendor';
```

- [ ] **Step 4: Create `packages/pa-demo/scripts/check-drift.mjs`**

```js
/**
 * Reports files whose vendored copy no longer matches packages/frontend.
 *
 * Byte-for-byte, deliberately: the whole value of this fork is that the copy
 * is unmodified, so the eventual @ronl/pa-cockpit extraction is a directory
 * deletion rather than a merge. Any difference at all is worth naming.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED_FILES, ORIGIN_ROOT, VENDOR_ROOT } from './vendor-manifest.mjs';

export async function compareTrees(originDir, vendorDir, files) {
  const drift = [];
  for (const rel of files) {
    let origin;
    try {
      origin = await readFile(path.join(originDir, rel), 'utf-8');
    } catch {
      // The origin file is gone — it was renamed or deleted upstream.
      drift.push({ file: rel, status: 'changed' });
      continue;
    }
    let copy;
    try {
      copy = await readFile(path.join(vendorDir, rel), 'utf-8');
    } catch {
      drift.push({ file: rel, status: 'missing' });
      continue;
    }
    if (origin !== copy) drift.push({ file: rel, status: 'changed' });
  }
  return drift;
}

export async function findDrift() {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return compareTrees(
    path.resolve(pkgDir, ORIGIN_ROOT),
    path.resolve(pkgDir, VENDOR_ROOT),
    VENDORED_FILES
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const drift = await findDrift();
  if (drift.length) {
    console.error(`${drift.length} vendored file(s) diverged from packages/frontend:`);
    for (const d of drift) console.error(`  ${d.status.padEnd(8)} ${d.file}`);
    console.error('\nRun `npm run vendor:sync --workspace=@ronl/pa-demo` to re-copy,');
    console.error('then re-run the pa-demo suite — a cockpit change may need a demo change.');
    process.exitCode = 1;
  } else {
    console.log(`All ${VENDORED_FILES.length} vendored files match packages/frontend.`);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts scripts/check-drift`
Expected: PASS, 4 tests.

- [ ] **Step 6: Create `packages/pa-demo/scripts/vendor-sync.mjs`**

```js
/**
 * Copies the manifest's files from packages/frontend into src/vendor,
 * unmodified. Run it to create the fork and to re-sync during the window
 * before @ronl/pa-cockpit is extracted.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED_FILES, ORIGIN_ROOT, VENDOR_ROOT } from './vendor-manifest.mjs';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originDir = path.resolve(pkgDir, ORIGIN_ROOT);
const vendorDir = path.resolve(pkgDir, VENDOR_ROOT);

let copied = 0;
for (const rel of VENDORED_FILES) {
  const src = path.join(originDir, rel);
  const dest = path.join(vendorDir, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(src));
  copied += 1;
}
console.log(`Vendored ${copied} files from ${ORIGIN_ROOT} into ${VENDOR_ROOT}.`);
```

- [ ] **Step 7: Create `packages/pa-demo/src/vendor/README.md`**

```markdown
# Vendored copy — temporary by design

These files are byte-identical copies from `packages/frontend/src`, listed in
`../../scripts/vendor-manifest.mjs`. **Never edit anything in this directory.**
Every adaptation lives in `src/demo/` and is wired up through the alias maps in
`vite.config.ts` and `tsconfig.json`.

They exist because `pa-demo` was built before `@ronl/pa-cockpit` was extracted
from `packages/frontend` — deliberately, so that the extraction's interface
could be designed against a real second consumer rather than guessed at.

**Exit condition:** when `@ronl/pa-cockpit` exists and `pa-demo` depends on it,
delete this directory, `../../scripts/vendor-*.mjs`, `../../scripts/check-drift.*`
and `.github/workflows/pa-demo-drift.yml`. Nothing under `src/demo/` changes.

Re-sync with `npm run vendor:sync --workspace=@ronl/pa-demo`; check for
divergence with `npm run vendor:check --workspace=@ronl/pa-demo`.
```

- [ ] **Step 8: Run the sync and verify the check is clean**

```bash
npm run vendor:sync --workspace=@ronl/pa-demo
npm run vendor:check --workspace=@ronl/pa-demo
```

Expected: `Vendored 38 files…` then `All 38 vendored files match packages/frontend.`

- [ ] **Step 9: Observe the drift check going red for the right reason**

The check is a negative assertion against real files — it must be seen to fail:

```bash
printf '\n// drift probe\n' >> packages/pa-demo/src/vendor/services/pa.api.ts
npm run vendor:check --workspace=@ronl/pa-demo
```

Expected: exit 1, naming `changed  services/pa.api.ts`. Then restore:

```bash
npm run vendor:sync --workspace=@ronl/pa-demo
npm run vendor:check --workspace=@ronl/pa-demo
```

Expected: clean again.

- [ ] **Step 10: Commit**

```bash
npx prettier --write "packages/pa-demo/scripts/**/*.{mjs,ts}" "packages/pa-demo/src/vendor/README.md"
git add packages/pa-demo
git commit -m "feat(pa-demo): vendor the cockpit with a manifest-driven sync and drift check"
```

---

## Task 3: The shims and the alias map

**Files:**

- Create: `src/demo/shims/keycloak.ts`, `src/demo/shims/tenant.ts`, `src/demo/shims/SessionExpiryWarning.tsx`, `src/demo/shims/PADock.tsx`
- Modify: `packages/pa-demo/vite.config.ts` (add `resolve.alias`), `packages/pa-demo/tsconfig.json` (add `compilerOptions.paths`)
- Test: `src/demo/shims/keycloak.test.ts`

**Interfaces:**

- Consumes: `KeycloakUser` from `@ronl/shared`.
- Produces:
  - `getUser(): KeycloakUser` — the synthetic user, reflecting the currently selected PA role
  - `setDemoRoles(paRole: string | null): void` — replaces the PA role in `roles`; `null` means no dossier role
  - `default` export — a Keycloak-shaped object with `token`, `authenticated`, `login()`, `logout()`, `updateToken()`
  - Task 5's `DemoRoleContext` calls `setDemoRoles`; Task 4's filtered modes and Task 6's router consume `getUser()`.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/src/demo/shims/keycloak.test.ts`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { getUser, setDemoRoles } from './keycloak';

describe('demo keycloak shim', () => {
  beforeEach(() => setDemoRoles('pa-admin'));

  it('carries the two claims the cockpit gates on', () => {
    // PADashboardV2 gates on the public-affairs realm role AND province
    // org-type; without both, the visitor lands on PANoAccessPanel.
    const user = getUser();
    expect(user.roles).toContain('public-affairs');
    expect(user.organisation_type).toBe('province');
  });

  it('is scoped to Flevoland so the tenant theme resolves', () => {
    expect(getUser().municipality).toBe('flevoland');
  });

  it('swaps the PA role without disturbing public-affairs', () => {
    setDemoRoles('pa-editor');
    const user = getUser();
    expect(user.roles).toContain('pa-editor');
    expect(user.roles).not.toContain('pa-admin');
    expect(user.roles).toContain('public-affairs');
  });

  it('supports having no dossier role at all', () => {
    setDemoRoles(null);
    const roles = getUser().roles;
    expect(roles).toEqual(['public-affairs']);
  });

  it('never exposes a real token', () => {
    // The bundle gate forbids keycloak-js; this asserts the shim's own shape
    // so nothing downstream can mistake it for an authenticated session.
    expect(getUser().sub).toBe('demo-pa-001');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/shims/keycloak`
Expected: FAIL — `Failed to resolve import "./keycloak"`.

- [ ] **Step 3: Create `src/demo/shims/keycloak.ts`**

```ts
/**
 * Stands in for packages/frontend/src/services/keycloak.
 *
 * plato is unauthenticated, so there is no token, no realm and no login. The
 * cockpit reads its user through getUser() and derives permissions from
 * user.roles — see deriveDossierRole in dossierbeheer.data.ts — so switching
 * the demo's role means rewriting this array rather than patching components.
 * That is also how it works in production, which is why the vendored
 * permission UI needs no changes.
 */
import type { KeycloakUser } from '@ronl/shared';

/** The realm role the whole cockpit is gated on; always present. */
const BASE_ROLES = ['public-affairs'];

let paRole: string | null = 'pa-admin';

export function setDemoRoles(next: string | null): void {
  paRole = next;
}

export function getUser(): KeycloakUser {
  return {
    sub: 'demo-pa-001',
    name: 'Marieke de Vries',
    email: 'm.devries@demo.open-regels.nl',
    preferred_username: 'm.devries',
    employeeId: 'FL-2291',
    municipality: 'flevoland',
    organisation_type: 'province',
    loa: 'substantial',
    roles: paRole ? [...BASE_ROLES, paRole] : [...BASE_ROLES],
  } as KeycloakUser;
}

/**
 * The vendored shell imports keycloak's default export and calls into it on
 * mount and on session events. Every method is a no-op that keeps the shell's
 * happy path: authenticated, never expiring, never redirecting.
 */
const keycloak = {
  authenticated: true,
  token: '',
  tokenParsed: {},
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  updateToken: () => Promise.resolve(false),
  isTokenExpired: () => false,
};

export default keycloak;
```

Before writing this, run `grep -n "keycloak\." packages/pa-demo/src/vendor/pages/PADashboardV2.tsx` and confirm every member the shell touches is present above. Add any that are missing as no-ops — a missing member is a runtime `TypeError`, not a type error, because the shell reads it off the default export.

- [ ] **Step 4: Create the remaining three shims**

`src/demo/shims/tenant.ts`:

```ts
/**
 * Stands in for packages/frontend/src/services/tenant.
 *
 * The real module fetches tenant configuration and applies a CSS-variable
 * theme. plato is single-tenant and offline, so the Flevoland config is a
 * literal and theme initialisation is a no-op — the vendored dashboard-pa.css
 * already carries the PA-Cockpit chrome.
 */
export interface TenantConfig {
  id: string;
  displayName: string;
  organisationType: string;
}

const FLEVOLAND: TenantConfig = {
  id: 'flevoland',
  displayName: 'Provincie Flevoland',
  organisationType: 'province',
};

export function getTenantConfig(_id?: string): TenantConfig {
  return FLEVOLAND;
}

export function getDefaultTenantConfig(): TenantConfig {
  return FLEVOLAND;
}

export function loadTenantConfigs(): Promise<TenantConfig[]> {
  return Promise.resolve([FLEVOLAND]);
}

export function initializeTenantTheme(_municipality?: string): void {
  // no-op: the theme ships in the vendored CSS
}
```

Check the real module's exported surface first with
`grep -n "^export" packages/frontend/src/services/tenant.ts` and match it — the vendored shell imports four named members plus the `TenantConfig` type, but other vendored files may import more.

`src/demo/shims/SessionExpiryWarning.tsx`:

```tsx
/**
 * Stands in for packages/frontend/src/components/SessionExpiryWarning.
 * There is no session to expire on a public demo.
 */
export default function SessionExpiryWarning(): null {
  return null;
}
```

`src/demo/shims/PADock.tsx`:

```tsx
/**
 * Stands in for the vendored PADock, which is deliberately not copied: it
 * imports McpChatSection from components/CaseworkerDashboard, which pulls in
 * businessApi and would fire real MCP/LLM calls from a public page.
 */
export default function PADock(): null {
  return null;
}
```

- [ ] **Step 5: Wire the alias map into `vite.config.ts`**

Add to the config object returned by `defineConfig`, after `plugins`:

```ts
  resolve: {
    alias: [
      // src/vendor is byte-identical to packages/frontend, so its imports are
      // written against that tree. These entries redirect the handful that
      // reach outside the cockpit, which is what lets the copy stay unedited.
      {
        find: /^(\.\.\/)+services\/keycloak$/,
        replacement: fileURLToPath(new URL('./src/demo/shims/keycloak.ts', import.meta.url)),
      },
      {
        find: /^(\.\.\/)+services\/tenant$/,
        replacement: fileURLToPath(new URL('./src/demo/shims/tenant.ts', import.meta.url)),
      },
      {
        find: /^(\.\.\/)+components\/SessionExpiryWarning$/,
        replacement: fileURLToPath(
          new URL('./src/demo/shims/SessionExpiryWarning.tsx', import.meta.url)
        ),
      },
      {
        find: /^(\.\.\/)+components\/PADashboardV2\/PADock$/,
        replacement: fileURLToPath(new URL('./src/demo/shims/PADock.tsx', import.meta.url)),
      },
      {
        find: /^(\.\.\/)+components\/PADashboardV2\/PASectionRouter$/,
        replacement: fileURLToPath(
          new URL('./src/demo/DemoSectionRouter.tsx', import.meta.url)
        ),
      },
      {
        find: /(\.\.\/)*public-affairs-v2\/modes\.config$/,
        replacement: fileURLToPath(new URL('./src/demo/modes.filtered.ts', import.meta.url)),
      },
    ],
  },
```

Regex aliases are used rather than string ones because the same module is imported at different depths — `../services/keycloak` from `pages/`, `../../services/keycloak` from `components/PADashboardV2/`, `../../../services/keycloak` from `dossierbeheer/`. A plain string alias would only catch one depth and the others would resolve to a non-existent path.

The last two entries point at files created in Tasks 4 and 6. Until those exist the dev server will fail to resolve them; that is expected and is fixed by the end of Task 6.

- [ ] **Step 6: Mirror the alias map into `tsconfig.json`**

Vite's `resolve.alias` governs bundling; `tsc --noEmit` needs the same mapping or `npm run type-check` fails. Add to `compilerOptions`:

```json
    "baseUrl": ".",
    "paths": {
      "*/services/keycloak": ["src/demo/shims/keycloak.ts"],
      "*/services/tenant": ["src/demo/shims/tenant.ts"],
      "*/components/SessionExpiryWarning": ["src/demo/shims/SessionExpiryWarning.tsx"],
      "*/components/PADashboardV2/PADock": ["src/demo/shims/PADock.tsx"],
      "*/components/PADashboardV2/PASectionRouter": ["src/demo/DemoSectionRouter.tsx"],
      "*/public-affairs-v2/modes.config": ["src/demo/modes.filtered.ts"]
    }
```

TypeScript `paths` does not apply to relative specifiers. If `npm run type-check` still resolves the vendored relative imports to the real files, fall back to declaring the shims at the vendored paths instead — create `src/vendor/services/keycloak.ts` as a **re-export** (`export * from '../../demo/shims/keycloak'; export { default } from '../../demo/shims/keycloak';`) and add it to the manifest's exclusion comment. Record which approach worked in `src/vendor/README.md`, because it changes what the extraction has to undo.

- [ ] **Step 7: Run the shim test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/shims/keycloak`
Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
npx prettier --write "packages/pa-demo/src/demo/**/*.{ts,tsx}" packages/pa-demo/vite.config.ts packages/pa-demo/tsconfig.json
git add packages/pa-demo
git commit -m "feat(pa-demo): add the auth, tenant and dock shims behind an alias map"
```

---

## Task 4: The section allow-list and filtered modes

**Files:**

- Create: `src/demo/sections.allow.ts`, `src/demo/modes.filtered.ts`
- Test: `src/demo/modes.filtered.test.ts`

**Interfaces:**

- Consumes: `PA_MODES`, `allStaticSections`, `findPaModeForSection`, and the `PaMode` / `PaRailItem` / `PaModeId` types from `src/vendor/pages/public-affairs-v2/modes.config`.
- Produces: the same four names, filtered. Every vendored consumer reaches these through the alias added in Task 3.

This is the deny-by-default boundary. It is applied at the modes module rather than in the router because `PACommandPalette` calls `allStaticSections()` directly and takes no sections prop — filtering only in the router would leave ⌘K able to reach a dropped section.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/src/demo/modes.filtered.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PA_MODES, allStaticSections, findPaModeForSection } from './modes.filtered';
import { ALLOWED_SECTION_IDS, DROPPED_SECTION_IDS } from './sections.allow';

describe('filtered modes', () => {
  it('keeps exactly the nine Beheer sections', () => {
    const beheer = PA_MODES.find((m) => m.id === 'beheer');
    const ids = beheer!.groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual([
      'db-overzicht',
      'db-nieuw',
      'kompas-spec',
      'bronnen',
      'zoekcriteria',
      'curatie-spec',
      'notificaties',
      'profiel',
      'rollen',
    ]);
  });

  it('drops the IOU group and Gereedschap entirely', () => {
    const beheer = PA_MODES.find((m) => m.id === 'beheer');
    const groups = beheer!.groups.map((g) => g.label);
    expect(groups).not.toContain('IOU');
    expect(groups).not.toContain('Hulpmiddelen');
  });

  it('removes any group left with no items', () => {
    for (const mode of PA_MODES) {
      for (const group of mode.groups) {
        expect(group.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('hides dropped sections from the command palette', () => {
    // PACommandPalette calls allStaticSections() directly and takes no
    // sections prop, so filtering in DemoSectionRouter alone would leave ⌘K
    // able to jump straight to iou-feedback or gereedschap-overzicht.
    const ids = allStaticSections().map((s) => s.id);
    for (const dropped of DROPPED_SECTION_IDS) {
      expect(ids).not.toContain(dropped);
    }
  });

  it('resolves an allowed section to its mode', () => {
    expect(findPaModeForSection('db-overzicht')).toBe('beheer');
    expect(findPaModeForSection('vandaag')).toBe('vandaag');
  });

  it('resolves a dropped section to null rather than its old mode', () => {
    expect(findPaModeForSection('iou-feedback')).toBeNull();
    expect(findPaModeForSection('gereedschap-overzicht')).toBeNull();
  });

  it('keeps the four non-Beheer modes', () => {
    expect(PA_MODES.map((m) => m.id)).toEqual([
      'vandaag',
      'dossiers',
      'monitoring',
      'voortgang',
      'beheer',
    ]);
  });

  it('allows every id it lists', () => {
    // Guards against an allow-list entry that no longer matches a real
    // section — a typo would silently drop a page rather than fail.
    const real = new Set(allStaticSections().map((s) => s.id));
    for (const id of ALLOWED_SECTION_IDS) {
      if (id === 'dossiers') continue; // data-driven, not a static section
      expect(real.has(id)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/modes.filtered`
Expected: FAIL — `Failed to resolve import "./modes.filtered"`.

- [ ] **Step 3: Create `src/demo/sections.allow.ts`**

```ts
/**
 * What plato is allowed to show. Deny-by-default: a section added to the real
 * cockpit later cannot appear on a public site unless its id is added here.
 *
 * Dropped on purpose:
 *   IOU (iou-gebruiksscenario, iou-feedback, iou-actieve-zaken, iou-archief)
 *     — all four submit or fetch real cases, and three carry backend/auth
 *       references. Feedback posts to /public/feedback, which would work, but
 *       an open submit form is not wanted on a showcase.
 *   Hulpmiddelen (gereedschap-overzicht) — a caseworker tool index with no PA
 *     meaning.
 *
 * Both groups are also where the six ../CaseworkerDashboard/* imports live, so
 * dropping them is what lets DemoSectionRouter carry none.
 */
export const ALLOWED_SECTION_IDS: readonly string[] = [
  // Vandaag
  'vandaag',
  'sort-kompas',
  'sort-momentum',
  // Dossiers (data-driven: the id is a dossier id, not a static section)
  'dossiers',
  // Monitoring
  'agenda',
  'feiten',
  'politiek',
  'europa',
  'regionaal',
  'media',
  // Voortgang
  'voortgang',
  'kompas-log',
  'interventie-log',
  // Beheer — the nine curated sections
  'db-overzicht',
  'db-nieuw',
  'kompas-spec',
  'bronnen',
  'zoekcriteria',
  'curatie-spec',
  'notificaties',
  'profiel',
  'rollen',
];

/** Named so the palette test can assert their absence explicitly. */
export const DROPPED_SECTION_IDS: readonly string[] = [
  'iou-gebruiksscenario',
  'iou-feedback',
  'iou-actieve-zaken',
  'iou-archief',
  'gereedschap-overzicht',
];

export function isAllowedSection(id: string): boolean {
  return ALLOWED_SECTION_IDS.includes(id);
}
```

Before committing, run
`grep -oE "id: '[a-z-]+', label:" packages/pa-demo/src/vendor/pages/public-affairs-v2/modes.config.ts`
and reconcile: every id must appear in exactly one of the two lists above. The
last test in Step 1 catches an allow-list typo; this catches a section that is
in neither list and would be silently dropped.

- [ ] **Step 4: Create `src/demo/modes.filtered.ts`**

```ts
/**
 * The allow-list applied at the data source.
 *
 * Every vendored consumer of modes.config resolves here through the alias in
 * vite.config.ts, so the rail, the ⌘K palette and DemoSectionRouter all read
 * one filtered truth and cannot disagree. Filtering in the router alone would
 * not be enough: PACommandPalette builds its hit list from allStaticSections()
 * on its own.
 */
import {
  PA_MODES as ALL_MODES,
  isPaItemVisible,
  type PaGateContext,
  type PaModeId,
  type OrgTypeGate,
} from '../vendor/pages/public-affairs-v2/modes.config';
import { isAllowedSection } from './sections.allow';

export type { PaGateContext, PaModeId, OrgTypeGate };
export { isPaItemVisible };

export const PA_MODES = ALL_MODES.map((mode) => ({
  ...mode,
  groups: mode.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isAllowedSection(item.id)),
    }))
    // A group whose every item was dropped would render as an empty heading.
    .filter((group) => group.items.length > 0),
}));

export function allStaticSections(): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const mode of PA_MODES) {
    for (const group of mode.groups) {
      for (const item of group.items) out.push({ id: item.id, label: item.label });
    }
  }
  return out;
}

export function findPaModeForSection(sectionId: string): PaModeId | null {
  for (const mode of PA_MODES) {
    for (const group of mode.groups) {
      if (group.items.some((i) => i.id === sectionId)) return mode.id;
    }
  }
  return null;
}
```

Check the real module's full export list with
`grep -n "^export" packages/pa-demo/src/vendor/pages/public-affairs-v2/modes.config.ts`
and re-export every name it has. A name that exists on the origin but not here
becomes `undefined` at runtime in whichever vendored file imports it — the same
failure mode that made `GET /v1/pa/types` answer 500 when `EU_DOCUMENT_TYPES`
went missing from a mock.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/modes.filtered`
Expected: PASS, 8 tests.

- [ ] **Step 6: Observe the palette guard going red for the right reason**

The ⌘K assertion is a negative one and must be seen to fail. Temporarily add
`'iou-feedback'` to `ALLOWED_SECTION_IDS`, then:

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/modes.filtered`
Expected: FAIL on _"hides dropped sections from the command palette"_, reporting
that the array contains `'iou-feedback'`. Remove the entry and re-run: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write "packages/pa-demo/src/demo/*.ts"
git add packages/pa-demo/src/demo
git commit -m "feat(pa-demo): curate sections with a deny-by-default allow-list"
```

---

## Task 5: The role context

**Files:**

- Create: `src/demo/DemoRoleContext.tsx`
- Test: `src/demo/DemoRoleContext.test.tsx`

**Interfaces:**

- Consumes: `setDemoRoles` from `src/demo/shims/keycloak`; `DB_ROLES`, `deriveDossierRole`, and the `DossierRole` type from `src/vendor/pages/public-affairs-v2/dossierbeheer.data`.
- Produces:
  - `DemoRoleProvider({ children })`
  - `useDemoRole(): { roleId: DemoRoleId; setRoleId(id: DemoRoleId): void; role: DossierRole }`
  - `type DemoRoleId = 'auteur' | 'redacteur' | 'beheerder' | 'geen'`
  - `DEMO_ROLE_OPTIONS: { id: DemoRoleId; label: string }[]`
  - Task 8's `DemoBar` renders the options and calls `setRoleId`; Task 7's `RollenRechten` reads `role`.

The switcher works by rewriting the synthetic user's `roles` array, not by patching components. `Dossierbeheer.tsx:62` reads `deriveDossierRole(user?.roles ?? [])`, so the caps chips, the 🔒 gates in `DossierEditor` and every disabled action follow with no vendored edit.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/src/demo/DemoRoleContext.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  DemoRoleProvider,
  useDemoRole,
  DEMO_ROLE_OPTIONS,
  type DemoRoleId,
} from './DemoRoleContext';
import { getUser } from './shims/keycloak';

let setRole: (id: DemoRoleId) => void;

function Probe() {
  const { roleId, role, setRoleId } = useDemoRole();
  setRole = setRoleId;
  return (
    <div>
      <span data-testid="id">{roleId}</span>
      <span data-testid="label">{role.label}</span>
      <span data-testid="kc">{role.keycloak}</span>
      <span data-testid="publish">{String(role.can.publish)}</span>
      <span data-testid="del">{String(role.can.del)}</span>
      <span data-testid="roles">{getUser().roles.join(',')}</span>
    </div>
  );
}

function renderProbe() {
  render(
    <DemoRoleProvider>
      <Probe />
    </DemoRoleProvider>
  );
}

describe('DemoRoleContext', () => {
  it('starts as Beheerder so a visitor sees the full product first', () => {
    renderProbe();
    expect(screen.getByTestId('id')).toHaveTextContent('beheerder');
    expect(screen.getByTestId('label')).toHaveTextContent('Beheerder');
  });

  it('writes the selected role into the synthetic token', () => {
    renderProbe();
    act(() => setRole('redacteur'));
    expect(screen.getByTestId('roles')).toHaveTextContent('public-affairs,pa-editor');
  });

  it('derives Redacteur caps: publishes but cannot delete', () => {
    renderProbe();
    act(() => setRole('redacteur'));
    expect(screen.getByTestId('publish')).toHaveTextContent('true');
    expect(screen.getByTestId('del')).toHaveTextContent('false');
  });

  it('derives Auteur caps: cannot publish', () => {
    renderProbe();
    act(() => setRole('auteur'));
    expect(screen.getByTestId('kc')).toHaveTextContent('pa-author');
    expect(screen.getByTestId('publish')).toHaveTextContent('false');
  });

  it('supports the read-only pseudo-role', () => {
    renderProbe();
    act(() => setRole('geen'));
    expect(screen.getByTestId('label')).toHaveTextContent('Geen dossierrol');
    expect(screen.getByTestId('roles')).toHaveTextContent('public-affairs');
    expect(screen.getByTestId('publish')).toHaveTextContent('false');
  });

  it('offers four positions', () => {
    // Three real roles plus the read-only state, which is part of the
    // governance story rather than an error case.
    expect(DEMO_ROLE_OPTIONS.map((o) => o.id)).toEqual([
      'auteur',
      'redacteur',
      'beheerder',
      'geen',
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/DemoRoleContext`
Expected: FAIL — `Failed to resolve import "./DemoRoleContext"`.

- [ ] **Step 3: Create `src/demo/DemoRoleContext.tsx`**

```tsx
/**
 * The demo's one permission control.
 *
 * In the product the role is not switchable — Dossierbeheer's role bar is
 * rendered `disabled` with the title "De rol volgt uit je Keycloak-rechten",
 * because you obviously cannot grant yourself rights. plato is the one context
 * where that inverts: there are no real rights to escalate, and showing a
 * prospect how the permission model behaves is the point.
 *
 * It is implemented by rewriting the synthetic token rather than by patching
 * components, so the vendored permission UI — caps chips, the 🔒 hints in
 * DossierEditor, every disabled action — follows on its own.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  deriveDossierRole,
  type DossierRole,
} from '../vendor/pages/public-affairs-v2/dossierbeheer.data';
import { setDemoRoles } from './shims/keycloak';

export type DemoRoleId = 'auteur' | 'redacteur' | 'beheerder' | 'geen';

/** Keycloak role each position grants; `geen` grants none. */
const KEYCLOAK_ROLE: Record<DemoRoleId, string | null> = {
  auteur: 'pa-author',
  redacteur: 'pa-editor',
  beheerder: 'pa-admin',
  geen: null,
};

export const DEMO_ROLE_OPTIONS: { id: DemoRoleId; label: string }[] = [
  { id: 'auteur', label: 'Auteur' },
  { id: 'redacteur', label: 'Redacteur' },
  { id: 'beheerder', label: 'Beheerder' },
  { id: 'geen', label: 'Geen dossierrol' },
];

interface DemoRoleValue {
  roleId: DemoRoleId;
  setRoleId: (id: DemoRoleId) => void;
  role: DossierRole;
}

const DemoRoleCtx = createContext<DemoRoleValue | null>(null);

export function DemoRoleProvider({ children }: { children: ReactNode }) {
  // Beheerder first: a visitor should see the whole product before being
  // shown what a narrower role loses.
  const [roleId, setRoleIdState] = useState<DemoRoleId>('beheerder');

  const setRoleId = useCallback((id: DemoRoleId) => {
    setDemoRoles(KEYCLOAK_ROLE[id]);
    setRoleIdState(id);
  }, []);

  const value = useMemo<DemoRoleValue>(() => {
    const kc = KEYCLOAK_ROLE[roleId];
    // Derived through the product's own function, from the same roles array
    // the cockpit reads, so the demo cannot drift from real behaviour.
    return { roleId, setRoleId, role: deriveDossierRole(kc ? [kc] : []) };
  }, [roleId, setRoleId]);

  return <DemoRoleCtx.Provider value={value}>{children}</DemoRoleCtx.Provider>;
}

export function useDemoRole(): DemoRoleValue {
  const ctx = useContext(DemoRoleCtx);
  if (!ctx) throw new Error('useDemoRole must be used inside DemoRoleProvider');
  return ctx;
}
```

The provider must call `setDemoRoles('pa-admin')` for its initial state too, otherwise the shim's module-level default and the context disagree on first render. Add to `DemoRoleProvider`, before the `useMemo`:

```tsx
// Keep the shim in step with the initial state on mount.
useState(() => setDemoRoles(KEYCLOAK_ROLE.beheerder));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/DemoRoleContext`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "packages/pa-demo/src/demo/DemoRoleContext.tsx" "packages/pa-demo/src/demo/DemoRoleContext.test.tsx"
git add packages/pa-demo/src/demo
git commit -m "feat(pa-demo): switch roles by rewriting the synthetic token"
```

---

## Task 6: The demo section router

**Files:**

- Create: `src/demo/DemoSectionRouter.tsx`
- Test: `src/demo/DemoSectionRouter.test.tsx`

**Interfaces:**

- Consumes: the vendored section components; `Profiel` and `RollenRechten` from Task 7 (create them as one-line stubs here and fill them in there, so this task's tests can run).
- Produces: `default function DemoSectionRouter(props)` matching the vendored `PASectionRouter`'s prop shape, which the aliased shell imports.

- [ ] **Step 1: Read the interface it must satisfy**

Run: `sed -n '1,60p' packages/frontend/src/components/PADashboardV2/PASectionRouter.tsx`

Copy its `Props` interface verbatim into the new file. The shell passes these props positionally by name; a mismatch is a type error at `npm run type-check`, not a test failure, so this step is a read rather than a guess.

- [ ] **Step 2: Write the failing test**

Create `packages/pa-demo/src/demo/DemoSectionRouter.test.tsx`.

The router takes **six required props** and calls `usePaData()`, so a bare
`<DemoSectionRouter sectionId="…" />` neither type-checks nor renders. The real
signature, read in Step 1, is:

```ts
interface Props {
  sectionId: string;
  prioritering: Prioritering;
  kompasViz: KompasViz;
  user: KeycloakUser | null;
  tenantConfig: TenantConfig | null;
  onOpenDossier: (id: string) => void;
  onNavigate?: (mode: PaModeId, sectionId: string) => void;
}
```

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoSectionRouter from './DemoSectionRouter';
import { DROPPED_SECTION_IDS } from './sections.allow';
import { getUser } from './shims/keycloak';
import { getTenantConfig } from './shims/tenant';

// Each vendored section has its own test file in packages/frontend, so every
// child is mocked one level below what the router itself consumes.
vi.mock('./Profiel', () => ({ default: () => <div>PROFIEL</div> }));
vi.mock('./RollenRechten', () => ({ default: () => <div>ROLLEN</div> }));

// The router calls usePaData() before its switch. packages/frontend keeps a
// canonical stub with a parity test at src/test/paData.stub.ts — mirror it
// here rather than hand-rolling an object, because a context member added
// upstream must fail loudly instead of surfacing as an unhandled rejection
// inside whichever component reads it first.
vi.mock('../vendor/pages/public-affairs-v2/PaDataProvider', async () => {
  const actual = await vi.importActual<
    typeof import('../vendor/pages/public-affairs-v2/PaDataProvider')
  >('../vendor/pages/public-affairs-v2/PaDataProvider');
  return {
    ...actual,
    usePaData: () => ({ dossiers: { data: [], loading: false, error: null } }),
  };
});

function renderSection(sectionId: string) {
  return render(
    <DemoSectionRouter
      sectionId={sectionId}
      prioritering="kompas"
      kompasViz="radar"
      user={getUser()}
      tenantConfig={getTenantConfig()}
      onOpenDossier={() => {}}
    />
  );
}

describe('DemoSectionRouter', () => {
  it('routes profiel to the demo-owned page, not the caseworker one', () => {
    renderSection('profiel');
    expect(screen.getByText('PROFIEL')).toBeInTheDocument();
  });

  it('routes rollen to the PA-native page', () => {
    renderSection('rollen');
    expect(screen.getByText('ROLLEN')).toBeInTheDocument();
  });

  it('renders nothing for a dropped section id', () => {
    // Belt and braces: modes.filtered already hides these from the rail and
    // the palette, but a deep link or a stale ⌘K entry must not reach one.
    for (const id of DROPPED_SECTION_IDS) {
      const { container, unmount } = renderSection(id);
      expect(container.textContent).toBe('');
      unmount();
    }
  });

  it('imports no caseworker component', async () => {
    // The six ../CaseworkerDashboard/* imports all lived in PASectionRouter.
    // This asserts the replacement carries none, which is what keeps them out
    // of the bundle entirely.
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./DemoSectionRouter.tsx', import.meta.url), 'utf-8')
    );
    expect(src).not.toMatch(/CaseworkerDashboard/);
  });
});
```

The exact literal values for `prioritering` and `kompasViz` come from the
`Prioritering` and `KompasViz` unions in `vendor/pages/public-affairs-v2/Vandaag.tsx`
and `Kompas.tsx` — read them and use a real member of each, not the strings
above if they differ.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/DemoSectionRouter`
Expected: FAIL — `Failed to resolve import "./DemoSectionRouter"`.

- [ ] **Step 4: Create the two page stubs so this task can compile**

`src/demo/Profiel.tsx`:

```tsx
export default function Profiel() {
  return null;
}
```

`src/demo/RollenRechten.tsx`:

```tsx
export default function RollenRechten() {
  return null;
}
```

Task 7 replaces both bodies. They exist now so the router type-checks.

- [ ] **Step 5: Create `src/demo/DemoSectionRouter.tsx`**

Model it on the vendored `PASectionRouter` read in Step 1: same props, same
switch, with these differences and no others —

- the six `../CaseworkerDashboard/*` imports are absent;
- `profiel` renders `<Profiel />` and `rollen` renders `<RollenRechten />`;
- the IOU and Gereedschap cases are absent, and the default branch returns
  `null` rather than falling through to one of them.

```tsx
/**
 * Replaces the vendored PASectionRouter, which is the only file carrying the
 * six ../CaseworkerDashboard/* imports — Profiel, Rollen, the four IOU
 * sections and Gereedschap. Dropping those is what keeps the caseworker
 * components out of this bundle entirely, and deciding which sections exist is
 * exactly what differs on a public demo, so this file is written rather than
 * vendored.
 *
 * Every other section is the vendored component, unmodified.
 */
```

Import each section component from `../vendor/...` using the paths in
`scripts/vendor-manifest.mjs`, and dispatch on `sectionId`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/DemoSectionRouter`
Expected: PASS, 4 tests.

- [ ] **Step 7: Run the type-check**

Run: `npm run type-check --workspace=@ronl/pa-demo`
Expected: clean. A `Props` mismatch here means Step 1 was skipped.

- [ ] **Step 8: Commit**

```bash
npx prettier --write "packages/pa-demo/src/demo/*.tsx"
git add packages/pa-demo/src/demo
git commit -m "feat(pa-demo): route sections without any caseworker component"
```

---

## Task 7: The two PA-native Beheer pages

**Files:**

- Modify: `src/demo/Profiel.tsx`, `src/demo/RollenRechten.tsx` (replace the Task 6 stubs)
- Test: `src/demo/Profiel.test.tsx`, `src/demo/RollenRechten.test.tsx`

**Interfaces:**

- Consumes: `getUser` from `./shims/keycloak`; `useDemoRole`, `DEMO_ROLE_OPTIONS` from `./DemoRoleContext`; `DB_ROLES`, `DB_CAPS` from the vendored `dossierbeheer.data`.
- Produces: two default-exported components, already wired into `DemoSectionRouter` by Task 6.

Neither reuses the caseworker original. `RollenSection`'s `ROLE_DESCRIPTIONS` covers `caseworker`, `hr-medewerker` and seven `rip-*` roles and names no `pa-*` role at all. `ProfielSection` fetches HR data through `useProfielData(employeeId)` and is a caseworker component that would not become part of `@ronl/pa-cockpit`, so vendoring it would leave `pa-demo` needing its own version after the extraction anyway.

- [ ] **Step 1: Write the failing tests**

Create `packages/pa-demo/src/demo/RollenRechten.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RollenRechten from './RollenRechten';
import { DemoRoleProvider } from './DemoRoleContext';

function renderPage() {
  return render(
    <DemoRoleProvider>
      <RollenRechten />
    </DemoRoleProvider>
  );
}

describe('RollenRechten', () => {
  it('lists the three PA governance roles with their Keycloak names', () => {
    renderPage();
    expect(screen.getByText('pa-author')).toBeInTheDocument();
    expect(screen.getByText('pa-editor')).toBeInTheDocument();
    expect(screen.getByText('pa-admin')).toBeInTheDocument();
  });

  it('names no caseworker or RIP role', () => {
    // The caseworker RollenSection describes caseworker/hr-medewerker/rip-*
    // and no pa-* role; shipping it here would describe the wrong product.
    renderPage();
    expect(screen.queryByText(/rip-/)).toBeNull();
    expect(screen.queryByText(/hr-medewerker/)).toBeNull();
  });

  it('shows all six capabilities for Beheerder', () => {
    renderPage();
    for (const label of [
      'Aanmaken',
      'Bewerken',
      'Sjablonen',
      'Publiceren',
      'Archiveren',
      'Verwijderen',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('switching to Auteur turns Publiceren off', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Auteur' }));
    expect(screen.getByTestId('cap-publish')).toHaveAttribute('data-on', 'false');
    expect(screen.getByTestId('cap-create')).toHaveAttribute('data-on', 'true');
  });

  it('switching to Beheerder turns Verwijderen on', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Auteur' }));
    expect(screen.getByTestId('cap-del')).toHaveAttribute('data-on', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Beheerder' }));
    expect(screen.getByTestId('cap-del')).toHaveAttribute('data-on', 'true');
  });
});
```

Create `packages/pa-demo/src/demo/Profiel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Profiel from './Profiel';
import { DemoRoleProvider } from './DemoRoleContext';

function renderPage() {
  return render(
    <DemoRoleProvider>
      <Profiel />
    </DemoRoleProvider>
  );
}

describe('Profiel', () => {
  it('shows the synthetic user from the shim', () => {
    renderPage();
    expect(screen.getByText('Marieke de Vries')).toBeInTheDocument();
    expect(screen.getByText('m.devries')).toBeInTheDocument();
    expect(screen.getByText('FL-2291')).toBeInTheDocument();
  });

  it('shows the tenant display name rather than the raw id', () => {
    renderPage();
    expect(screen.getByText('Provincie Flevoland')).toBeInTheDocument();
  });

  it('reflects the selected role in the roles list', () => {
    renderPage();
    expect(screen.getByText(/pa-admin/)).toBeInTheDocument();
  });

  it('marks the page as demonstration data', () => {
    // A profile page is the most likely thing on the site to be mistaken for
    // a real person's record.
    renderPage();
    expect(screen.getByText(/fictief|demonstratie/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/RollenRechten demo/Profiel`
Expected: FAIL — the stubs render `null`, so every `getByText` reports "Unable to find an element".

- [ ] **Step 3: Implement `src/demo/RollenRechten.tsx`**

Render, in this order: a heading and one paragraph explaining that plato lets a
visitor adopt each role; the four-position selector built from
`DEMO_ROLE_OPTIONS`, calling `setRoleId`; a capability row built from `DB_CAPS`
where each chip carries `data-testid={'cap-' + c.key}` and
`data-on={String(role.can[c.key])}`; the selected role's `note` and its
`keycloak` name; and a table of all three `DB_ROLES` with their notes, so the
model is visible without clicking through it.

Reuse the vendored `dossierbeheer.css` classes (`pac-db-roleseg`,
`pac-db-roleseg-btn`, `pac-db-caps`, `pac-db-cap`) so the page matches the role
bar a visitor sees in Dossierbeheer. Import the stylesheet from
`../vendor/pages/public-affairs-v2/dossierbeheer.css`.

- [ ] **Step 4: Implement `src/demo/Profiel.tsx`**

Mirror the product's two-block layout. Block one, from `getUser()`: Naam,
Gebruikersnaam, Medewerker-ID, Gemeente (`getTenantConfig().displayName`),
Beveiligingsniveau (`loa`), Rollen (`roles.join(', ')`). Block two, a static
stand-in for the HR fetch the product does: Voornaam `Marieke`, Achternaam
`de Vries`, Afdeling `Bestuur & Concern`, Functie `Strategisch adviseur Public
Affairs`, Toegangsniveau `uitgebreid`.

Include a short line stating the data is fictional demonstration data — the
fourth test asserts it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts demo/RollenRechten demo/Profiel`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write "packages/pa-demo/src/demo/*.tsx"
git add packages/pa-demo/src/demo
git commit -m "feat(pa-demo): add PA-native Profiel and Rollen & rechten pages"
```

---

## Task 8: The demo bar, the shell, and forced mock mode

**Files:**

- Create: `src/demo/DemoBar.tsx`, `src/App.tsx`, `src/main.tsx`
- Create: `packages/pa-demo/.env.development`, `.env.acceptance`, `.env.production`
- Test: `src/demo/DemoBar.test.tsx`, `src/mock-lock.test.ts`

**Interfaces:**

- Consumes: `useDemoRole`, `DEMO_ROLE_OPTIONS`; `resetMockDemoData` from the vendored `mock-demo.store`; `resetMockDossiers` from the vendored `dossierbeheer.api`; the vendored `PADashboardV2` shell.
- Produces: the mounted application.

### How mock mode is actually forced — read before implementing

`isPaMock()` lives _inside_ the vendored `pa.api.ts` and is called by its own 25
internal branches. Aliasing the module to override the export would not change
those internal calls — they resolve module-locally. Since vendored files must
not be edited, mock mode is forced by the two levers that `isPaMock()` itself
reads:

```ts
const PA_MOCK_DEFAULT =
  import.meta.env.VITE_PA_DOSSIERS_MOCK === 'true' ||
  import.meta.env.VITE_PA_SIGNALS_MOCK === 'true';
const PA_MOCK_KEY = 'paV2.mock';

export function isPaMock(): boolean {
  try {
    const v = localStorage.getItem(PA_MOCK_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ... */
  }
  return PA_MOCK_DEFAULT;
}
```

1. **Build-time default**: both env vars set to `true`, so `PA_MOCK_DEFAULT` is
   `true` and an absent key means mock.
2. **Runtime key**: `main.tsx` writes `'1'` to `paV2.mock` _before_ mounting, so
   an inherited `'0'` from another Open Regels site on the same origin cannot
   win. `isPaMock()` reads localStorage per call, not at import, so a write
   before mount covers every later call.

This is defence in depth, not an absolute lock — a visitor with devtools can
still set `'0'`, at which point layers 3 (CSP) and 4 (the bundle gate) mean the
page fails loudly instead of reaching a backend. The spec's phrase "ignoring
localStorage entirely" overstates what is achievable without editing a vendored
file; what is guaranteed is that no _inherited or stale_ key can flip it.

- [ ] **Step 1: Write the failing tests**

Create `packages/pa-demo/src/mock-lock.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { forceMockMode } from './main-helpers';
import { isPaMock } from './vendor/services/pa.api';

describe('forced mock mode', () => {
  beforeEach(() => localStorage.clear());

  it('is mock with no key set, from the build-time default', () => {
    expect(isPaMock()).toBe(true);
  });

  it('overrides an inherited live key', () => {
    // Another Open Regels app on the same origin could have left '0' behind.
    localStorage.setItem('paV2.mock', '0');
    expect(isPaMock()).toBe(false);
    forceMockMode();
    expect(isPaMock()).toBe(true);
  });

  it('survives a storage failure without throwing', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('storage disabled');
    };
    expect(() => forceMockMode()).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
```

Create `packages/pa-demo/src/demo/DemoBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoBar from './DemoBar';
import { DemoRoleProvider } from './DemoRoleContext';

const resetDemoData = vi.fn();
const resetDossiers = vi.fn();
vi.mock('../vendor/services/mock-demo.store', () => ({
  resetMockDemoData: () => resetDemoData(),
}));
vi.mock('../vendor/services/dossierbeheer.api', () => ({
  resetMockDossiers: () => resetDossiers(),
}));

function renderBar() {
  render(
    <DemoRoleProvider>
      <DemoBar />
    </DemoRoleProvider>
  );
}

describe('DemoBar', () => {
  it('states that this is a demonstration with fictional data', () => {
    renderBar();
    expect(screen.getByText(/demonstratie/i)).toBeInTheDocument();
  });

  it('offers the four roles as enabled controls', () => {
    // Unlike Dossierbeheer's role bar, which is disabled by design.
    renderBar();
    for (const label of ['Auteur', 'Redacteur', 'Beheerder', 'Geen dossierrol']) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    }
  });

  it('marks the selected role as pressed', async () => {
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Auteur' }));
    expect(screen.getByRole('button', { name: 'Auteur' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets both stores, since dossiers live in a separate one', async () => {
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: /demo herstellen/i }));
    expect(resetDemoData).toHaveBeenCalledTimes(1);
    expect(resetDossiers).toHaveBeenCalledTimes(1);
  });

  it('offers no live/mock toggle', async () => {
    // The whole point of plato: there is no Live to switch to.
    renderBar();
    expect(screen.queryByText(/live/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts mock-lock demo/DemoBar`
Expected: FAIL — `Failed to resolve import "./main-helpers"` and `"./DemoBar"`.

- [ ] **Step 3: Create the three env files**

`packages/pa-demo/.env.development`:

```
VITE_SITE_URL=http://localhost:5176
VITE_PA_DOSSIERS_MOCK=true
VITE_PA_SIGNALS_MOCK=true
VITE_PA_AGENDA_MOCK=true
```

`packages/pa-demo/.env.acceptance`:

```
VITE_SITE_URL=https://acc.plato.open-regels.nl
VITE_PA_DOSSIERS_MOCK=true
VITE_PA_SIGNALS_MOCK=true
VITE_PA_AGENDA_MOCK=true
```

`packages/pa-demo/.env.production`:

```
VITE_SITE_URL=https://plato.open-regels.nl
VITE_PA_DOSSIERS_MOCK=true
VITE_PA_SIGNALS_MOCK=true
VITE_PA_AGENDA_MOCK=true
```

`VITE_API_URL` is deliberately absent from all three. There is nothing to point
it at, and a set-but-unused value is how a later change starts using it.

`VITE_PA_AGENDA_MOCK` is load-bearing rather than decorative: `fetchAgenda` sits
outside the unified switch and otherwise calls `paGet('/pa/agenda')`.

- [ ] **Step 4: Create `src/main-helpers.ts`**

```ts
/**
 * Split out of main.tsx so it can be tested — main.tsx itself calls
 * createRoot and is excluded from coverage.
 */
const PA_MOCK_KEY = 'paV2.mock';

/**
 * Writes the mock flag before the app mounts.
 *
 * The env defaults already make PA_MOCK_DEFAULT true, so an absent key means
 * mock. This covers the other case: a '0' inherited from another Open Regels
 * app on the same origin, which would otherwise win over the default.
 * isPaMock() reads localStorage per call rather than at import, so writing
 * before mount covers every later call.
 */
export function forceMockMode(): void {
  try {
    localStorage.setItem(PA_MOCK_KEY, '1');
  } catch {
    // Storage unavailable (private browsing). PA_MOCK_DEFAULT still applies.
  }
}
```

- [ ] **Step 5: Create `src/demo/DemoBar.tsx`**

A `<header>` above the cockpit chrome containing, in order: the text
"Demonstratie · fictieve gegevens"; a label "Je rol"; the four
`DEMO_ROLE_OPTIONS` as `<button type="button" aria-pressed={...}>`; and a
"Demo herstellen" button calling both `resetMockDemoData()` and
`resetMockDossiers()` then `window.location.reload()`.

Give it its own class prefix (`plato-bar`) and its own stylesheet
`src/demo/demo-bar.css` so it cannot collide with the vendored `.pac` scope. It
must read as demo furniture rather than product chrome.

- [ ] **Step 6: Create `src/App.tsx` and `src/main.tsx`**

`src/App.tsx` renders `<DemoRoleProvider>`, then `<DemoBar />`, then the
vendored `PADashboardV2` shell. Read
`packages/pa-demo/src/vendor/pages/PADashboardV2.tsx`'s default export
signature first and pass whatever props it requires.

`src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { forceMockMode } from './main-helpers';
import App from './App';

// Before anything imports pa.api and reads the flag.
forceMockMode();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts mock-lock demo/DemoBar`
Expected: PASS, 8 tests.

- [ ] **Step 8: Observe the mock lock going red for the right reason**

Temporarily change `forceMockMode` to write `'0'` instead of `'1'`.

Run: `npx vitest run --config packages/pa-demo/vite.config.ts mock-lock`
Expected: FAIL on _"overrides an inherited live key"_, reporting `false` where
`true` was expected. Restore `'1'` and re-run: PASS.

- [ ] **Step 9: Run the app and confirm it renders**

Run: `npm run dev --workspace=@ronl/pa-demo`, open `http://localhost:5176`.
Expected: the PA-Cockpit chrome with the demo bar above it, four modes plus
Beheer in the rail, nine items under Beheer, no IOU or Hulpmiddelen groups, and
an empty browser network tab apart from Vite's own assets.

- [ ] **Step 10: Commit**

```bash
npx prettier --write "packages/pa-demo/src/**/*.{ts,tsx}"
git add packages/pa-demo
git commit -m "feat(pa-demo): mount the cockpit with a demo bar and forced mock mode"
```

---

## Task 9: The CSP and the bundle gate

**Files:**

- Create: `packages/pa-demo/public/staticwebapp.config.json`, `src/staticwebapp-csp.test.ts`, `scripts/check-bundle.mjs`, `scripts/check-bundle.test.ts`
- Test: both files above

**Interfaces:**

- Produces: `findForbiddenStrings(distDir): Promise<{file, term}[]>`, called by the CLI block and by Task 11's build step via `npm run build:*`.

These are layers 3 and 4 of the four guarantees. Layer 4 is the strongest: it proves the backend URL is not in the bundle to be requested, rather than merely refusing the request.

- [ ] **Step 1: Write the failing CSP test**

Create `packages/pa-demo/src/staticwebapp-csp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Parsed from the source of truth Vite copies into dist/, so this guards the
// header that actually ships.
const configPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'staticwebapp.config.json'
);
const csp: string = JSON.parse(readFileSync(configPath, 'utf-8')).globalHeaders[
  'Content-Security-Policy'
];

function cspDirective(name: string): string[] {
  const part = csp
    .split(';')
    .map((s) => s.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return part ? part.slice(name.length).trim().split(/\s+/).filter(Boolean) : [];
}

describe('pa-demo Content-Security-Policy', () => {
  it('permits no outbound connection beyond the site itself', () => {
    // plato calls nothing. Where public-site lists the API origins because it
    // genuinely uses them, listing none here is what makes "no Live" a rule
    // the browser enforces rather than a UI convention.
    expect(cspDirective('connect-src')).toEqual(["'self'"]);
  });

  it('names no backend origin in any directive', () => {
    expect(csp).not.toContain('api.open-regels.nl');
    expect(csp).not.toContain('acc.api.open-regels.nl');
  });

  it('still allows the inline styles the cockpit CSS needs', () => {
    expect(cspDirective('style-src')).toContain("'unsafe-inline'");
  });

  it('refuses to be framed', () => {
    expect(cspDirective('frame-ancestors')).toEqual(["'none'"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts staticwebapp-csp`
Expected: FAIL — `ENOENT: no such file or directory … public/staticwebapp.config.json`.

- [ ] **Step 3: Create `packages/pa-demo/public/staticwebapp.config.json`**

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "*.{png,jpg,jpeg,svg,ico,css,js,xml,txt}"]
  },
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  }
}
```

- [ ] **Step 4: Run the CSP test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts staticwebapp-csp`
Expected: PASS, 4 tests.

- [ ] **Step 5: Observe the CSP test going red for the right reason**

A negative assertion is untrustworthy until seen to fail. Temporarily change
`connect-src 'self'` to `connect-src 'self' https://api.open-regels.nl`.

Run: `npx vitest run --config packages/pa-demo/vite.config.ts staticwebapp-csp`
Expected: FAIL on both _"permits no outbound connection beyond the site itself"_
and _"names no backend origin in any directive"_. Restore and re-run: PASS.

- [ ] **Step 6: Write the failing bundle-gate test**

Create `packages/pa-demo/scripts/check-bundle.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findForbiddenStrings } from './check-bundle.mjs';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function bundle(contents: Record<string, string>): Promise<string> {
  dir = await mkdtemp(path.join(tmpdir(), 'pa-demo-bundle-'));
  for (const [rel, text] of Object.entries(contents)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

describe('findForbiddenStrings', () => {
  it('rejects the real Keycloak library', async () => {
    const d = await bundle({ 'index.js': `import Keycloak from "keycloak-js";` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('keycloak-js');
  });

  it('rejects a backend origin — the strongest no-Live guarantee', async () => {
    // Stronger than the CSP: this proves the URL is not present to be
    // requested at all, rather than that the browser would refuse it.
    const d = await bundle({ 'assets/app.js': `fetch("https://api.open-regels.nl/v1/pa")` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('api.open-regels.nl');
  });

  it('rejects the ACC backend origin too', async () => {
    const d = await bundle({ 'index.js': `"https://acc.api.open-regels.nl/v1"` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('acc.api.open-regels.nl');
  });

  it('rejects telemetry', async () => {
    const d = await bundle({ 'index.js': `gtag("event")` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('gtag(');
  });

  it('ALLOWS the bare word keycloak, which this bundle ships legitimately', async () => {
    // DB_ROLES carries keycloak: 'pa-author' | 'pa-editor' | 'pa-admin', and
    // Dossierbeheer renders "· Keycloak: {role.keycloak}" as visible UI. A
    // verbatim copy of public-site's gate, which forbids the bare string,
    // would fail this build on correct code.
    const d = await bundle({ 'index.js': `{keycloak:"pa-admin",label:"Beheerder"}` });
    expect(await findForbiddenStrings(d)).toEqual([]);
  });

  it('scans nested directories and ignores non-.js files', async () => {
    const d = await bundle({
      'assets/nested/a.js': 'clean',
      'notes.txt': 'https://api.open-regels.nl',
    });
    expect(await findForbiddenStrings(d)).toEqual([]);
  });

  it('returns no hits for a clean bundle', async () => {
    const d = await bundle({ 'index.js': 'console.log("hello")' });
    expect(await findForbiddenStrings(d)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts scripts/check-bundle`
Expected: FAIL — `Failed to resolve import "./check-bundle.mjs"`.

- [ ] **Step 8: Create `packages/pa-demo/scripts/check-bundle.mjs`**

```js
/**
 * Build gate: fails if the built bundle contains an auth library, telemetry,
 * or a backend origin.
 *
 * Modelled on packages/public-site/scripts/check-bundle.mjs but deliberately
 * NOT a copy of its list. That one forbids the bare string 'keycloak', which
 * this bundle ships legitimately: DB_ROLES carries keycloak: 'pa-author' |
 * 'pa-editor' | 'pa-admin', and Dossierbeheer renders "· Keycloak: {…}" as
 * visible UI in the role bar. Forbidding the library name and the origins
 * instead is both correct here and a stronger assertion — an origin absent
 * from the bundle cannot be requested at all.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const FORBIDDEN = [
  // Auth libraries — plato is unauthenticated by construction.
  'keycloak-js',
  'msal',
  '@azure/msal',
  'oidc-client',
  // Telemetry — a public demo tracks nobody.
  'react-ga',
  'google-analytics',
  'gtag(',
  // Backend origins — the no-Live guarantee at build time.
  'api.open-regels.nl',
  'acc.api.open-regels.nl',
];

export async function findForbiddenStrings(distDir) {
  const hits = [];

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        const text = (await readFile(full, 'utf-8')).toLowerCase();
        for (const term of FORBIDDEN) {
          if (text.includes(term.toLowerCase())) hits.push({ file: full, term });
        }
      }
    }
  }

  await walk(distDir);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = path.resolve(process.cwd(), 'dist');
  const hits = await findForbiddenStrings(distDir);
  if (hits.length) {
    console.error('Forbidden strings found in the built bundle:');
    for (const h of hits) console.error(`  ${h.file}: "${h.term}"`);
    process.exitCode = 1;
  } else {
    console.log('Bundle clean — no auth library, telemetry or backend origin.');
  }
}
```

Note `'api.open-regels.nl'` is a substring of `'acc.api.open-regels.nl'`, so an
ACC origin produces two hits. That is deliberate: both are reported, and the
test asserts `toContain` rather than an exact array.

- [ ] **Step 9: Run the bundle test to verify it passes**

Run: `npx vitest run --config packages/pa-demo/vite.config.ts scripts/check-bundle`
Expected: PASS, 7 tests.

- [ ] **Step 10: Run the gate against the real build**

```bash
npm run build --workspace=@ronl/pa-demo
```

Expected: the build completes and prints `Bundle clean — no auth library,
telemetry or backend origin.`

If it reports `api.open-regels.nl`, something in the vendored tree carries a
hardcoded URL. Find it with
`grep -rn "api.open-regels.nl" packages/pa-demo/src/vendor/` and shim the module
that holds it — do not edit the vendored file.

- [ ] **Step 11: Commit**

```bash
npx prettier --write "packages/pa-demo/src/staticwebapp-csp.test.ts" "packages/pa-demo/scripts/check-bundle.*" "packages/pa-demo/public/staticwebapp.config.json"
git add packages/pa-demo
git commit -m "feat(pa-demo): enforce no-Live with a CSP and a bundle gate"
```

---

## Task 10: The end-to-end demo journey

**Files:**

- Create: `packages/pa-demo/e2e/playwright.config.ts`, `packages/pa-demo/e2e/plato-demo.spec.ts`
- Reference: `packages/frontend/e2e/pa-mock-journey.spec.ts` — five tests already covering curation across a reload, a dismissal persisting, reset restoring the fixture baseline, and the reset control appearing in mock mode only. Read it before writing; most of what is needed exists.

**Interfaces:**

- Consumes: the built or dev-served site. No backend, no database, no Keycloak.

Unlike the frontend suite, and like `public-site`, Playwright starts its own dev server — and unlike either, `pa-demo` needs nothing else running at all.

- [ ] **Step 1: Create `packages/pa-demo/e2e/playwright.config.ts`**

```ts
// Kept outside src/ so Vitest never picks these *.spec.ts files up.
//
// pa-demo has no backend, database or Keycloak dependency, so this suite is
// entirely self-contained — Playwright starts the dev server and nothing else
// needs to be running. Set E2E_BASE_URL to run against a deployed site
// (acc.plato / plato) for post-deploy verification.
import { defineConfig, devices } from '@playwright/test';

const liveTarget = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: liveTarget ?? 'http://localhost:5176',
    trace: 'on-first-retry',
  },
  ...(liveTarget
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5176',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Write the failing spec**

Create `packages/pa-demo/e2e/plato-demo.spec.ts`. This is the sales demo script
as an executable test:

```ts
import { test, expect } from '@playwright/test';

// Selectors are resolved from the running app during Step 3 — see the note
// there. Every assertion below is behavioural, so it survives markup changes
// that a snapshot would not.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Start every test from the fixture baseline rather than whatever a previous
  // test left in localStorage.
  await page.getByRole('button', { name: /demo herstellen/i }).click();
  await expect(page.getByRole('button', { name: 'Beheerder' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('the demo bar declares itself and offers no Live', async ({ page }) => {
  await expect(page.getByText(/demonstratie/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /live/i })).toHaveCount(0);
});

test('Beheer shows nine sections and no IOU or Hulpmiddelen', async ({ page }) => {
  await page.getByRole('button', { name: 'Beheer' }).click();
  for (const label of [
    'Dossierbeheer',
    'Nieuw dossier',
    'Afwegingskader',
    'Signaalbronnen',
    'Zoekcriteria',
    'Curatiepijplijn',
    'Notificaties',
    'Profiel',
    'Rollen & rechten',
  ]) {
    await expect(page.getByRole('link', { name: label })).toBeVisible();
  }
  await expect(page.getByText('Feedback geven')).toHaveCount(0);
  await expect(page.getByText('Gereedschap')).toHaveCount(0);
});

test('switching role changes what Dossierbeheer permits', async ({ page }) => {
  await page.getByRole('button', { name: 'Beheer' }).click();
  await page.getByRole('link', { name: 'Dossierbeheer' }).click();

  // Beheerder: every capability on.
  await expect(page.getByTestId('cap-del')).toHaveAttribute('data-on', 'true');

  // Auteur: publishing and deleting are lost, and Dossierbeheer's own role
  // bar — disabled by design — follows the demo bar as a live readout.
  await page.getByRole('button', { name: 'Auteur' }).click();
  await expect(page.getByTestId('cap-publish')).toHaveAttribute('data-on', 'false');
  await expect(page.locator('.pac-db-roleseg-btn.active')).toHaveText('Auteur');
});

test('an authored dossier survives a reload and is dropped by a reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Beheer' }).click();
  await page.getByRole('link', { name: 'Nieuw dossier' }).click();

  const naam = `Demo-dossier ${Date.now()}`;
  await page.getByLabel(/naam/i).fill(naam);
  await page.getByRole('button', { name: /opslaan|aanmaken/i }).click();

  await page.getByRole('link', { name: 'Dossierbeheer' }).click();
  await expect(page.getByText(naam)).toBeVisible();

  // The persisted store is the point: a demo has to survive navigation.
  await page.reload();
  await page.getByRole('button', { name: 'Beheer' }).click();
  await page.getByRole('link', { name: 'Dossierbeheer' }).click();
  await expect(page.getByText(naam)).toBeVisible();

  await page.getByRole('button', { name: /demo herstellen/i }).click();
  await page.getByRole('button', { name: 'Beheer' }).click();
  await page.getByRole('link', { name: 'Dossierbeheer' }).click();
  await expect(page.getByText(naam)).toHaveCount(0);
});

test('the page issues no request to any backend', async ({ page }) => {
  // The behavioural counterpart to the CSP and the bundle gate: watch the
  // real network rather than trusting the configuration.
  const offSite: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') offSite.push(req.url());
  });

  await page.getByRole('button', { name: 'Monitoring' }).click();
  await page.getByRole('link', { name: 'Agenda' }).click();
  await page.getByRole('link', { name: 'Politiek (NL)' }).click();
  await page.waitForTimeout(1000);

  expect(offSite).toEqual([]);
});
```

- [ ] **Step 3: Run it to verify it fails, then fix the selectors**

Run: `npm run test:e2e --workspace=@ronl/pa-demo`
Expected: FAIL. The first failures will be selector mismatches, not logic
errors — the rail item roles (`link` vs `button`) and the create-dossier form's
field labels must be read off the running app.

Do **not** guess them. Run `npx playwright codegen http://localhost:5176`
against `npm run dev` and copy the real accessible names. Note that
`locator.count()` and `locator.isVisible()` do **not** auto-wait; use
`expect(...).toBeVisible()` and `toHaveCount()` as above, which do.

- [ ] **Step 4: Run until green**

Run: `npm run test:e2e --workspace=@ronl/pa-demo`
Expected: PASS, 5 tests.

- [ ] **Step 5: Observe the network assertion going red for the right reason**

Temporarily set `VITE_PA_AGENDA_MOCK=false` in `.env.development`.

Run: `npm run test:e2e --workspace=@ronl/pa-demo`
Expected: FAIL on _"the page issues no request to any backend"_ — `fetchAgenda`
falls through to `paGet('/pa/agenda')`. This is the concrete proof that the flag
is load-bearing. Restore it to `true` and re-run: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write "packages/pa-demo/e2e/**/*.ts"
git add packages/pa-demo/e2e
git commit -m "test(pa-demo): drive the demo journey end to end without a backend"
```

---

## Task 11: Deployment workflows and the drift workflow

**Files:**

- Create: `.github/workflows/azure-pa-demo-acc.yml`, `.github/workflows/azure-pa-demo-prod.yml`, `.github/workflows/pa-demo-drift.yml`
- Modify: `package.json` (root) — add `dev:pa-demo` and `build:pa-demo`

**Interfaces:**

- Consumes: `findDrift()` from Task 2; the build scripts from Task 1; two new repository secrets.

- [ ] **Step 1: Add the root scripts**

In `package.json`, after `"dev:public-site"` and `"build:public-site"`:

```json
    "dev:pa-demo": "npm run dev --workspace=@ronl/pa-demo",
    "build:pa-demo": "npm run build --workspace=@ronl/pa-demo",
```

Do **not** add it to the root `dev` script's `concurrently` list — `pa-demo`
needs no backend and adding it would slow the ordinary development loop for
everyone not working on it.

- [ ] **Step 2: Create `.github/workflows/azure-pa-demo-acc.yml`**

```yaml
name: Deploy PA Demo to Azure ACC

on:
  push:
    branches:
      - acc
    paths:
      - 'packages/pa-demo/**'
      - '.github/workflows/azure-pa-demo-acc.yml'
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - acc
  workflow_dispatch:

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy ACC PA Demo
    environment:
      name: acc
      url: https://acc.plato.open-regels.nl

    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          lfs: false

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build shared package
        run: npm run build --workspace=@ronl/shared

      - name: Lint
        working-directory: packages/pa-demo
        run: npm run lint

      - name: Type-check
        working-directory: packages/pa-demo
        run: npm run type-check

      - name: Unit tests
        working-directory: packages/pa-demo
        run: npm test

      - name: Vendored copy matches packages/frontend
        working-directory: packages/pa-demo
        run: npm run vendor:check

      - name: Build for ACC (includes the bundle gate)
        working-directory: packages/pa-demo
        run: |
          npm run build:acc
          test -f dist/index.html || (echo "ERROR: index.html not found!" && exit 1)
          test -f dist/staticwebapp.config.json || (echo "ERROR: SWA config not copied!" && exit 1)
          echo "✅ Build completed successfully"

      - name: Deploy to Azure Static Web Apps
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_ACC }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: 'upload'
          app_location: '/packages/pa-demo/dist'
          skip_app_build: true

  close_pull_request_job:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    name: Close Pull Request Job
    steps:
      - name: Close Pull Request
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_ACC }}
          action: 'close'
```

Note the `vendor:check` step: on this workflow it **does** block, because a
`packages/pa-demo/**` change that leaves the copy stale should not deploy. The
non-blocking variant in Step 4 is the one that watches the other direction.

- [ ] **Step 3: Create `.github/workflows/azure-pa-demo-prod.yml`**

Identical to Step 2 except: name `Deploy PA Demo to Azure Production`; trigger on
`branches: [main]` with no `pull_request` block and no `close_pull_request_job`;
`environment.name: production` and `url: https://plato.open-regels.nl`; build with
`npm run build:prod`; and the secret
`AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_PROD`.

- [ ] **Step 4: Create `.github/workflows/pa-demo-drift.yml`**

```yaml
name: PA Demo vendor drift

# Drift is caused by edits to packages/frontend, which never trigger the
# pa-demo deploy workflow — that one is path-filtered to packages/pa-demo/**.
# A drift check placed there would be green forever and catch nothing.
#
# This reports without blocking, deliberately. Failing the build would turn an
# unrelated cockpit PR red because a demo copy is stale, which trains people to
# ignore it. The @ronl/pa-cockpit extraction is what resolves the drift; this
# only has to keep it visible.
on:
  push:
    branches:
      - acc
    paths:
      - 'packages/frontend/src/**'
  pull_request:
    branches:
      - acc
    paths:
      - 'packages/frontend/src/**'
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
    name: Report vendored-copy drift
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Check for drift
        working-directory: packages/pa-demo
        run: |
          if node scripts/check-drift.mjs > drift.txt 2>&1; then
            cat drift.txt
            echo "::notice title=pa-demo::Vendored copy is in sync."
          else
            cat drift.txt
            echo "::warning title=pa-demo vendored copy is stale::$(head -1 drift.txt) Run 'npm run vendor:sync --workspace=@ronl/pa-demo' and re-run the pa-demo suite."
          fi
```

- [ ] **Step 5: Record the manual infrastructure steps**

These cannot be done from the repository and must be done before the first
deploy succeeds. Add them to the PR description:

1. Create two Azure Static Web Apps: `swa-ronl-pa-demo-acc` in `rg-ronl-acc`
   and `swa-ronl-pa-demo-prod` in `rg-ronl-prod`.
2. Add their deployment tokens as repository secrets
   `AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_ACC` and
   `…_PA_DEMO_PROD`.
3. Add two records to the `open-regels.nl` Azure DNS zone —
   `acc.plato` and `plato` — pointing at the respective SWA, and register each
   as a custom domain on its SWA.

- [ ] **Step 6: Validate the workflow files parse**

Run: `npx --yes yaml-lint .github/workflows/azure-pa-demo-acc.yml .github/workflows/azure-pa-demo-prod.yml .github/workflows/pa-demo-drift.yml`
Expected: no errors. If `yaml-lint` is unavailable, use
`python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/azure-pa-demo-*.yml .github/workflows/pa-demo-drift.yml`.

- [ ] **Step 7: Commit**

```bash
npx prettier --write package.json
git add .github/workflows package.json
git commit -m "ci(pa-demo): deploy to acc.plato and plato, and report vendor drift"
```

---

## Task 12: Documentation

**Files:**

- Create (other repo): `/home/steven/Development/iou-architectuur/docs/en/ronl-business-api/developer/testing/pa-demo.md`
- Modify (other repo): `…/testing/overview.md`, `…/testing/coverage.md`
- Modify (this repo): `docs/superpowers/specs/2026-08-24-public-pa-cockpit-design.md` — correct the forced-mock claim

The testing pages live in `iou-architectuur`, on branch `acc`. `pa-demo` makes a **fourth** tested package, so the umbrella tables need a row rather than just a new page.

- [ ] **Step 1: Correct the spec's forced-mock claim**

The spec says `isPaMock()` is forced true "ignoring `localStorage` entirely".
Task 8 established that is not achievable without editing a vendored file,
because `isPaMock()` is called by `pa.api.ts`'s own internal branches and an
aliased export would not reach them. Edit the spec's layer-1 wording to:

> 1. **Build-time default plus a boot-time write** — both legacy mock env vars
>    are `true`, so an absent key means mock, and `main.tsx` writes `'1'` to
>    `paV2.mock` before mounting so an inherited or stale key cannot win.

- [ ] **Step 2: Produce real figures**

Estimates and `grep -c "it("` are both explicitly forbidden by the testing
guide; the latter miscounts multi-line and parameterised cases.

```bash
npx vitest run --config packages/pa-demo/vite.config.ts \
  --reporter=json --outputFile=/tmp/pa-demo-tests.json
node -e "const r=require('/tmp/pa-demo-tests.json');console.log('files',r.numTotalTestSuites,'tests',r.numTotalTests,'passed',r.numPassedTests)"
npm run test:e2e --workspace=@ronl/pa-demo
```

Record: file count, test count, wall time, the coverage percentages printed by
the run, and the E2E figures with the date measured.

- [ ] **Step 3: Write `testing/pa-demo.md`**

Follow `testing/public-site.md`'s structure exactly: front-matter
`component: RONL Business API`; a one-line summary with the measured counts; an
**Inventory** table by area; a **Playwright suite** section; a **CI** section.

Cover, specifically:

- that coverage excludes `src/vendor/**`, and why — those files are covered by
  the frontend suite, and counting them would make the fork look well-tested
  while demo-owned code hid behind it;
- the four no-Live guarantees and which test asserts each;
- that the bundle gate's forbidden list differs from `public-site`'s, and why
  the bare word `keycloak` is permitted here;
- that the E2E suite needs no backend, unlike every other suite in the repo.

- [ ] **Step 4: Update `testing/overview.md`**

Four edits:

1. The opening sentence — "three tested packages" becomes four, naming
   `packages/pa-demo` (Vitest + jsdom).
2. The **At a glance** table — add a `packages/pa-demo` row with the measured
   figures, and update the `235 files · 2865 tests` total beneath it.
3. The **Where to look** table — add a row linking `pa-demo.md`.
4. The **Running the tests** table — add
   `npm test --workspace=@ronl/pa-demo` with its file and test counts, and
   update the `npm test` row's totals.

Also update the measurement banner: it currently attributes every figure to
v2026.08.23 measured on 22 August. State the date this run was made and which
figures it covers.

- [ ] **Step 5: Update `testing/coverage.md`**

Add a `pa-demo` section in the same shape as the other packages, and add it to
any headline table. Note the `src/vendor/**` exclusion there too — a reader
comparing packages will otherwise wonder why a 38-file vendored tree does not
appear.

- [ ] **Step 6: Commit both repositories**

```bash
cd /home/steven/Development/ronl-business-api
npx prettier --write docs/superpowers/specs/2026-08-24-public-pa-cockpit-design.md
git add docs/superpowers/specs
git commit -m "docs(spec): correct how forced mock mode is actually achieved"

cd /home/steven/Development/iou-architectuur
git add docs/en/ronl-business-api/developer/testing
git commit -m "docs: add the pa-demo suite and make it the fourth tested package"
```

Do not push either repository. `acc` in both is a shared branch.

---

## Definition of done

- [ ] `npm test --workspace=@ronl/pa-demo` green, coverage excludes `src/vendor/**`
- [ ] `npm run lint --workspace=@ronl/pa-demo` and `npm run type-check --workspace=@ronl/pa-demo` clean
- [ ] `npm run vendor:check --workspace=@ronl/pa-demo` reports all 38 files in sync
- [ ] `npm run build --workspace=@ronl/pa-demo` completes and the bundle gate prints clean
- [ ] `npm run test:e2e --workspace=@ronl/pa-demo` green with no backend running
- [ ] Every negative assertion has been observed failing for its intended reason and restored
- [ ] Beheer shows nine sections; no IOU, Hulpmiddelen or assistant dock anywhere, including ⌘K
- [ ] Switching role in the demo bar visibly changes what Dossierbeheer permits
- [ ] No live/mock toggle exists anywhere in the UI
- [ ] Testing docs updated in `iou-architectuur` from a measured run
- [ ] Nothing pushed; both repositories left with local commits only
