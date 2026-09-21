import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { OPERATON_URL } from './target';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Playwright runs each test in a worker child process that does not forward
// the CLI's real TTY stdin (confirmed: microsoft/playwright#33061 — a
// readline prompt inside a test body silently never reaches the terminal,
// even when the parent shell is genuinely interactive). globalTeardown runs
// in the main CLI process instead, which does have real stdin — so a test
// records the businessKey it wants cleaned up here, and globalTeardown
// (see ../global-teardown.ts) does the actual prompting afterward, once.
const PENDING_FILE = path.join(__dirname, '..', '.pending-operaton-cleanup.json');

/**
 * A recorded key, with the engine it lives on.
 *
 * The engine is part of the record because the suite is target-aware: a run
 * against ACC creates its instances on ACC's engine, and its keys must be
 * deleted there. Before this was stored, the file held bare strings and the
 * teardown always used whatever OPERATON_URL the NEXT run happened to have —
 * so a local run following an ACC run would look ACC's keys up on
 * localhost:8081, match nothing, delete nothing, and still consider the file
 * handled, losing the only record that ACC history was left behind.
 */
interface PendingCleanup {
  businessKey: string;
  operatonUrl: string;
}

/** Entries written before the engine was recorded; the engine is unknowable. */
type StoredEntry = PendingCleanup | string;

function readPending(): StoredEntry[] {
  if (!fs.existsSync(PENDING_FILE)) return [];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as StoredEntry[]) : [];
  } catch {
    return [];
  }
}

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
 * Deletes the historic process-instance record(s) for a given businessKey on
 * one engine — both the top-level instance and any call-activity subprocess
 * instances, which Operaton tracks as separate history entries (deleting the
 * parent's history does not cascade to them).
 */
async function deleteHistory(operatonUrl: string, businessKey: string): Promise<number> {
  const parentsRes = await fetch(
    `${operatonUrl}/history/process-instance?processInstanceBusinessKey=${encodeURIComponent(businessKey)}`
  );
  const parents = (await parentsRes.json()) as Array<{ id: string }>;

  let deleted = 0;
  for (const parent of parents) {
    const subsRes = await fetch(
      `${operatonUrl}/history/process-instance?superProcessInstanceId=${parent.id}`
    );
    const subs = (await subsRes.json()) as Array<{ id: string }>;
    for (const sub of subs) {
      await fetch(`${operatonUrl}/history/process-instance/${sub.id}`, { method: 'DELETE' });
      deleted++;
    }
    await fetch(`${operatonUrl}/history/process-instance/${parent.id}`, { method: 'DELETE' });
    deleted++;
  }
  return deleted;
}

/**
 * Called from within a test, once its roundtrip is fully finished. Does not
 * prompt itself (see the module comment above) — just records the businessKey,
 * and the engine it was created on, for globalTeardown to ask about after all
 * tests finish.
 */
export function recordPendingCleanup(businessKey: string): void {
  const existing = readPending();
  const entry: PendingCleanup = { businessKey, operatonUrl: OPERATON_URL };
  fs.writeFileSync(PENDING_FILE, JSON.stringify([...existing, entry]));
}

/**
 * Runs from global-teardown.ts, once, after all tests finish. Asks one yes/no
 * per engine for every businessKey recorded via recordPendingCleanup() this
 * run — either all of that engine's keys get cleaned, or none do. Leaves the
 * pending file untouched (for next time) when not run interactively, or when
 * declined — Operaton keeps full history by default, which isn't always wanted
 * across repeated runs, but this must never hang an unattended run, and a
 * decline must not silently lose track of history that was never deleted.
 */
export async function runPendingCleanupPrompts(): Promise<void> {
  const entries = readPending();
  if (entries.length === 0) return;

  // Entries from before the engine was recorded. They cannot be acted on —
  // guessing an engine is exactly the bug this format fixes — so name them
  // and drop them rather than deleting against the wrong one or nagging on
  // every future run.
  const legacy = entries.filter((e): e is string => typeof e === 'string');
  const known = entries.filter((e): e is PendingCleanup => typeof e !== 'string');

  if (legacy.length > 0) {
    console.log(
      `\n${legacy.length} business key(s) were recorded before the target engine was tracked, ` +
        `so they cannot be cleaned automatically — delete their history by hand if you still ` +
        `want it gone:\n  ${legacy.join('\n  ')}`
    );
  }

  // Nothing is dropped or deleted unattended: without a real terminal the file
  // is left exactly as it is, legacy entries included, so the next interactive
  // run still sees them.
  if (!process.stdin.isTTY) return;
  if (known.length === 0) {
    fs.unlinkSync(PENDING_FILE);
    return;
  }

  const byEngine = new Map<string, string[]>();
  for (const { businessKey, operatonUrl } of known) {
    byEngine.set(operatonUrl, [...(byEngine.get(operatonUrl) ?? []), businessKey]);
  }

  const kept: PendingCleanup[] = [];
  for (const [operatonUrl, businessKeys] of byEngine) {
    const label =
      businessKeys.length === 1 ? '1 business key' : `${businessKeys.length} business keys`;
    const shouldClean = await askYesNo(
      `\nClean up Operaton history on ${operatonUrl} for ${label} (${businessKeys.join(', ')})? [y/N] `
    );
    if (!shouldClean) {
      kept.push(...businessKeys.map((businessKey) => ({ businessKey, operatonUrl })));
      continue;
    }

    let totalDeleted = 0;
    for (const businessKey of businessKeys) {
      totalDeleted += await deleteHistory(operatonUrl, businessKey);
    }
    console.log(
      `Deleted ${totalDeleted} historic process-instance record(s) across ` +
        `${businessKeys.length} business key(s) on ${operatonUrl}.`
    );
  }

  if (kept.length > 0) fs.writeFileSync(PENDING_FILE, JSON.stringify(kept));
  else fs.unlinkSync(PENDING_FILE);
}
