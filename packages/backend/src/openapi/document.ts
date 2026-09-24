// packages/backend/src/openapi/document.ts
//
// The published OpenAPI description (#200). Written by hand in
// openapi/openapi.yaml and built to openapi/openapi.json by
// scripts/build-openapi.cjs. This module reads only the JSON, so the YAML
// parser stays a development dependency and never reaches the production tree
// -- which #204 has just finished shrinking.

import fs from 'fs';
import path from 'path';

/**
 * <package root>/openapi/openapi.json: packages/backend/ from src/openapi, and
 * the package root from dist/openapi in the built artifact. The same relative
 * step is how package.json is resolved elsewhere in this backend.
 */
export const OPENAPI_JSON_PATH = path.resolve(__dirname, '../../openapi/openapi.json');

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; [key: string]: unknown };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

/** Throws when the file is missing or does not hold an OpenAPI document. */
export function readOpenApiDocument(file: string = OPENAPI_JSON_PATH): OpenApiDocument {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('openapi' in parsed) ||
    !('paths' in parsed)
  ) {
    throw new Error(`${file} is not an OpenAPI document`);
  }

  return parsed as OpenApiDocument;
}
