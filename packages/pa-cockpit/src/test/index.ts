/**
 * Test-only helpers, exported deliberately via the `@ronl/pa-cockpit/test-utils`
 * subpath for host packages whose own tests render cockpit components (e.g.
 * packages/frontend's PASectionRouter.test.tsx, which mocks PaDataProvider
 * against the same canonical stub the cockpit's own tests use).
 *
 * This is not part of the package's runtime surface — nothing here is meant
 * to be imported by application code, only by test files.
 */
export { expectMockNamesRealExports } from './mockModule';
export { makePaDataStub } from './paData.stub';
