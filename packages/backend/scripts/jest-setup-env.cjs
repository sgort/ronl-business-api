// packages/backend/scripts/jest-setup-env.cjs
//
// Runs before the test framework and before any module is imported.
//
// utils/config.ts calls validateConfig() at import and it has no test skip --
// its own comment says so, explaining why the ValidSign requirements are
// conditional: "Unconditional requirements here would break every test".
// ANTHROPIC_API_KEY is the one requirement that is unconditional, so any test
// that transitively imports config needs it set.
//
// Most route tests avoid this by mocking @utils/config wholesale. That does not
// work for src/routes/registry.test.ts and src/openapi/coverage.test.ts (#200),
// which import the registry and therefore EVERY route module: a stub would have
// to satisfy every field each of them reads, and would then be a second, drifting
// copy of the config shape. Setting the one variable lets the real config load.
process.env.ANTHROPIC_API_KEY ??= 'sk-test-not-a-real-key';
