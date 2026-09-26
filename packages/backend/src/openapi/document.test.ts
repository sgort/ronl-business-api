import fs from 'fs';
import os from 'os';
import path from 'path';

import { OPENAPI_JSON_PATH, readOpenApiDocument } from './document';

function writeTemp(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-document-'));
  const file = path.join(dir, 'openapi.json');
  fs.writeFileSync(file, contents);
  return file;
}

describe('readOpenApiDocument', () => {
  test('reads the real built document', () => {
    // Built by scripts/jest-global-setup.cjs before this run, so it is the
    // document this backend actually serves rather than a fixture.
    const document = readOpenApiDocument();
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
  });

  test('the default path points inside the package, not the repository root', () => {
    expect(OPENAPI_JSON_PATH.endsWith(path.join('openapi', 'openapi.json'))).toBe(true);
  });

  test('rejects JSON that is not an OpenAPI document', () => {
    expect(() => readOpenApiDocument(writeTemp('{"nope":true}'))).toThrow(
      'is not an OpenAPI document'
    );
  });

  test('rejects a document with no paths', () => {
    expect(() => readOpenApiDocument(writeTemp('{"openapi":"3.1.0"}'))).toThrow(
      'is not an OpenAPI document'
    );
  });

  // null is typeof 'object', so it needs its own case: without the explicit
  // null check the `in` operator below it would throw a TypeError instead of
  // the message a caller can act on.
  test('rejects a null document', () => {
    expect(() => readOpenApiDocument(writeTemp('null'))).toThrow('is not an OpenAPI document');
  });

  test('rejects JSON that is not an object at all', () => {
    expect(() => readOpenApiDocument(writeTemp('"a string"'))).toThrow(
      'is not an OpenAPI document'
    );
  });

  test('propagates a missing file rather than masking it', () => {
    expect(() => readOpenApiDocument('/nonexistent/openapi.json')).toThrow(/ENOENT/);
  });
});
