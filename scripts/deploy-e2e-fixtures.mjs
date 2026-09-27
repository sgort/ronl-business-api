#!/usr/bin/env node
/**
 * deploy-e2e-fixtures.mjs — put the E2E bundle on the local Operaton.
 *
 * The E2E suite's global-setup refuses to run until every process in
 * linked-data-explorer/e2e-fixtures/manifest.json is deployed under its tenant,
 * and every decision those processes call is deployed WITHOUT one (see
 * packages/frontend/e2e/helpers/required-processes.ts). A fresh Operaton volume
 * has none of it. This script deploys the lot, the way LDE's BPMN Modeler would:
 *
 *   1. SHARED DECISIONS — each file under the manifest's `sharedDecisions.files`,
 *      plus the external zorgtoeslag rules set, through `POST /v1/dmns/deploy`.
 *      That route sends no tenant-id, which is the point: every businessRuleTask
 *      resolves its decision with camunda:decisionRefTenantId="${null}".
 *
 *   2. PROCESSES — each top-level manifest entry through
 *      `POST /v1/dmns/process/deploy`, with its sub-processes, forms and
 *      documents in the same request, and `organization` set to the tenant
 *      directory it lives in. One request per entry, as one Modeler action is.
 *
 * Deploying goes THROUGH the LDE backend, never straight to Operaton, so the
 * bundle is also recorded in LDE's own store and the boardOwner tag is derived
 * by the same code a Modeler deploy uses.
 *
 * The target is whatever Operaton the LDE backend is configured for. The script
 * asks it first (`GET /v1/dmns/process/deploy-target`) and refuses anything that
 * is not on this machine: a fixture bundle on a shared tier is drift.
 *
 * Every run deploys a new version of everything (LDE disables Operaton's
 * duplicate filtering). That is harmless — the E2E gate reads the latest
 * version — and it means a run always leaves the engine matching the fixtures
 * on disk, not whatever was deployed before.
 *
 * Usage:
 *   node scripts/deploy-e2e-fixtures.mjs
 *   npm run e2e:deploy-fixtures
 *
 * Environment (all optional):
 *   LDE_URL          LDE backend             default http://localhost:3001
 *   LDE_REPO         linked-data-explorer    default ../linked-data-explorer
 *   TTL_EDITOR_REPO  ttl-editor (zorgtoeslag default ../ttl-editor
 *                    rules set)
 *
 * Exit code 0 when everything deployed, 1 on the first failure.
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const LDE_URL = (process.env.LDE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const LDE_REPO = resolve(REPO_ROOT, process.env.LDE_REPO ?? '../linked-data-explorer');
const TTL_EDITOR_REPO = resolve(REPO_ROOT, process.env.TTL_EDITOR_REPO ?? '../ttl-editor');
const FIXTURES = join(LDE_REPO, 'e2e-fixtures');

/**
 * Where the manifest's `sharedDecisions.external` decisions come from. The
 * manifest names them but deliberately does not ship them; this is the file
 * ACC runs (resource `resultaat_zorgtoeslag_operaton_compat.dmn`, untenanted,
 * checked 27 September 2026). The plain `resultaat_zorgtoeslag.dmn` beside it
 * is the pre-Camunda-Modeler export of the same model.
 */
const EXTERNAL_DECISION_FILES = {
  zorgtoeslag_resultaat: join(
    TTL_EDITOR_REPO,
    'examples/organizations/toeslagen/resultaat_zorgtoeslag_operaton_compat.dmn'
  ),
};

