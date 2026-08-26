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
 * Source rules (assertion 1). The three that accuse read scanSource's text;
 * the one that excuses reads its AST. That split is not interchangeable —
 * see scanSource's doc comment:
 *
 *   R1  No file may name a guarded identifier in an import/export *clause*
 *       taken from modes.config. Applies to EVERY file, allow-list included:
 *       a named import of the unfiltered helper is wrong no matter who writes
 *       it, and this is the rule that stops a file from earning an exemption
 *       under R3 and then importing the module version anyway.
 *   R2  No file may namespace-import or star-re-export modes.config. Neither
 *       form names an identifier, so R1 and R3 cannot see them.
 *   R3  No file may name a guarded identifier at all unless it *bound* that
 *       name from `usePaModes()` — the real hook, verified as imported from
 *       PaModesContext, not merely something spelled that way. This is the
 *       path-independent rule: it does not care how the name arrived, so
 *       `.js` suffixes, dynamic imports and aliased re-exports are all
 *       covered.
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
 * One parse, feeding the two rule families their different inputs.
 *
 *   `accuse`  the source with comments blanked, literal contents KEPT.
 *   `sf`      the parsed tree.
 *
 * Why they differ, and the principle this file has now been bitten by twice:
 *
 *   **A rule that accuses may read a superset of the code; a rule that
 *   excuses must read a subset. They cannot share an input.**
 *
 * Extra text can only ever *add* matches, so for R1, R2 and R3's "does this
 * name appear at all" scan, keeping literal contents is safe — the worst case
 * is a false accusation, which is loud and gets fixed. But
 * `boundFromUsePaModes` switches R3 off, and R3 is the only rule covering
 * dynamic imports and computed member access. Anything it reads that is not
 * code becomes a way to disarm it:
 *
 *     const _docs = 'const { allStaticSections } = usePaModes()';   // a string
 *     // Mirrors PACommandPalette: const { allStaticSections } = usePaModes();
 *
 * Both of those silenced R3 for an entire file while
 * `(await import('…/modes.config')).allStaticSections()` sat below them. An
 * earlier revision answered this with a second, literal-erased *text*; the
 * excusing rule now reads the **AST** instead, which is the same idea taken to
 * its conclusion — a binding pattern in the tree is code by construction, so
 * prose can never mint one, and the tree is also what lets the rule verify
 * that the `usePaModes` being called is the imported hook.
 *
 * Comments are blanked from `accuse` because `src/index.ts`'s own doc comment
 * names both guarded functions to explain why it does not export them, and
 * would otherwise trip R3 — as would any future comment discussing them, which
 * is exactly the kind of false positive that gets a guard deleted rather than
 * fixed. Literal *contents* stay, because a module specifier is a string and
 * R1/R2 match on it.
 *
 * ── Why this parses rather than scans ──
 *
 * Three hand-rolled scanners were tried here and each shipped a distinct
 * silent hole, every one an instance of "this text is not code but the scanner
 * thought it was", or the reverse:
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
 * text, in these cases and the ones nobody has hit yet. `typescript` is
 * already a devDependency and already runs over this package in
 * `npm run type-check`.
 */
interface Scanned {
  /** Comments blanked, literal contents kept. For the rules that accuse. */
  accuse: string;
  /** The parsed tree. For the rule that excuses. */
  sf: ts.SourceFile;
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
  const seen = new Set<number>();
  const visit = (node: ts.Node) => {
    // Every comment is leading trivia of some token, so walking down to the
    // tokens reaches all of them — including the ones before EOF.
    for (const range of ts.getLeadingCommentRanges(src, node.pos) ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      for (let k = range.pos; k < range.end; k++) {
        if (accuse[k] !== '\n') accuse[k] = ' ';
      }
    }
    node.getChildren(sf).forEach(visit);
  };
  sf.getChildren(sf).forEach(visit);

  return { accuse: accuse.join(''), sf };
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
 * Specifier of the module that owns the real hook. Matched on the trailing
 * path so any relative depth works — `../modes/PaModesContext`,
 * `../../modes/PaModesContext`, `./PaModesContext` from inside src/modes.
 * The basename is unique in this package.
 */
const PA_MODES_CONTEXT_RE = /(?:^|\/)PaModesContext(?:\.js)?$/;

/**
 * The local name `usePaModes` is imported under in this file, or null if the
 * file does not import it from the modes context at all.
 *
 * This is the premise the excuse rests on, and R3 must verify it rather than
 * assume it. Matching the *text* `{ … } = usePaModes()` says only that
 * something spelled `usePaModes` was called; it does not say that the thing
 * called was the hook. A file that declares its own
 *
 *     function usePaModes() { return { allStaticSections: () => [] }; }
 *     const { allStaticSections } = usePaModes();
 *
 * registered both guarded names as bound and switched R3 off for the whole
 * file — after which a dynamic import of the real modes.config passed. That
 * is not a contrivance: a locally scoped helper or a test double sharing the
 * name is ordinary code, and nothing about writing it signals that a guard
 * has just been disarmed.
 *
 * The rule is therefore absolute: no import of `usePaModes` from
 * PaModesContext means no excuse, full stop.
 */
function localUsePaModesName(sf: ts.SourceFile): string | null {
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || !PA_MODES_CONTEXT_RE.test(spec.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      // `propertyName` is set only when the import is aliased, in which case
      // it holds the exported name and `name` holds the local one.
      if ((el.propertyName ?? el.name).text === 'usePaModes') return el.name.text;
    }
  }
  return null;
}

/**
 * Names the file destructures out of the *verified* `usePaModes` hook.
 *
 * Reads the AST rather than text. That is the same principle the two texts
 * encoded — an excusing rule must read a subset of the code — taken to its
 * conclusion: a binding pattern in the tree is code by construction, so no
 * amount of prose in a string, comment or JSX node can mint one. It is also
 * what makes the premise check above possible at all; resolving which import
 * a call refers to is not something a regex can do.
 */
function boundFromUsePaModes(sf: ts.SourceFile): Set<string> {
  const bound = new Set<string>();
  const hook = localUsePaModesName(sf);
  if (!hook) return bound;

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === hook
    ) {
      for (const el of node.name.elements) {
        // For `{ allStaticSections: mine }` the *provided* name is the one
        // R3 needs to see explained, and that is propertyName.
        const provided = el.propertyName ?? el.name;
        if (ts.isIdentifier(provided)) bound.add(provided.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
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
    const { accuse, sf } = scanSource(readFileSync(file, 'utf-8'), file);

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
    // The accusation reads text (a superset of the code — safe direction for
    // a rule that accuses). The excuse reads the AST, the strictest subset,
    // and verifies that `usePaModes` is the imported hook before honouring it.
    const bound = boundFromUsePaModes(sf);
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
