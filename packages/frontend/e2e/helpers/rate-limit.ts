import type { Page } from '@playwright/test';

/**
 * Turn an API throttle into a message that says so.
 *
 * The backend allows RATE_LIMIT_MAX_REQUESTS per window (100/min out of the
 * box). The PA cockpit spends about twenty requests on one short authoring
 * journey, so two specs back to back exhaust the budget and every subsequent
 * fetch returns 429 — which the surface renders as "Kon dossiers niet laden",
 * indistinguishable from a backend that is down. That cost an afternoon once:
 * the failure looked like a race in the app, and two plausible fixes were
 * written for a race that was not what was happening.
 *
 * This does not retry or wait it out — a throttled run is not a valid run.
 * It records the throttle so the test's own failure message can name it.
 */
export function watchForRateLimit(page: Page): { hit: () => string | null } {
  let first: string | null = null;
  page.on('response', (r) => {
    if (r.status() === 429 && !first) {
      first = `${r.request().method()} ${r.url()}`;
    }
  });
  return {
    hit: () =>
      first &&
      `The API rate-limited this run (429 on ${first}). This is the backend's ` +
        `RATE_LIMIT_MAX_REQUESTS budget, not a defect in the app or the test — ` +
        `raise it in packages/backend/.env.development and restart the backend, ` +
        `or leave a minute between runs.`,
  };
}
