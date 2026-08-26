// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';
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
 * Source rules (assertion 1). Each reads one of the two texts scanSource
 * derives; which one is not interchangeable — see its doc comment:
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
 * One parse, two derived texts — because the rules that ACCUSE and the rule
 * that EXCUSES need opposite error directions.
 *
 *   `accuse`  comments blanked; string, template, regex and JSX text KEPT.
 *   `excuse`  those literal contents blanked as well.
 *
 * Why they differ. Extra text can only ever *add* matches, so for R1, R2 and
 * R3's "does this name appear at all" scan, keeping literals is safe: the
 * worst case is a false accusation, which is loud and gets fixed. But
 * `boundFromUsePaModes` is the one rule that *switches another rule off*.
 * Feeding it text that is not code lets a single line disarm R3 for a whole
 * file:
 *
 *     const _docs = 'const { allStaticSections } = usePaModes()';
 *
 * — after which `cfg.allStaticSections()` from a dynamic import sails through,
 * and R3 is the only rule covering dynamic imports and computed member access.
 * So the excusing rule reads the erased text, where a phrase in a literal
 * cannot mint a binding. A real destructure clause is never literal content,
 * so the erasure costs that rule nothing.
 *
 * The general rule, worth keeping in mind before adding a fifth rule here:
 * **a rule that accuses may read a superset of the code; a rule that excuses
 * must read a subset.** They cannot share an input.
 *
 * ── Why this uses the TypeScript parser rather than a scanner ──
 *
 * Three hand-rolled scanners were tried here and each shipped a distinct
 * silent hole, every one of them a form of "this text is not code but the
 * scanner thought it was", or the reverse:
 *
 *   1. Blanking string literals erased module specifiers, leaving R1/R2
 *      matching nothing at all — inert, and green.
 *   2. Quote-tracking with no notion of JSX text: the apostrophe in
 *      `Collega's koppelen aan dit dossier` (Issuekaart.tsx) opened a phantom
 *      literal that suppressed comment-stripping for the rest of the file.
 *   3. Capping quotes at a newline fixed that, but not
 *      `dossierbeheer.data.ts:166` — `.replace(/[#>*`|_-]/g, ' ')`, a regex
 *      literal containing a backtick, which opened a phantom *template*
 *      literal. Template literals may legally span lines, so no newline cap
 *      can help; seven comment lines went on surviving.
 *
 * Each fix was correct and each left another instance of the same class. The
 * parser already knows exactly which spans are comments, literals and JSX
 * text, in every one of these cases and the ones nobody has hit yet, so the
 * guard asks it instead of guessing. `typescript` is already a devDependency
 * and already runs over this package in `npm run type-check`.
 */
interface Scanned {
  /** Comments blanked, literal contents kept. For rules that accuse. */
  accuse: string;
  /** Comments and literal contents blanked. For the rule that excuses. */
  excuse: string;
}

function scanSource(src: string, fileName: string): Scanned {
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const accuse = src.split('');
  const excuse = src.split('');
  const blank = (target: string[], from: number, to: number) => {
    for (let k = from; k < to; k++) if (target[k] !== '\n') target[k] = ' ';
  };
  const blankBoth = (from: number, to: number) => {
    blank(accuse, from, to);
    blank(excuse, from, to);
  };

  const seenComment = new Set<number>();
  const visit = (node: ts.Node) => {
    // Every comment in a file is leading trivia of some token, so walking down
    // to the tokens reaches all of them — including the ones before EOF.
    for (const range of ts.getLeadingCommentRanges(src, node.pos) ?? []) {
      if (!seenComment.has(range.pos)) {
        seenComment.add(range.pos);
        blankBoth(range.pos, range.end);
      }
    }

    // Literal *contents* — quotes and delimiters stay so offsets keep lining
    // up and R1/R2's specifier matching still sees a quoted string in `accuse`.
    const start = node.getStart(sf);
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      // Template head/middle/tail keep their `${` and backticks; only the
      // literal text between delimiters is erased, so `${expr}` stays code.
      blank(excuse, start + 1, node.end - 1);
    } else if (ts.isJsxText(node)) {
      blank(excuse, start, node.end);
    }

    node.getChildren(sf).forEach(visit);
  };
  sf.getChildren(sf).forEach(visit);

  return { accuse: accuse.join(''), excuse: excuse.join('') };
}

/** R1: guarded names appearing in an import/export clause from modes.config. */
function guardedNamesImportedFromConfig(code: string): string[] {
  const hits = new Set<string>();
  // `\s*` not `\s+` before the brace: `import{x}from'./modes.config'` is legal
  // (Prettier would never emit it, but the guard should not depend on Prettier).
  // `\b` keeps `reimport{…}` from matching.
  const re =
    /\b(?:import|export)\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*modes\.config(?:\.js)?['"]/g;
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
    const { accuse, excuse } = scanSource(readFileSync(file, 'utf-8'), file);

    // R1 and R2 apply to every file, allow-list included.
    const imported = guardedNamesImportedFromConfig(accuse);
    if (imported.length > 0) {
      offenders.push({
        file: rel,
        reason: `imports ${imported.join(', ')} from modes.config — that is the unfiltered version`,
      });
    }
    if (reachesConfigWholesale(accuse)) {
      offenders.push({
        file: rel,
        reason: 'namespace-imports or star-re-exports modes.config, which can yield either helper',
      });
    }

    // R3 only: the two sanctioned files are exempt from this rule alone.
    if (R3_EXEMPT.has(rel)) continue;
    // The accusation reads the superset, the excuse reads the subset — see
    // scanSource. Swapping these two arguments reopens the disarming exploit.
    const bound = boundFromUsePaModes(excuse);
    const unexplained = GUARDED_NAMES.filter(
      (name) => new RegExp(`\\b${name}\\b`).test(accuse) && !bound.has(name)
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
