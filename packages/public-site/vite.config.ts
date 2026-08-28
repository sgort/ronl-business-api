import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Injected as a global so the footer can show the current release — the
// public-site package version, which bump-release keeps in sync with the latest
// `public-site` changelog entry.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5175,
    host: '0.0.0.0',
  },
  test: {
    environment: 'jsdom',
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
    exclude: [...configDefaults.exclude, 'e2e/**'],
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
