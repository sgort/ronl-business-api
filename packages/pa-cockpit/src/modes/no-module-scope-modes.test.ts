import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

/**
 * PaModesContext exists so a host's `modes` prop is the *only* thing a
 * consumer can render sections from. But `modes.config.ts` still exports
 * `allStaticSections()` and `findPaModeForSection()` at module scope,
 * operating on the unfiltered `PA_MODES` — because `notificaties-nav.test.ts`
 * legitimately tests the config module in isolation, and killing the export
 * outright would break that. Those two functions have the same names and
 * signatures as what `usePaModes()` returns, so a future component that
 * writes `import { allStaticSections } from '.../modes.config'` compiles
 * cleanly, renders fine, and silently gets the unfiltered set — reopening
 * IOU and Hulpmiddelen on a host that narrowed its `modes` prop, through a
 * second door no render test is watching.
 *
 * This is a source-text guard, in the same vein as
 * pa-demo/src/demo/modes.filtered.exports.test.ts and
 * pa-demo/src/demo-overrides.test.ts: it reads every non-test file under
 * src and fails, naming names, if any of them import either guarded
 * function from modes.config. Test files are excluded wholesale (not
 * exempted one by one) because computing an expected value from the real
 * module — as notificaties-nav.test.ts and PACommandPalette.test.tsx both
 * do — is a legitimate, growing use that has nothing to do with what a
 * host renders.
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// The definition site: it exports these names, it does not import them.
const MODES_CONFIG_PATH = join(SRC_DIR, 'pages/public-affairs-v2/modes.config.ts');

const GUARDED_NAMES = ['allStaticSections', 'findPaModeForSection'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface Offender {
  file: string;
  names: string[];
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(SRC_DIR)) {
    if (file === MODES_CONFIG_PATH) continue; // the definition site
    const src = readFileSync(file, 'utf-8');
    // Matches `import { ... } from '.../modes.config'` (single or double
    // quotes, type-only or value imports, any relative depth) and captures
    // the named-import clause so it can be checked for the guarded names —
    // not just "does this file mention modes.config at all", since
    // `import type { PaModeId } from './modes.config'` is fine.
    const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*\/modes\.config['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(src)) !== null) {
      const clause = match[1];
      const hit = GUARDED_NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(clause));
      if (hit.length > 0) {
        offenders.push({ file: relative(SRC_DIR, file), names: hit });
      }
    }
  }
  return offenders;
}

describe('no module-scope modes helpers outside the provider', () => {
  it('imports allStaticSections/findPaModeForSection from modes.config nowhere but tests', () => {
    const offenders = findOffenders();
    expect(
      offenders,
      offenders
        .map((o) => `${o.file} imports ${o.names.join(', ')} from modes.config directly`)
        .join('\n')
    ).toEqual([]);
  });
});
