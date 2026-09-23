import { chromium } from '@playwright/test';

import { verifyRequiredDecisions, verifyRequiredProcesses } from './helpers/required-processes';
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
/**
 * That the browser Playwright wants is actually on this machine.
 *
 * Playwright keeps its browsers outside node_modules (~/AppData/Local/
 * ms-playwright on Windows), so `npm ci` installs a new Playwright without
 * fetching the build it needs. Every spec then dies in browserType.launch
 * before a single assertion runs, and the one line that explains it is buried
 * in the first of N identical failures — a lockfile bump read as the whole
 * suite breaking.
 *
 * Launching rather than comparing versions or guessing at paths: the launch is
 * the thing that has to work, it costs about a second, and it stays right when
 * Playwright changes which binary headless mode uses (it moved to the headless
 * shell, which is why a machine can hold a chromium build and still fail).
 */
async function checkBrowserInstalled(): Promise<string | null> {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.split('\n')[0] : 'Unknown error';
  }
}

export default async function globalSetup() {
  assertTargetAllowed();

  const browserProblem = await checkBrowserInstalled();
  if (browserProblem) {
    throw new Error(
      [
        '',
        'E2E preconditions not met — Chromium cannot be launched.',
        `- ${browserProblem}`,
        '',
        'Playwright stores browsers outside node_modules, so installing or',
        'updating it does not fetch them. Download the matching build:',
        '',
        '  npx playwright install chromium',
        '',
        'chromium only — it is the single project in e2e/playwright.config.ts.',
        '',
      ].join('\n')
    );
  }

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

  // Decisions are a separate gate, because they are deployed differently:
  // without an Organization, so a tenant-scoped process can reach them with
  // decisionRefTenantId="${null}". A missing or tenant-pinned DMN does not show
  // up as a missing process above — it surfaces mid-journey as a 500 on process
  // start, or on a citizen's screen as "probeer het opnieuw", neither of which
  // mentions a decision. sgort/linked-data-explorer#187.
  const decisionProblems = await verifyRequiredDecisions();
  if (decisionProblems.length > 0) {
    throw new Error(
      [
        '',
        `E2E preconditions not met — the required DECISION definitions are not deployed correctly on ${targetLabel}.`,
        ...decisionProblems,
        '',
        'Decisions deploy WITHOUT an Organization, unlike the processes above.',
        ...(isLocalTarget
          ? [
              'Import each file from linked-data-explorer/e2e-fixtures/ listed under',
              "manifest.json's `sharedDecisions.files`, leaving the Organization field EMPTY.",
              '',
              'One exception: zorgtoeslag_resultaat ships with the zorgtoeslag rules set, not',
              "with the fixture bundle — see manifest.json's `sharedDecisions.external`.",
            ]
          : [
              'On a shared tier these are deployed once and shared by every tenant.',
              'Check Cockpit: a decision listed under an Organization is the failure mode',
              'here, not an absent one.',
            ]),
        '',
      ].join('\n')
    );
  }

  if (!isLocalTarget) {
    console.log(`\nE2E target: ${targetLabel} — journeys will create real instances there.\n`);
  }
}
