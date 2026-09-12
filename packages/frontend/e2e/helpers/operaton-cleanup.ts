import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OPERATON_BASE_URL = 'http://localhost:8081/engine-rest';

// Playwright runs each test in a worker child process that does not forward
// the CLI's real TTY stdin (confirmed: microsoft/playwright#33061 — a
// readline prompt inside a test body silently never reaches the terminal,
// even when the parent shell is genuinely interactive). globalTeardown runs
// in the main CLI process instead, which does have real stdin — so a test
// records the businessKey it wants cleaned up here, and globalTeardown
// (see ../global-teardown.ts) does the actual prompting afterward, once.
const PENDING_FILE = path.join(__dirname, '..', '.pending-operaton-cleanup.json');

/**
 * Interactive y/n prompt on the real terminal running `npm run test:e2e`.
 * Skips (returns false) when stdin isn't a TTY — e.g. a future CI run —
 * so an unattended run never hangs waiting for input.
 */
async function askYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/**
 * Deletes the historic process-instance record(s) for a given businessKey —
 * both the top-level instance and any call-activity subprocess instances,
 * which Operaton tracks as separate history entries (deleting the parent's
 * history does not cascade to them).
 */
async function deleteHistory(businessKey: string): Promise<number> {
  const parentsRes = await fetch(
    `${OPERATON_BASE_URL}/history/process-instance?processInstanceBusinessKey=${encodeURIComponent(businessKey)}`
  );
  const parents = (await parentsRes.json()) as Array<{ id: string }>;

  let deleted = 0;
  for (const parent of parents) {
    const subsRes = await fetch(
      `${OPERATON_BASE_URL}/history/process-instance?superProcessInstanceId=${parent.id}`
    );
    const subs = (await subsRes.json()) as Array<{ id: string }>;
    for (const sub of subs) {
      await fetch(`${OPERATON_BASE_URL}/history/process-instance/${sub.id}`, { method: 'DELETE' });
      deleted++;
    }
    await fetch(`${OPERATON_BASE_URL}/history/process-instance/${parent.id}`, { method: 'DELETE' });
    deleted++;
  }
  return deleted;
}

/**
 * Called from within a test, once its roundtrip is fully finished. Does not
 * prompt itself (see the module comment above) — just records the
 * businessKey for globalTeardown to ask about after all tests finish.
 */
export function recordPendingCleanup(businessKey: string): void {
  const existing: string[] = fs.existsSync(PENDING_FILE)
    ? (JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) as string[])
    : [];
  fs.writeFileSync(PENDING_FILE, JSON.stringify([...existing, businessKey]));
}

/**
 * Runs from global-teardown.ts, once, after all tests finish. Asks a single
 * yes/no for every businessKey recorded via recordPendingCleanup() this run,
 * rather than prompting per key — either all of them get cleaned, or none
 * do. Leaves the pending file untouched (for next time) when not run
 * interactively, or when declined — local Operaton keeps full history by
 * default, which isn't always wanted across repeated local runs, but this
 * must never hang an unattended run, and a decline must not silently lose
 * track of history that was never actually deleted.
 */
export async function runPendingCleanupPrompts(): Promise<void> {
  if (!fs.existsSync(PENDING_FILE)) return;
  const businessKeys = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) as string[];
  if (businessKeys.length === 0) return;
  if (!process.stdin.isTTY) return;

  const label =
    businessKeys.length === 1 ? '1 business key' : `${businessKeys.length} business keys`;
  const shouldCleanAll = await askYesNo(
    `\nClean up Operaton history for ${label} (${businessKeys.join(', ')})? [y/N] `
  );
  if (!shouldCleanAll) return;

  let totalDeleted = 0;
  for (const businessKey of businessKeys) {
    totalDeleted += await deleteHistory(businessKey);
  }
  console.log(
    `Deleted ${totalDeleted} historic process-instance record(s) across ${businessKeys.length} business key(s).`
  );
  fs.unlinkSync(PENDING_FILE);
}
