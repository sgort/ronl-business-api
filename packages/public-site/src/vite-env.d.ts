/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STAFF_APP_URL: string;
  /** The site's own public origin, shown in the footer. Set per environment. */
  readonly VITE_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Current release (public-site package version), injected by Vite `define`. */
declare const __APP_VERSION__: string;
