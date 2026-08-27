// OVERLAY FILE — not vendored, not in scripts/vendor-manifest.mjs.
//
// Mirrors the path packages/frontend/src/components/PADashboardV2/PADock.tsx
// occupies so that the vendored copy's `../components/PADashboardV2/PADock`
// import resolves without editing the vendored files that write it. The real
// PADock is deliberately not vendored at all — see the manifest's exclusion
// comment — because it pulls in McpChatSection and real MCP/LLM calls. See
// src/vendor/README.md for why this file exists here instead of behind an
// alias, and why it is exempt from `vendor:sync` / `vendor:check`.
export { default } from '../../../demo/shims/PADock';
