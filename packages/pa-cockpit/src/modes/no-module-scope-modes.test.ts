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
 * real config module. So this file guards every way the door can be opened,
 * with four rules across two assertions.
 *
 * Source rules, all on comment-stripped text (assertion 1):
 *
 *   R1  No file may name a guarded identifier in an import/export *clause*
 *       taken from modes.config. Applies to EVERY file, allow-list included:
 *       a named import of the unfiltered helper is wrong no matter who writes
 *       it, and this is the rule that stops a file from earning an exemption
 *       under R3 and then importing the module version anyway.
 *   R2  No file may namespace-import or star-re-export modes.config. Neither
 *       form names an identifier, so R1 and R3 cannot see them.
 *   R3  No file may name a guarded identifier at all unless it *bound* that
 *       name from `usePaModes()`. This is the path-independent rule: it does
 *       not care how the name arrived, so `.js` suffixes, dynamic imports and
 *       aliased re-exports are all covered.
 *
 * Surface rule (assertion 2):
 *
 *   R4  Neither name may appear on the resolved `../index` namespace. This is
 *       the only rule that survives a transitive `export *` chain, because
 *       such a chain contains no identifier text anywhere to grep for.
 *
 * ── Why four rules and not one ──
 *
 * R1 is the original path+clause guard. R3 was added later and, in an earlier
 * revision of this file, *replaced* it — which was a coverage regression: R3
 * excuses every occurrence of a name the file bound from `usePaModes()`,
 * including occurrences inside an import statement, so `PACommandPalette.tsx`
 * could have added `import { allStaticSections as unfiltered } from
 * '…/modes.config'` and stayed green. R1 and R3 close different doors and
 * both are load-bearing. R1 also re-covers the allow-listed files, so
 * `PaModesContext.tsx` — the narrowing implementation itself — cannot import
 * the unfiltered helpers.
 *
 * R3 keys on the *binding* rather than the bare name because `usePaModes()`
 * deliberately returns two functions with these exact names; that is the whole
 * substitution. A pure name check flags `PACommandPalette.tsx`, whose
 * `const { allStaticSections, findPaModeForSection } = usePaModes()` is the
 * correct usage, and allow-listing the palette to silence it would exempt the
 * one component whose potential leak motivated the context in the first place.
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const GUARDED_NAMES = ['allStaticSections', 'findPaModeForSection'] as const;

/**
 * Files allowed to name the guarded functions without binding them from
 * `usePaModes()`. This exempts them from R3 **only** — R1 and R2 still apply,
 * so an allow-listed file cannot import the unfiltered helpers.
 *  - modes.config.ts defines them.
 *  - PaModesContext.tsx is the sanctioned narrowed re-implementation: it
 *    provides both names on the context value, over the host's modes.
 */
const R3_EXEMPT = new Set(
  ['pages/public-affairs-v2/modes.config.ts', 'modes/PaModesContext.tsx'].map((p) =>
    p.split('/').join(sep)
  )
);

/**
 * Blanks out comments, preserving length and leaving string/template literals
 * intact.
 *
 * Both halves of that are load-bearing, and each was learned from a defect in
 * an earlier revision of this guard:
 *
 *  - Comments must go. `src/index.ts`'s own doc comment names both guarded
 *    functions to explain why it does not export them, and would otherwise
 *    trip R3 — as would any future comment discussing them, which is exactly
 *    the kind of false positive that gets a guard deleted rather than fixed.
 *
 *  - Strings must stay. A module specifier *is* a string literal, so blanking
 *    strings makes R1 and R2 match nothing at all; that shipped once, silently
 *    inert. Blanking them also broke R3: the scanner had no notion of JSX text,
 *    so a lone apostrophe in `Collega's koppelen aan dit dossier`
 *    (Issuekaart.tsx) flipped quote parity and blanked half the file, hiding a
 *    real leak in five separate sources.
 *
 * The scanner still *tracks* strings, without erasing them, so that a `//`
 * inside one is not mistaken for a comment — `https://…` URLs are common in
 * this tree (feiten.data.ts, pa.api.ts), and treating those as comments would
 * blank the rest of each line.
 *
 * The trade-off of keeping strings is that R3 would flag a guarded name
 * written *inside* a string literal. Verified as costless today: every
 * occurrence of either name anywhere in src is a comment, an identifier, or an
 * import clause — none is string content. If that ever changes, prefer
 * renaming the string over reintroducing string-blanking, which is what made
 * this guard half-blind before.
 */
function stripComments(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
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
    } else if (c === "'" || c === '"' || c === '`') {
      // Skip over, do not blank: the text is kept for R1/R2.
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;
        else if (src[j] === c) break;
        else j++;
      }
      i = Math.min(j + 1, src.length);
    } else {
      i++;
    }
  }
  return out.join('');
}

/** R1: guarded names appearing in an import/export clause from modes.config. */
function guardedNamesImportedFromConfig(code: string): string[] {
  const hits = new Set<string>();
  const re =
    /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*modes\.config(?:\.js)?['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    for (const name of GUARDED_NAMES) {
      if (new RegExp(`\\b${name}\\b`).test(m[1])) hits.add(name);
    }
  }
  return [...hits];
}

/**
 * R2: forms that yield the module scope wholesale without naming anything —
 * a namespace import or a star re-export. Matches a `.js` suffix too.
 */
function reachesConfigWholesale(code: string): boolean {
  return /(?:import\s+\*\s+as\s+\w+|export\s+\*)\s+from\s+\S*modes\.config(?:\.js)?\S*/.test(code);
}

/**
 * Names the file destructures out of `usePaModes()` — the sanctioned source.
 *
 * The character class is `[^{}]*`, not `[^}]*`: the looser version lets the
 * match start at the enclosing function's opening brace and swallow it, so a
 * component whose *first* body statement is the destructure captured
 * `"const { allStaticSections "` and registered nothing — flagging correct
 * code. PACommandPalette.tsx escaped that only by the accident of another
 * destructure sitting on the line above.
 */
function boundFromUsePaModes(code: string): Set<string> {
  const bound = new Set<string>();
  for (const m of code.matchAll(/\{([^{}]*)\}\s*=\s*usePaModes\s*\(\s*\)/g)) {
    for (const part of m[1].split(',')) {
      // `allStaticSections` or `allStaticSections: renamed` — the provided
      // name is on the left of the colon either way.
      const name = part.split(':')[0].trim();
      if (name) bound.add(name);
    }
  }
  return bound;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

interface Offender {
  file: string;
  reason: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(SRC_DIR)) {
    const rel = relative(SRC_DIR, file);
    const code = stripComments(readFileSync(file, 'utf-8'));

    // R1 and R2 apply to every file, allow-list included.
    const imported = guardedNamesImportedFromConfig(code);
    if (imported.length > 0) {
      offenders.push({
        file: rel,
        reason: `imports ${imported.join(', ')} from modes.config — that is the unfiltered version`,
      });
    }
    if (reachesConfigWholesale(code)) {
      offenders.push({
        file: rel,
        reason: 'namespace-imports or star-re-exports modes.config, which can yield either helper',
      });
    }

    // R3 only: the two sanctioned files are exempt from this rule alone.
    if (R3_EXEMPT.has(rel)) continue;
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
