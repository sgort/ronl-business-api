/// <reference types="vite/client" />
/// <reference types="altcha/types/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_LDE_API_URL: string;
  readonly VITE_PA_SIGNALS_MOCK?: string;
  readonly VITE_PA_DOSSIERS_MOCK?: string;
  readonly VITE_PA_AGENDA_MOCK?: string;
  /** Commit SHA of the build, injected by the deploy workflows. Absent locally. */
  readonly VITE_BUILD_SHA?: string;
  /** GitHub Actions run number, injected by the deploy workflows. Absent locally. */
  readonly VITE_BUILD_RUN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts from packages/frontend/package.json. */
declare const __APP_VERSION__: string;
