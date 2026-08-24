// OVERLAY FILE — not vendored, not in scripts/vendor-manifest.mjs.
//
// Mirrors the path packages/frontend/src/components/PADashboardV2/PASectionRouter.tsx
// occupies so that the vendored copy's
// `../components/PADashboardV2/PASectionRouter` import resolves without
// editing the vendored files that write it. The real PASectionRouter is
// deliberately not vendored at all — see the manifest's exclusion comment —
// because it is the only carrier of the six `../CaseworkerDashboard/*`
// imports. See src/vendor/README.md for why this file exists here instead
// of behind an alias, and why it is exempt from `vendor:sync` /
// `vendor:check`.
export { default } from '../../../demo/DemoSectionRouter';
