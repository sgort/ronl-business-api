import type { Page } from '@playwright/test';

/**
 * Idempotent: a rerun without a full reset may find the task already
 * claimed by a previous partial run.
 */
export async function claimIfNeeded(page: Page) {
  const claimButton = page.getByRole('button', { name: 'Taak claimen' });
  if (await claimButton.isVisible()) {
    await claimButton.click();
  }
}
