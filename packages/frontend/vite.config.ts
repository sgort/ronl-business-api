import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The released version of this build. bump-release writes it to package.json,
// so it changes exactly when a release ships — which is what the mock demo
// store stamps its persisted state with, so a new deployment serves the new
// fixtures instead of a browser's copy of the previous ones.
const pkgVersion = (createRequire(import.meta.url)('./package.json') as { version: string })
  .version;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  // @ronl/shared is a workspace-linked package that compiles to CommonJS
  // (for the Node/backend consumer). Vite doesn't apply CJS→ESM interop to
  // local/linked packages unless they're in its dependency optimizer, so
  // real (non-type-only) value imports from it fail with "does not provide
  // an export named ..." in the browser. Including it here forces esbuild's
  // optimizer to process it, which detects and exposes its named exports.
  optimizeDeps: {
    include: ['@ronl/shared'],
  },
  // The dev-server fix above (optimizeDeps) only covers `vite dev` —
  // production builds go through Rollup directly, which by default only
  // runs its CommonJS→ESM interop on node_modules/**. @ronl/shared resolves
  // to a relative workspace path (../shared/dist), not a node_modules
  // symlink, so it was never being interop-transformed at all: Rollup
  // parsed it as plain ESM, saw no `export` keyword, and reported every
  // named value import as missing. Explicitly including it here makes
  // Rollup's CJS plugin actually process it.
  build: {
    commonjsOptions: {
      include: [/shared\/dist/, /node_modules/],
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // jsdom component tests are CPU-bound, and Vitest's 5s default is not a
    // budget — it is a hang detector. On a saturated machine it fires as one.
    // Measured: the frontend suite is 839/839 green in five consecutive parallel
    // runs on an idle box, and produces 8-16 failures under concurrent load, every
    // one of them "Test timed out in 5000ms" across a file set that changes with
    // how busy the machine is. At 20s the same load is green with zero timeouts.
    // Raising it costs no coverage — a genuinely hung test still fails, four times
    // slower. See ChangelogPanel.test.tsx for a file that needs more even than
    // this, and *.perf.test.ts for the budgets that deliberately do measure speed.
    testTimeout: 20000,
    // Resolved against this file, not the process cwd, so the documented
    // single-file command (`npx vitest run --config packages/<pkg>/vite.config.ts
    // <pattern>`) works from the repo root as well as from the package.
    setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    // e2e/ holds Playwright specs (see e2e/playwright.config.ts) — Vitest's
    // default testMatch would otherwise also pick up its *.spec.ts files
    // and fail trying to import them as Vitest tests.
    // *.perf.test.ts asserts wall-clock budgets, which measure the machine as
    // much as the code when 130 test files run in parallel. They are run
    // separately by `npm run test:perf`, with file parallelism disabled.
    exclude: [...configDefaults.exclude, 'e2e/**', 'src/**/*.perf.test.ts'],
    coverage: {
      provider: 'v8',
      // Vitest's default is to skip writing the report when any test fails,
      // which loses the coverage figures exactly when a run goes red. Keep it.
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
    },
  },
});
