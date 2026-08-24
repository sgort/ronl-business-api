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
  // src/vendor is byte-identical to packages/frontend, so its imports are
  // written against that tree. modes.config is the one alias target that
  // collides with a real vendored file — the other five (keycloak, tenant,
  // SessionExpiryWarning, PADock, PASectionRouter) are handled instead by
  // thin re-export overlay files physically placed at their mirrored paths
  // inside src/vendor/ (e.g. src/vendor/services/keycloak.ts). Those need no
  // alias at all: both Vite and tsc resolve a relative import to a real file
  // that exists at that path without help. See src/vendor/README.md for why
  // — in short, TypeScript's `paths` only rewrites non-relative specifiers,
  // and ambient wildcard `declare module` re-exports resolve the "cannot
  // find module" errors but silently break JSX contextual typing for every
  // callback prop the redirected component takes (confirmed empirically).
  //
  // modes.config can't use the overlay-file trick because a real vendored
  // file already occupies that path — the overlay would BE the vendored
  // file, i.e. an edit. So only Vite is redirected here (to the demo's
  // filtered mode config); tsc is left to resolve the import to the real
  // vendored modes.config.ts, which is sound because modes.filtered.ts
  // re-exports the same names and types.
  resolve: {
    alias: [
      // Matches all four forms actually used in the vendored tree:
      // './modes.config' (within public-affairs-v2/ itself),
      // './public-affairs-v2/modes.config' (from pages/),
      // '../../pages/public-affairs-v2/modes.config' (from components/PADashboardV2/)
      // and '../../../pages/public-affairs-v2/modes.config' (from dossierbeheer/).
      {
        find: /^(\.\.?\/)+(pages\/)?(public-affairs-v2\/)?modes\.config$/,
        replacement: fileURLToPath(new URL('./src/demo/modes.filtered.ts', import.meta.url)),
      },
    ],
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
