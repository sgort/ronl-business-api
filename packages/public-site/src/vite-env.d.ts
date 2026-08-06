/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STAFF_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
