// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import * as pkg from '../index';

/**
 * `modes.config.ts` exports `allStaticSections()` and `findPaModeForSection()`
 * at module scope, operating on the unfiltered `PA_MODES`. `usePaModes()`
 * returns two functions with the same names and signatures, narrowed to the
 * modes the host actually supplied. A consumer that reaches for the module
 * ones instead compiles cleanly, renders fine, and silently gets the full set
 * — reopening IOU and Hulpmiddelen on a host that narrowed its `modes` prop,
 * through a door no render test is watching.
 *
 * The exports stay because `notificaties-nav.test.ts` and
 * `PACommandPalette.test.tsx` legitimately compute expected values from the
 * real config module. So this file guards the two distinct ways the door can
 * be opened, with one assertion each:
 *
 *   (a) internal consumption — a non-test file under src may only name either
 *       identifier if it *bound* it from `usePaModes()`, and may not touch
 *       `modes.config` in a way that could yield the module-scope versions.
 *   (b) the package surface — neither name may appear on the resolved
 *       `../index` namespace.
 *
 * (a) keys on where the binding comes from rather than on the bare name,
 * because `usePaModes()` deliberately returns two functions with these exact
 * names — that is the whole substitution. A pure name check would flag
 * `PACommandPalette.tsx`, whose `const { allStaticSections,
 * findPaModeForSection } = usePaModes()` is the correct usage, and
 * allow-listing the palette to silence it would blind the guard at the one
 * component whose leak motivated the context in the first place.
 *
 * An earlier version of this guard matched `import { … } from '…/modes.config'`
 * with a regex and missed, empirically, all of: `export * from
 * './…/modes.config'` (no braces clause at all, and the *likelier* thing
 * someone writes in a barrel because it looks like less work), an explicit
 * `export { allStaticSections } from …`, a namespace import
 * (`import * as modes from './modes.config'` then `modes.allStaticSections()`),
 * a `.js`-suffixed specifier, a dynamic `await import(…)`, and — worst — any
 * transitive re-export, since keying on the specifier path means one
 * intermediate barrel defeats it entirely.
 *
 * Assertion (a) keys on the *identifier* rather than the path, which kills
 * every import and export spelling at once and is simpler than the regex it
 * replaces. Assertion (b) is the only form that can catch a transitive
 * `export *` chain, because such a chain contains no identifier text anywhere
 * to grep for. It also pins the decision recorded in `src/index.ts`'s doc
 * comment, so a later "restore the missing exports" is a red test rather than
 * a silent reopening.
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const GUARDED_NAMES = ['allStaticSections', 'findPaModeForSection'] as const;

/**
 * The only two files allowed to name the guarded functions without binding
 * them from `usePaModes()`, as paths relative to src.
 *  - modes.config.ts defines them.
 *  - PaModesContext.tsx is the sanctioned narrowed re-implementation: it
 *    provides both names on the context value, over the host's modes.
 * Every other file earns the right per-name, by destructuring from
 * `usePaModes()` — see `boundFromUsePaModes` below.
 */
const ALLOWED = new Set(
  ['pages/public-affairs-v2/modes.config.ts', 'modes/PaModesContext.tsx'].map((p) =>
    p.split('/').join(sep)
  )
);

/**
 * Blanks out comments, and optionally string/template literals too.
 *
 * Comment-stripping is required, not optional polish: `src/index.ts`'s own doc
 * comment names both guarded functions to explain why it does not export them,
 * and would otherwise trip this guard — as would any future comment discussing
 * them, which is exactly the kind of false positive that gets a guard deleted
 * rather than fixed.
 *
 * String-stripping is opt-in because it is wrong for the two checks that read
 * *specifiers*: a module path lives inside a string literal, so blanking
 * strings makes any path-based check silently match nothing. (It did, on the
 * first draft of this file — the wholesale-import check was dead code until a
 * planted namespace import failed to trip it.) The name check wants strings
 * gone; the path check needs them.
 */
function strip(src: string, alsoStrings: boolean): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (alsoStrings && (c === "'" || c === '"' || c === '`')) {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;
        else if (src[j] === c) break;
        else j++;
      }
      const stop = Math.min(j + 1, src.length);
      blank(i + 1, stop - 1);
      i = stop;
    } else {
      i++;
    }
  }
  return out.join('');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Names the file destructures out of `usePaModes()` — the sanctioned source. */
function boundFromUsePaModes(code: string): Set<string> {
  const bound = new Set<string>();
  for (const m of code.matchAll(/\{([^}]*)\}\s*=\s*usePaModes\s*\(\s*\)/g)) {
    for (const part of m[1].split(',')) {
      // `allStaticSections` or `allStaticSections: renamed` — the imported
      // name is on the left of the colon either way.
      const name = part.split(':')[0].trim();
      if (name) bound.add(name);
    }
  }
  return bound;
}

/**
 * Statements that could yield the module-scope versions regardless of what the
 * file does with `usePaModes()` elsewhere: a namespace import or a star
 * re-export of modes.config. Neither names an identifier, so the per-name
 * check below cannot see them, and neither has a legitimate use in package
 * source — the only reason to reach the config module wholesale is to pull
 * something off it. Matches a `.js` suffix too.
 */
function reachesConfigWholesale(code: string): boolean {
  return /(?:import\s+\*\s+as\s+\w+|export\s+\*)\s+from\s+\S*modes\.config(?:\.js)?\S*/.test(code);
}

interface Offender {
  file: string;
  reason: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(SRC_DIR)) {
    const rel = relative(SRC_DIR, file);
    if (ALLOWED.has(rel)) continue;
    const raw = readFileSync(file, 'utf-8');
    // Specifiers live inside string literals, so the path check keeps strings.
    const withPaths = strip(raw, false);
    // The name check drops them, so a path or message mentioning a helper by
    // name is not mistaken for a use of it.
    const code = strip(raw, true);

    if (reachesConfigWholesale(withPaths)) {
      offenders.push({
        file: rel,
        reason: 'namespace-imports or star-re-exports modes.config, which can yield either helper',
      });
    }

    const bound = boundFromUsePaModes(code);
    const unexplained = GUARDED_NAMES.filter(
      (name) => new RegExp(`\\b${name}\\b`).test(code) && !bound.has(name)
    );
    if (unexplained.length > 0) {
      offenders.push({
        file: rel,
        reason: `names ${unexplained.join(', ')} without binding it from usePaModes() — the module-scope version ignores the host's narrowing`,
      });
    }
  }
  return offenders;
}

describe('no module-scope modes helpers outside the provider', () => {
  it('reaches allStaticSections/findPaModeForSection only through usePaModes()', () => {
    const offenders = findOffenders();
    expect(offenders, offenders.map((o) => `${o.file} ${o.reason}`).join('\n')).toEqual([]);
  });

  it('does not put either helper on the package surface', () => {
    // Resolved namespace, not source text: this is the only check that sees
    // through a transitive `export *` chain, which has no identifier to grep.
    const exported = Object.keys(pkg);
    expect(
      GUARDED_NAMES.filter((name) => exported.includes(name)),
      'src/index.ts must not re-export the unfiltered modes helpers — see its doc comment'
    ).toEqual([]);
  });
});
