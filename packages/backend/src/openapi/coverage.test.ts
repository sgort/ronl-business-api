// Keeps openapi/openapi.yaml and the Express routes in step (#200).
//
// Until #214 this file also carried a pending list: the operations not yet
// described, in openapi/pending.json, with a ceiling assertion that only ever
// moved down. The last documentation phase emptied it, so the three rules that
// read it became trivially true and were deleted along with the file. What is
// left are the three rules that say something permanent — every served
// operation is documented, every documented operation is served, and both
// lists were actually loaded.
//
// There is no ceiling any more, and no way back to one: a route added without
// a description now fails here rather than being allowed in with the number
// bumped.

// The registry imports every route module. The real @utils/config is used --
// scripts/jest-setup-env.cjs provides the one variable validateConfig() demands --
// because a stub would have to satisfy every field 19 route modules read.
jest.mock('@utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: stub, createLogger: () => stub };
});

import { routeRegistry } from '../routes/registry';
import { readOpenApiDocument } from './document';
import { listDocumentedOperations, listServedOperations } from './testing/routeOperations';

const served = listServedOperations(routeRegistry);
const documented = listDocumentedOperations(readOpenApiDocument());

describe('OpenAPI coverage of the /v1 routes', () => {
  // linked-data-explorer added this rule LAST, after noticing that the two
  // comparisons below cross-check each other but both pass when either side is
  // empty -- a document that failed to parse and a registry that failed to
  // load agree with each other perfectly. Taken from the start here rather
  // than rediscovered.
  test('both sides were actually loaded', () => {
    expect(served.length).toBeGreaterThan(0);
    expect(documented.length).toBeGreaterThan(0);
  });

  test('every served operation is documented', () => {
    expect(served.filter((op) => !documented.includes(op))).toEqual([]);
  });

  test('every documented operation is served', () => {
    expect(documented.filter((op) => !served.includes(op))).toEqual([]);
  });
});
