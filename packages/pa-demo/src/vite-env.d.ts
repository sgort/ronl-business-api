/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_PA_DOSSIERS_MOCK?: string;
  readonly VITE_PA_SIGNALS_MOCK?: string;
  readonly VITE_PA_AGENDA_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
