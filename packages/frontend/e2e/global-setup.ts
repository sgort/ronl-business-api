import { verifyRequiredProcesses } from './helpers/required-processes';
import {
  assertTargetAllowed,
  BACKEND_URL,
  checkLde,
  FRONTEND_URL,
  isLocalTarget,
  KEYCLOAK_URL,
  LDE_URL,
  targetLabel,
} from './helpers/target';

async function checkReachable(url: string, timeoutMs = 3000): Promise<boolean> {
  // Not AbortSignal.timeout() — its internal timer isn't always cleaned up
  // before the fetch settles, which crashes Node on Windows with a libuv
  // "UV_HANDLE_CLOSING" assertion during process exit. A manually managed
  // controller + explicit clearTimeout avoids that.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Fails fast with a clear message instead of a confusing mid-test connection
// error. This project does not start the dev stack itself — see the
// Environment section of the testing docs: run `npm run dev` (root)
// yourself, and start the sibling linked-data-explorer repo's
// `npm run dev:backend` separately. Against a remote target nothing is
// started at all; the checks below simply confirm the tier is up.
export default async function globalSetup() {
  assertTargetAllowed();

  // A remote tier is slower to answer than a loopback dev server, and a
  // cold-started App Service slower still.
  const timeoutMs = isLocalTarget ? 3000 : 15_000;

  const probes: Array<{ label: string; url: string }> = [
    { label: 'Frontend', url: FRONTEND_URL },
    { label: 'Backend', url: `${BACKEND_URL}/v1/health` },
    { label: 'Keycloak', url: KEYCLOAK_URL },
  ];
  if (checkLde) probes.push({ label: 'LDE backend', url: `${LDE_URL}/v1/health` });

  const results = await Promise.all(probes.map((p) => checkReachable(p.url, timeoutMs)));
  const missing = probes
    .filter((_, i) => !results[i])
    .map((p) => `- ${p.label} not reachable at ${p.url}`);

  if (missing.length > 0) {
    throw new Error(
      [
        '',
        `E2E preconditions not met — target: ${targetLabel}.`,
        ...missing,
        '',
        ...(isLocalTarget
          ? [
              'The dev stack must already be running. Start it yourself first:',
              '  docker compose up -d          (repo root — Keycloak/Postgres/Redis)',
              '  npm run dev                   (repo root — frontend :5173 + backend :3002)',
              '  npm run dev:backend           (linked-data-explorer repo root — LDE backend :3001)',
            ]
          : [
              'Check the tier is up and the URLs are right. The suite reads',
              'FRONTEND_URL, BACKEND_URL, KEYCLOAK_URL, LDE_URL and OPERATON_URL',
              '(see e2e/helpers/target.ts); anything unset falls back to localhost.',
            ]),
        '',
        'See https://iou-architectuur.open-regels.nl/ronl-business-api/developer/testing/overview/ for the full environment setup.',
        '',
      ].join('\n')
    );
  }

  const processProblems = await verifyRequiredProcesses();
  if (processProblems.length > 0) {
    throw new Error(
      [
        '',
        `E2E preconditions not met — the required process bundle is not deployed correctly on ${targetLabel}.`,
        ...processProblems,
        '',
        ...(isLocalTarget
          ? [
              "Deploy the bundle yourself first, manually, via linked-data-explorer's BPMN Modeler:",
              "  1. Open linked-data-explorer's BPMN Modeler (npm run dev:backend + npm run dev, LDE repo)",
              '  2. Import each file from linked-data-explorer/e2e-fixtures/<tenant>/',
              '  3. Set the Organization field to the tenant shown above, click Deploy',
              '',
              'See linked-data-explorer/e2e-fixtures/manifest.json for the full fixture list.',
            ]
          : [
              'A shared tier runs the de-labelled bundle from',
              'linked-data-explorer/packages/frontend/public/examples/<tenant>/ — the same',
              'content as the fixtures, without the E2E annotation and without the',
              '`...E2E` sub-process key. Redeploy that bundle under the tenant shown above.',
            ]),
        '',
      ].join('\n')
    );
  }

  if (!isLocalTarget) {
    console.log(`\nE2E target: ${targetLabel} — journeys will create real instances there.\n`);
  }
}