/** Top-level manifest keys that are not tenants. Mirrors LDE's own e2e-fixtures.test.ts. */
const NON_TENANT_KEYS = new Set(['sharedDecisions']);

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function readText(path) {
  if (!existsSync(path)) fail(`Missing file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (err) {
    fail(`Could not parse ${path}: ${err.message}`);
  }
}

async function ldeRequest(method, path, body) {
  let res;
  try {
    res = await fetch(`${LDE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    fail(
      `LDE backend not reachable at ${LDE_URL} (${err.cause?.code ?? err.message}). ` +
        'Start it in the linked-data-explorer repo with `npm run dev:backend`.'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    // LDE answers errors as RFC 9457 problem details.
    const detail = data.detail ?? data.error?.message ?? data.title ?? `HTTP ${res.status}`;
    fail(`${method} ${path} failed: ${detail}`);
  }
  return data.data;
}

/** Refuses to continue unless LDE deploys to an Operaton on this machine. */
async function assertLocalTarget() {
  const { operatonUrl } = await ldeRequest('GET', '/v1/dmns/process/deploy-target');
  const host = new URL(operatonUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    fail(
      `LDE at ${LDE_URL} deploys to ${operatonUrl}, which is not local. ` +
        'The E2E fixtures belong on the local engine only; refusing.'
    );
  }
  return operatonUrl;
}

async function deployDecisionFile(path, label) {
  const filename = basename(path);
  const { deploymentId } = await ldeRequest('POST', '/v1/dmns/deploy', {
    xml: readText(path),
    deploymentName: filename.replace(/\.dmn$/, ''),
    filename,
  });
  console.log(`  ✓ ${label.padEnd(58)} ${deploymentId}`);
}

const refsOf = (xml, pattern) => [...xml.matchAll(pattern)].map((m) => m[1]);

/**
 * Builds the body LDE's Modeler sends for one entry (BpmnCanvas.tsx
 * handleDeploy): forms and documents are the ones the main BPMN or any of its
 * sub-processes reference, looked up by the `id` inside each file.
 *
 * The Modeler silently drops a reference it cannot match. Here an unmatched
 * reference is an error, because the fixture set is meant to be complete: a
 * missing form surfaces later as a task with no form, not as a failed deploy.
 */
function buildProcessDeploy(tenant, entry) {
  const dir = join(FIXTURES, tenant);
  const bpmnXml = readText(join(dir, entry.bpmn));
  const subs = entry.subProcesses ?? [];
  const subProcesses = subs.map((sub) => ({
    filename: `${sub.processDefinitionKey}.bpmn`,
    xml: readText(join(dir, sub.bpmn)),
  }));

  const called = new Set(refsOf(bpmnXml, /calledElement="([^"]+)"/g));
  for (const sub of subs) {
    if (!called.has(sub.processDefinitionKey)) {
      fail(`${entry.bpmn} has no callActivity for sub-process ${sub.processDefinitionKey}`);
    }
  }

  const allXml = [bpmnXml, ...subProcesses.map((s) => s.xml)];
  const formRefs = new Set(allXml.flatMap((x) => refsOf(x, /camunda:formRef="([^"]+)"/g)));
  const documentRefs = new Set(
    allXml.flatMap((x) => [
      ...refsOf(x, /ronl:documentRef="([^"]+)"/g),
      // A signature task binds its template through signatureRef alone.
      ...refsOf(x, /ronl:signatureRef="([^"]+)"/g),
    ])
  );

  const formFiles = [entry, ...subs].flatMap((e) => e.forms);
  const documentFiles = [entry, ...subs].flatMap((e) => e.documents);
  const formsById = new Map(
    formFiles.map((f) => readJson(join(dir, f))).map((schema) => [schema.id, schema])
  );
  const documentsById = new Map(
    documentFiles.map((f) => readJson(join(dir, f))).map((template) => [template.id, template])
  );

  const unmatched = [
    ...[...formRefs].filter((ref) => !formsById.has(ref)).map((ref) => `form '${ref}'`),
    ...[...documentRefs].filter((ref) => !documentsById.has(ref)).map((ref) => `document '${ref}'`),
  ];
  if (unmatched.length > 0) {
    fail(
      `${tenant}/${entry.bpmn} references ${unmatched.join(', ')}, which the manifest ` +
        'does not list for it.'
    );
  }

  return {
    bpmnXml,
    deploymentName: entry.processDefinitionKey,
    forms: [...formRefs].map((id) => ({ id, schema: formsById.get(id) })),
    documents: [...documentRefs].map((id) => ({ id, template: documentsById.get(id) })),
    subProcesses,
    organization: tenant,
  };
}

async function main() {
  const manifest = readJson(join(FIXTURES, 'manifest.json'));

  const operatonUrl = await assertLocalTarget();
  console.log(`Deploying ${FIXTURES}\n  via ${LDE_URL} → ${operatonUrl}\n`);

  // Build every payload before deploying anything, so a broken fixture stops
  // the run before it leaves the engine half-populated.
  const tenants = Object.entries(manifest).filter(([key]) => !NON_TENANT_KEYS.has(key));
  const processDeploys = tenants.flatMap(([tenant, entries]) =>
    entries.map((entry) => ({ tenant, entry, body: buildProcessDeploy(tenant, entry) }))
  );

  const shared = manifest.sharedDecisions ?? { files: {}, external: {} };
  const externalKeys = Object.keys(shared.external ?? {});
  for (const key of externalKeys) {
    if (!EXTERNAL_DECISION_FILES[key]) {
      fail(`manifest declares external decision '${key}' but this script has no source for it`);
    }
    readText(EXTERNAL_DECISION_FILES[key]);
  }

  console.log('Shared decisions (no tenant):');
  for (const [file, keys] of Object.entries(shared.files ?? {})) {
    await deployDecisionFile(join(FIXTURES, file), `${file} [${keys.join(', ')}]`);
  }
  for (const key of externalKeys) {
    await deployDecisionFile(EXTERNAL_DECISION_FILES[key], `${key} (external)`);
  }

  console.log('\nProcesses:');
  for (const { tenant, entry, body } of processDeploys) {
    const result = await ldeRequest('POST', '/v1/dmns/process/deploy', body);
    const subs = (entry.subProcesses ?? []).map((s) => s.processDefinitionKey);
    const label = `${tenant} / ${entry.processDefinitionKey}${subs.length ? ` + ${subs.join(', ')}` : ''}`;
    console.log(
      `  ✓ ${label.padEnd(58)} ${result.deploymentId} (${result.resourceCount} resources)`
    );
    if (!result.bundleRecorded) {
      console.warn(`    ⚠ deployed, but LDE did not record it: ${result.bundleRecordingError}`);
    }
  }

  console.log('\nDone. The E2E global-setup verifies the result on its next run.');
}

await main();
