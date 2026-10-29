import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

// The caseworker's AI assistant, end to end: the dock, the model and source
// lists, and one chat turn through the backend's real MCP registry.
//
// Only the model is a stub. Every connected source still lists its tools for
// the chat, which is the path that broke on 29 October 2026: CPRMV failed to
// connect, yet was offered as connected and preselected, and every chat came
// back "Not connected". The stub model answers with the number of tools the
// chat collected, so a reply proves the sources were reached.
//
// The stub is offered only where the backend runs with LLM_STUB_ENABLED=true:
// locally (see packages/backend/.env.example) and on ACC. Production refuses
// it, so against production this scenario skips.

const STUB_MODEL = 'stub-model';

test('the assistant answers through every connected source', async ({ page }) => {
  await loginAsMedewerker(page, 'test-caseworker-flevoland', 'test123');
  await expect(page).toHaveURL(/\/dashboard\/caseworker$/);

  await page.getByRole('button', { name: 'Vraag de assistent' }).click();
  const dock = page.getByRole('complementary', { name: 'AI-assistent' });
  await expect(dock).toBeVisible();

  // Models and sources load on mount; the model list is a <select> once there
  // is more than one model to choose from.
  const modelSelect = dock.locator('select');
  await expect(modelSelect).toBeVisible({ timeout: 15_000 });
  if ((await modelSelect.locator(`option[value="${STUB_MODEL}"]`).count()) === 0) {
    test.skip(true, 'The stub model is not offered on this tier (LLM_STUB_ENABLED is off).');
  }
  await modelSelect.selectOption(STUB_MODEL);

  // Every connected source starts selected; an unconnected one is shown
  // "(offline)" and cannot be picked. Leave the selection as the user gets it.
  const sources = dock.locator('button[title]').filter({ hasNotText: 'Chat wissen' });
  await expect(sources.first()).toBeVisible({ timeout: 15_000 });
  const enabledSources = sources.and(page.locator(':enabled'));
  expect(await enabledSources.count()).toBeGreaterThan(0);

  await dock.getByPlaceholder(/Stel een vraag/).fill('Hallo');
  await dock.getByPlaceholder(/Stel een vraag/).press('Enter');

  const reply = dock.getByText(/^Stub model: received \d+ tools\.$/);
  await expect(reply).toBeVisible({ timeout: 30_000 });
  const tools = Number((await reply.innerText()).match(/received (\d+) tools/)?.[1]);
  expect(tools).toBeGreaterThan(0);

  // The error badge is the dock's only role="alert".
  await expect(dock.getByRole('alert')).toHaveCount(0);
});
