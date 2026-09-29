// packages/backend/src/openapi/testing/conformance.ts
//
// Test helper: assert that a real response matches what the OpenAPI document
// describes for that operation (#269, the last acceptance criterion of #200).
// Route tests call it, so a handler change that alters a response shape fails
// the handler's own test rather than later, in a consumer, against a document
// that quietly stopped being true.
//
// WHY THIS EXISTS SEPARATELY FROM THE COVERAGE GATE. coverage.test.ts compares
// two LISTS of operations, so an operation cannot vanish from the document. It
// says nothing about the BODIES. Until this landed, a response could drift away
// from its published schema with every test still green -- and it had. #214
// found three of them in what phase 3 published, all deployed for weeks:
//
//   - /process/{instanceId}/decision-document documented as { success, data }
//     while the handler has always sent { success, template }
//   - start and complete documented as taking the wrapped variable form, which
//     they double-wrap
//   - responses/Unauthorized naming a code the token path never emits
//
// Ported from linked-data-explorer, which built it in its own #129 and has run
// it across 20 route test files since. Taken rather than redesigned, including
// the three details below, each of which is a trap discovered there.
//
// Never loaded at runtime. It lives under src/ so it is type-checked, linted
// and held to the per-file branch floor like everything else.

import fs from 'fs';

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { Response } from 'supertest';

import { OpenApiDocument, readOpenApiDocument } from '../document';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface MediaTypeObject {
  schema?: unknown;
}

interface ResponseObject {
  content?: Record<string, MediaTypeObject>;
}

interface OperationObject {
  responses?: Record<string, ResponseObject>;
}

/**
 * OpenAPI refers to shared schemas as #/components/schemas/X. Compiled as one
 * standalone JSON Schema, they sit under $defs, so the references move with them.
 */
function toJsonSchema(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).split('#/components/schemas/').join('#/$defs/'));
}

function isJson(contentType: string): boolean {
  return contentType === 'application/json' || contentType.endsWith('+json');
}

/**
 * Every operation this helper has been asked about, appended to the file named
 * by CONFORMANCE_LOG. scripts/jest-conformance-teardown.cjs reads it and fails
 * the run if an operation in the document was never checked.
 *
 * A file rather than a module-level Set, because Jest gives each test file its
 * own module registry and worker -- nothing in-process can see across them.
 * Recorded BEFORE the assertions below, so an operation still counts as
 * covered when its check fails: the checker answers "is anything unchecked",
 * and the failing test itself answers "is it right".
 */
function record(method: HttpMethod, path: string): void {
  const log = process.env.CONFORMANCE_LOG;
  if (!log) return;
  try {
    fs.appendFileSync(log, `${method} ${path}\n`);
  } catch {
    // A missing log is not a reason to fail somebody's test run.
  }
}

/**
 * Throws with a message naming the operation when `res` disagrees with the
 * document. Checks four things, in order:
 *
 *   1. the operation is documented at all
 *   2. this status is documented for it (falling back to `default`)
 *   3. a 2xx carries API-Version -- ADR API-57, set by version.middleware.ts
 *   4. the content type is documented, and the body matches its schema
 *
 * `path` is the DOCUMENT's path, so it carries no /v1 prefix (the major version
 * lives in the server URL) and uses {braces}: '/task/{id}/variables'.
 */
export function expectToMatchOperation(
  res: Response,
  method: HttpMethod,
  path: string,
  document: OpenApiDocument = readOpenApiDocument()
): void {
  const label = `${method.toUpperCase()} ${path}`;
  record(method, path);

  const operation = document.paths[path]?.[method] as OperationObject | undefined;
  if (!operation) throw new Error(`${label} is not documented`);

  const responses = operation.responses ?? {};
  const response = responses[String(res.status)] ?? responses.default;
  if (!response) throw new Error(`${label} does not document status ${res.status}`);

  // ADR API-57: every successful response carries the version.
  if (String(res.status).startsWith('2') && res.headers['api-version'] === undefined) {
    throw new Error(`${label} answered ${res.status} without the API-Version header`);
  }

  const content = response.content ?? {};
  const documentedTypes = Object.keys(content);
  if (documentedTypes.length === 0) return;

  const contentType = String(res.headers['content-type'] ?? '')
    .split(';')[0]
    .trim();
  const media = content[contentType];
  if (!media) {
    throw new Error(
      `${label} answered ${res.status} with ${contentType || 'no content type'}; ` +
        `documented: ${documentedTypes.join(', ')}`
    );
  }
  if (media.schema === undefined) return;

  // Ajv2020, not the default export: OpenAPI 3.1 IS JSON Schema 2020-12, and
  // the default is draft-07, which silently reads `const` and `$defs`
  // differently.
  //
  // strictSchema stays ON, so a misspelled keyword in the document fails loudly
  // rather than being ignored -- a typo'd constraint that validates everything
  // is exactly the failure this helper exists to catch. These four are OpenAPI
  // 3.1 keywords that JSON Schema 2020-12 does not define.
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false, strictTuples: false });
  ajv.addVocabulary(['example', 'discriminator', 'xml', 'externalDocs']);
  addFormats(ajv);

  const validate = ajv.compile({
    ...(toJsonSchema(media.schema) as Record<string, unknown>),
    $defs: toJsonSchema(document.components?.schemas ?? {}),
  });

  const body: unknown = isJson(contentType) ? res.body : res.text;
  if (!validate(body)) {
    throw new Error(
      `${label} answered ${res.status} with a body that does not match the document:\n` +
        ajv.errorsText(validate.errors, { separator: '\n' })
    );
  }
}
