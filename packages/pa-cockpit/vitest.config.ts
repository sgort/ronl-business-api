import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
