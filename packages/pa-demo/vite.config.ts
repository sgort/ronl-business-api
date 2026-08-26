import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { originForMode, rewriteSocialCardOrigin } from './scripts/social-card-origin';

// Stamped onto the mock demo store's persisted state, so shipping a release
// with changed fixtures resets every visitor instead of leaving them on a
// browser copy of the previous ones.
const pkgVersion = (createRequire(import.meta.url)('./package.json') as { version: string })
  .version;

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      // index.html is authored against the production origin (see the comment
      // there). Rewrite it to whatever origin this build is for, so an ACC
      // deploy's link previews do not point at a domain that is not live yet.
      // public-site does the same thing in its prerender step; pa-demo has no
      // prerender, so it happens here.
      name: 'pa-demo-social-card-origin',
      transformIndexHtml(html: string) {
        return rewriteSocialCardOrigin(html, originForMode(mode));
      },
    },
  ],
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
  // No `resolve.alias`. There used to be two, both compensating for the
  // vendored copy: one redirected every relative spelling of './modes.config'
  // to the demo's filtered stand-in, the other redirected ChangelogPanel's
  // './changelog-data' to a curated one. Both were Vite-only, so tsc and Vite
  // deliberately resolved the same specifier to different files — a divergence
  // that needed its own parity tests to catch a name silently becoming
  // `undefined`. The demo now passes its narrowed modes and its own changelog
  // panel to @ronl/pa-cockpit as host data (see src/demo/pa-cockpit-host.tsx),
  // which needs no resolver trickery at all. Do not reintroduce an alias here
  // to reach inside the package.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      // No 'src/vendor/**' entry any more — there is nothing to exclude. What
      // it used to hide (the cockpit itself) is now @ronl/pa-cockpit, covered
      // by that package's own suite, so these figures are this package's own
      // code and nothing else.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
    },
  },
}));
