/**
 * Assertion for hand-written jest module mocks.
 *
 * The mocks in this repo now spread `jest.requireActual` before their
 * overrides, which stops an export added later from going silently missing —
 * that is how EU_DOCUMENT_TYPES disappeared from pa.routes.test's eu.client
 * mock and made GET /v1/pa/types answer 500 while every test passed.
 *
 * Spreading cannot see the other direction. If `fetchEuFeed` were renamed, the
 * mock would still declare the old name, the spread would supply the real
 * function under the new one, and the suite would quietly call the real
 * implementation — a live network request in a unit test, no longer stubbed by
 * anything. This catches that: every key the override object declares must
 * exist on the real module.
 *
 * Pass `jest.requireActual(path)`, never `require(path)`. The path is mocked,
 * so a plain require hands back the mock and the assertion compares the mock
 * with itself: it passes unconditionally and proves nothing. The frontend
 * equivalent had exactly this bug before it was caught by deliberately breaking
 * it — see src/test/mockModule.ts there.
 *
 * Usage — name the overrides so both the factory and the test can see them.
 * jest requires out-of-scope names referenced in a factory to start with
 * "mock":
 *
 *   const mockEuOverrides = { fetchEuFeed: jest.fn() };
 *   jest.mock('./sources/eu.client', () => ({
 *     ...jest.requireActual('./sources/eu.client'),
 *     ...mockEuOverrides,
 *   }));
 *
 *   it('the eu.client mock only names real exports', () => {
 *     expectMockNamesRealExports(jest.requireActual('./sources/eu.client'), mockEuOverrides);
 *   });
 */
export function expectMockNamesRealExports(actual: unknown, mock: Record<string, unknown>): void {
  const real = actual as Record<string, unknown>;
  const unknown = Object.keys(mock).filter((key) => !(key in real));
  if (unknown.length) {
    throw new Error(
      `Mock declares ${unknown.map((k) => `"${k}"`).join(', ')}, which the real module does not ` +
        `export. Either the export was renamed or the mock has a typo — either way the override ` +
        `stubs nothing, and the real implementation runs instead.`
    );
  }
}
