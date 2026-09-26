// Keeps openapi/openapi.yaml, openapi/pending.json and the Express routes in
// step (#200). pending.json lists the operations not described yet; the list
// may only shrink, and the last documentation phase empties it. When it is
// empty the two `pending` rules become trivially true and can be deleted along
// with the file.

// The registry imports every route module. The real @utils/config is used --
// scripts/jest-setup-env.cjs provides the one variable validateConfig() demands --
// because a stub would have to satisfy every field 19 route modules read.
jest.mock('@utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: stub, createLogger: () => stub };
});

import fs from 'fs';
import path from 'path';

import { routeRegistry } from '../routes/registry';
import { readOpenApiDocument } from './document';
import { listDocumentedOperations, listServedOperations } from './testing/routeOperations';

const PENDING_PATH = path.resolve(__dirname, '../../openapi/pending.json');

const pending: string[] = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
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

  test('every served operation is documented or pending', () => {
    expect(served.filter((op) => !documented.includes(op) && !pending.includes(op))).toEqual([]);
  });

  test('no pending operation is already documented', () => {
    expect(pending.filter((op) => documented.includes(op))).toEqual([]);
  });

  test('every pending operation is still served', () => {
    expect(pending.filter((op) => !served.includes(op))).toEqual([]);
  });

  test('every documented operation is served', () => {
    expect(documented.filter((op) => !served.includes(op))).toEqual([]);
  });

  test('pending lists each operation once', () => {
    expect(new Set(pending).size).toBe(pending.length);
  });

  // The ceiling. Documenting a group removes its entries from pending; nothing
  // may ever add one back, because that would mean a route shipped without a
  // description. Lower this number as phases land -- it is the only assertion
  // here that measures progress rather than consistency.
  test('the pending list only shrinks', () => {
    expect(pending.length).toBeLessThanOrEqual(35);
  });
});
