/**
 * Test-only helpers, exported deliberately via the `@ronl/pa-cockpit/test-utils`
 * subpath for host packages whose own tests mock or render cockpit code.
 *
 * Current consumer: packages/pa-demo's DemoSectionRouter.test.tsx, which
 * stubs `PaSectionsRouter` by spreading the real `@ronl/pa-cockpit` module and
 * overriding one name, then uses `expectMockNamesRealExports` to assert the
 * override still corresponds to something the package actually exports. That
 * is precisely the failure mode mockModule.ts's own header describes, arriving
 * across a package boundary where the host cannot see a rename land.
 *
 * `makePaDataStub` is offered for the same reason — a host test that renders a
 * cockpit component needing PaDataProvider should use the canonical stub the
 * cockpit's own tests use, not a differently-shaped hand-rolled object. It has
 * no host consumer today; it is kept exported alongside its sibling rather
 * than withdrawn, because the two are one facility and the subpath is live.
 *
 * This is not part of the package's runtime surface — nothing here is meant
 * to be imported by application code, only by test files.
 */
export { expectMockNamesRealExports } from './mockModule';
export { makePaDataStub } from './paData.stub';
