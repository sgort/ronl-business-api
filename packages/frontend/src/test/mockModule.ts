/**
 * Helpers for module mocks that are built on the real module rather than
 * replacing it.
 *
 * A `vi.mock(path, () => ({ ...handWritten }))` factory replaces the module
 * wholesale, so anything the module gains later is simply absent: a function
 * becomes `undefined` at the call site, and a constant spreads to nothing. The
 * second is the nastier one — `...EU_DOCUMENT_TYPES` against an omitted export
 * produced a 500 from GET /v1/pa/types, and the mock, not the code, was wrong.
 *
 * The fix has two halves, and they live in different places because a vi.mock
 * factory is hoisted above the imports and so cannot call anything imported:
 *
 *   1. In the factory, spread the real module before the overrides:
 *
 *        vi.mock('../../services/pa.api', async (importActual) => ({
 *          ...(await importActual<typeof import('../../services/pa.api')>()),
 *          ...paApi,
 *        }));
 *
 *      A member nobody thought to stub then keeps its real implementation. For
 *      data exports that is simply correct; for network calls it turns
 *      "undefined is not a function" into a request that fails by name.
 *
 *   2. In an ordinary test, assert the mock only names real exports — see
 *      expectMockNamesRealExports below. That catches the other direction: a
 *      rename or a typo leaves the stub standing in for something nothing reads,
 *      which spreading cannot detect.
 *
 * Pass `vi.importActual(path)`, never `import(path)`: the path is mocked, so a
 * plain dynamic import hands back the mock and the assertion compares the mock
 * with itself. It passes, always, and proves nothing.
 */
import { expect } from 'vitest';

/**
 * Fails when the hand-written mock declares a key the real module does not
 * export.
 *
 * `actual` must come from `vi.importActual(path)`. A plain `import(path)` is
 * intercepted by the very mock under test, which makes this assertion vacuous.
 */
export async function expectMockNamesRealExports(
  actual: Promise<object>,
  mock: Record<string, unknown>
): Promise<void> {
  const real = await actual;
  const unknown = Object.keys(mock).filter((k) => !(k in real));
  expect(
    unknown,
    `mock declares exports the real module does not have: ${unknown.join(', ')}`
  ).toEqual([]);
}
