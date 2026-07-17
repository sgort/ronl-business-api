/// <reference types="vite/client" />
/// <reference types="altcha/types/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_LDE_API_URL: string;
  readonly VITE_PA_SIGNALS_MOCK?: string;
  readonly VITE_PA_DOSSIERS_MOCK?: string;
  readonly VITE_PA_AGENDA_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
