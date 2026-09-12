/// <reference types="vite/client" />

/**
 * The env and `define` contract this package expects its hosts to satisfy.
 *
 * `packages/pa-cockpit` has no Vite config of its own — it ships raw source
 * for `packages/frontend` and `packages/pa-demo` to bundle with their own
 * Vite builds — so this file exists purely to give `tsc` declarations for
 * what those hosts are expected to provide, not to configure anything at
 * runtime.
 *
 * `VITE_API_URL` is optional, not because it is optional in general, but
 * because `packages/pa-demo` deliberately never sets it: the demo is
 * mock-only, `${undefined}/pa/...` resolves to a same-origin relative URL,
 * and its CSP (`connect-src 'self'`) plus forced mock mode mean no request
 * is ever issued. `packages/frontend` does supply it. Declaring it required
 * here would type-check regardless — an ambient declaration is never
 * checked against a real host — while being false for one of the two hosts
 * this package ships to.
 *
 * If a fifth key is ever added here, both hosts must supply it (unless it
 * is given the same documented optional treatment as `VITE_API_URL`).
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PA_DOSSIERS_MOCK?: string;
  readonly VITE_PA_SIGNALS_MOCK?: string;
  readonly VITE_PA_AGENDA_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by each host's vite.config.ts via a Vite `define`. */
declare const __APP_VERSION__: string;
