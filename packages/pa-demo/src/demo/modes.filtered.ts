/**
 * Placeholder for the demo's curated mode/section config.
 *
 * Task 4 replaces this with a filtered view of the vendored modes.config —
 * e.g. trimming write-oriented Beheer sections that don't belong on a
 * public, unauthenticated visitor. For now it re-exports the vendored
 * config unchanged so Task 3 can verify the alias wiring end-to-end: tsc
 * type-checks the vendored import against the real modes.config.ts (the one
 * file this alias map collides with — see src/vendor/README.md), while Vite
 * resolves the same specifier to this file at runtime.
 */
export * from '../vendor/pages/public-affairs-v2/modes.config';
