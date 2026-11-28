#!/usr/bin/env node
// Proves that npm refuses a package version younger than the `min-release-age`
// cooldown in the repo's .npmrc, instead of trusting that the setting works.
//
// Why: npm older than 11.10 ignores min-release-age without a warning (Node 22's
// bundled npm 10.9.9 does). This script records that regression and, run daily
// in CI on the Node 24 toolchain, proves the fix keeps holding.
//
// Usage: node scripts/cooldown-proof.mjs [--npm "<command>"]
//   --npm   the npm command to test, split on whitespace and run without a
//           shell-built string (default: npm), e.g. "npx -y -p npm@12.2.2 npm".
// Exit:   0 refused (pass), 1 not refused (the cooldown is not enforced),
//         2 could not run (no young version, registry down, no setting, ...).
//
// A pass needs both: npm refuses the young version AND the same command with
// --min-release-age=0 succeeds. Anything else is never a pass.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANDIDATES = ['@types/node', 'typescript', '@playwright/test', 'vite'];
const DAY_MS = 86_400_000;

// Newest stable version published less than minDays before `now`, or null.
export function pickYoungVersion(packument, now, minDays) {
  const time = packument?.time;
  if (!time || typeof time !== 'object') return null;
  let best = null;
  let bestAt = -Infinity;
  for (const [version, published] of Object.entries(time)) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue; // skips created/modified and prereleases
    const at = Date.parse(published);
    if (Number.isNaN(at)) continue;
    // An unpublished version stays in `time` but leaves `versions`; installing it
    // would fail for a reason unrelated to the cooldown (a spurious exit 2).
    const listed = packument.versions;
    if (listed && typeof listed === 'object' && !(version in listed)) continue;
    if (now - at >= minDays * DAY_MS) continue;
    if (at > bestAt) {
      best = version;
      bestAt = at;
    }
  }
  return best;
}

export function verdict({ refused, controlOk }) {
  if (!controlOk) return 'could not run';
  return refused ? 'refused' : 'not refused';
}

// What npm prints when min-release-age leaves no matching version.
export function isCooldownRefusal(stderr) {
  return /with a date before|\bETARGET\b/.test(stderr ?? '');
}

export function splitCommand(command) {
  return command.trim().split(/\s+/).filter(Boolean);
}

export function parseMinReleaseAge(npmrc) {
  const m = /^\s*min-release-age\s*=\s*(\d+)\s*$/m.exec(npmrc);
  return m ? Number(m[1]) : null;
}

function runNpm(argv, args, cwd) {
  // No shell-built string. On Windows npm/npx are .cmd shims that need a shell;
  // every token is therefore restricted to a safe character set first.
  for (const t of [...argv, ...args]) {
    if (!/^[\w@.\/:=-]+$/.test(t)) throw new Error(`refusing unsafe argument: ${t}`);
  }
  const [cmd, ...rest] = argv;
  const r = spawnSync(cmd, [...rest, ...args], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

// error.message (spawn failure, ETIMEDOUT) plus stderr, so a timeout is not silent.
export function failureDetail(r) {
  return [r?.error?.message, r?.stderr].filter(Boolean).join('\n');
}

// A hung registry must end in exit 2, not in the job's own timeout.
export async function fetchPackument(name, fetchImpl = fetch) {
  const res = await fetchImpl(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`registry answered ${res.status} for ${name}`);
  return res.json();
}

const tempDirs = [];
function freshDir(npmrcPath) {
  const dir = mkdtempSync(join(tmpdir(), 'cooldown-proof-'));
  tempDirs.push(dir);
  cpSync(npmrcPath, join(dir, '.npmrc'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'cooldown-proof', version: '0.0.0', private: true })
  );
  return dir;
}

const INSTALL = [
  'install',
  '--dry-run',
  '--no-save',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
];

async function main(argv) {
  const args = argv.slice(2);
  let npmCommand = 'npm';
  const i = args.indexOf('--npm');
  if (i !== -1) {
    if (!args[i + 1]) {
      console.error('--npm needs a command');
      return 2;
    }
    npmCommand = args[i + 1];
  }
  const npm = splitCommand(npmCommand);

  const npmrcPath = join(REPO_ROOT, '.npmrc');
  const minDays = existsSync(npmrcPath)
    ? parseMinReleaseAge(readFileSync(npmrcPath, 'utf8'))
    : null;
  if (minDays === null) {
    console.error('could not run: no min-release-age in the repo .npmrc');
    return 2;
  }

  const probeDir = freshDir(npmrcPath);
  try {
    const ver = runNpm(npm, ['--version'], probeDir);
    if (ver.status !== 0) {
      console.error(`could not run: "${npmCommand} --version" failed\n${failureDetail(ver)}`);
      return 2;
    }
    const npmVersion = ver.stdout.trim().split(/\r?\n/).pop().trim();

    const now = Date.now();
    let pkg = null;
    let version = null;
    let published = null;
    for (const name of CANDIDATES) {
      let packument;
      try {
        packument = await fetchPackument(name);
      } catch (err) {
        console.error(`could not run: ${err.message}`);
        return 2;
      }
      const v = pickYoungVersion(packument, now, minDays);
      if (v) {
        pkg = name;
        version = v;
        published = packument.time[v];
        break;
      }
    }
    if (!pkg) {
      console.error(
        `could not run: no young version found among ${CANDIDATES.join(', ')} (all older than ${minDays} days)`
      );
      return 2;
    }
    const ageDays = ((now - Date.parse(published)) / DAY_MS).toFixed(1);
    console.log(
      `npm ${npmVersion} (${npmCommand}); ${pkg}@${version} published ${published} (${ageDays} days old, cooldown ${minDays})`
    );

    const spec = `${pkg}@${version}`;
    const test = runNpm(npm, [...INSTALL, spec], freshDir(npmrcPath));
    const control = runNpm(npm, [...INSTALL, '--min-release-age=0', spec], freshDir(npmrcPath));
    const controlOk = control.status === 0;
    if (!controlOk) {
      console.error(
        `control (--min-release-age=0) failed, registry or network problem?\n${failureDetail(control)}`
      );
    } else if (test.status !== 0 && !isCooldownRefusal(test.stderr)) {
      console.error(
        `could not run: install failed for a reason other than the cooldown\n${failureDetail(test)}`
      );
      return 2;
    }
    const result = verdict({
      refused: test.status !== 0 && isCooldownRefusal(test.stderr),
      controlOk,
    });
    console.log(`verdict: ${result} (npm ${npmVersion})`);
    if (result === 'refused') return 0;
    if (result === 'not refused') return 1;
    return 2;
  } finally {
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`could not run: ${err.message}`);
      process.exitCode = 2;
    }
  );
}
