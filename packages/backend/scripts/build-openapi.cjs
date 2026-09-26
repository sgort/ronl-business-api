#!/usr/bin/env node
// packages/backend/scripts/build-openapi.cjs
//
// Builds openapi/openapi.json from the hand-written openapi/openapi.yaml (#200).
//
// info.version is taken from package.json here, never written in the YAML, so
// the published document and the release cannot disagree.
//
// The JSON is generated and gitignored: a committed copy of a generated file is
// a second source waiting to drift. npm runs this before `build` and `dev`, and
// scripts/jest-global-setup.cjs runs it before every Jest run, because CI runs
// the tests before it builds.

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(PACKAGE_ROOT, 'openapi', 'openapi.yaml');
const TARGET = path.join(PACKAGE_ROOT, 'openapi', 'openapi.json');

function buildOpenApiDocument(source, version) {
  const document = YAML.parse(source);
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error('openapi.yaml does not contain an object');
  }
  if (document.info && Object.prototype.hasOwnProperty.call(document.info, 'version')) {
    throw new Error('openapi.yaml must not set info.version; it is taken from package.json');
  }
  return { ...document, info: { ...document.info, version } };
}

function buildOpenApi() {
  const { version } = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const document = buildOpenApiDocument(fs.readFileSync(SOURCE, 'utf8'), version);
  // Write to a temporary file and rename it into place, so a concurrent reader
  // (an overlapping Jest run, or the dev server's first request) never sees
  // half-written JSON.
  const temporary = `${TARGET}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`);
  fs.renameSync(temporary, TARGET);
  return TARGET;
}

module.exports = { buildOpenApiDocument, buildOpenApi, SOURCE, TARGET };

if (require.main === module) {
  console.log(`Wrote ${path.relative(process.cwd(), buildOpenApi())}`);
}
