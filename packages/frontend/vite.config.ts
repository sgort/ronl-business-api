import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ holds Playwright specs (see e2e/playwright.config.ts) — Vitest's
    // default testMatch would otherwise also pick up its *.spec.ts files
    // and fail trying to import them as Vitest tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
    },
  },
});
