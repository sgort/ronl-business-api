import { runPendingCleanupPrompts } from './helpers/operaton-cleanup';

// Runs once, in the main CLI process (unlike test bodies, which run in
// worker child processes without real TTY stdin) — see
// helpers/operaton-cleanup.ts for why this split exists.
export default async function globalTeardown() {
  await runPendingCleanupPrompts();
}
