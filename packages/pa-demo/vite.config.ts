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
