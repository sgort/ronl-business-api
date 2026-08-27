// OVERLAY FILE — not vendored, not in scripts/vendor-manifest.mjs.
//
// Mirrors the path packages/frontend/src/services/tenant.ts occupies so
// that the vendored copy's `../services/tenant` import resolves without
// editing the vendored files that write it. See src/vendor/README.md for
// why this file exists here instead of behind an alias, and why it is
// exempt from `vendor:sync` / `vendor:check`.
export * from '../../demo/shims/tenant';
