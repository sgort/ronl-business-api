import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

/**
 * ChangelogPanel.tsx must stay a shim.
 *
 * changelog-data.ts is 131 KB gzipped and LoginChoice.tsx renders this panel,
 * so the split is what keeps an unauthenticated visitor from downloading the
 * project's entire release history. Several edits would undo it while
 * leaving every behavioural test green, which is why this file exists:
 *
 *   - a static value import that reaches the data, including one of the
 *     content module alongside the lazy() call;
 *   - a re-export of a content-module symbol with a module specifier
 *     (`export { X } from './ChangelogPanelContent'` or
 *     `export * from './ChangelogPanelContent'`) — the mirror image of the
 *     import case, and just as static a runtime edge;
 *   - dropping the word `type` from the props import, which restores the
 *     static edge in four characters;
 *   - removing the isOpen gate, after which React resolves the import on
 *     mount and the chunk ships on every page load anyway.
 *
 * None of these changes what a user sees, so nothing else would notice.
 *
 * It parses rather than greps, as pa-cockpit-class-coverage.test.ts and
 * no-module-scope-modes.test.ts do, and for the same reason: a regex cannot
 * tell an import from the same words in a comment or a string literal, and the
 * parse tree distinguishes them by construction.
 *
 * ── Shape expectations baked into the assertions below ──
 *
 * The lazy() call must be the initializer of a top-level `const` — moving it
 * inside the component body mints a fresh lazy type on every render, which
 * remounts the drawer (and blinks it, given `fallback={null}`). The default
 * export must be a `function` declaration marked `export default` — not
 * `const X = () => {…}; export default X;` — whose *first* statement is
 * `if (!isOpen) return null;`, unwrapped in braces. None of these shapes are
 * behaviourally required by React; they exist so this guard can find the gate
 * and the lazy() call without re-implementing a general-purpose control-flow
 * analyser. Restructuring the shim while preserving behaviour can trip these
 * assertions for reasons unrelated to the split — the failure messages below
 * say so where that is likely to be the reason.
 */
const SHIM = join(dirname(fileURLToPath(import.meta.url)), 'ChangelogPanel.tsx');

/**
 * Modules the shim may import — or re-export from — for their runtime value.
 *
 * An allow-list, not a list of forbidden specifiers. "Must not import
 * ./changelog-data" would be satisfied by importing ./ChangelogPanelContent
 * statically instead, which pulls in the data transitively and is the likelier
 * mistake. Naming what is permitted closes both doors with one rule, and the
 * same rule covers `export … from` for the reason given below.
 */
const ALLOWED_VALUE_IMPORTS = new Set(['react']);

const CONTENT_MODULE = './ChangelogPanelContent';

function parse(text: string): ts.SourceFile {
  return ts.createSourceFile(
    SHIM,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
}

function parseShim(): ts.SourceFile {
  return parse(readFileSync(SHIM, 'utf-8'));
}

/** True when an import contributes nothing at runtime. */
function isTypeOnlyImport(stmt: ts.ImportDeclaration): boolean {
  const clause = stmt.importClause;
  if (!clause) return false; // bare `import './x'` — a side-effect import, real
  if (clause.isTypeOnly) return true; // `import type { X } from …`
  if (clause.name) return false; // a default binding is a value
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return false; // `import * as x` is a value
  // `import { type A, type B }` — type-only iff every specifier is.
  return bindings.elements.every((el) => el.isTypeOnly);
}

/**
 * True when a `export … from '…'` declaration contributes nothing at runtime.
 *
 * The mirror image of isTypeOnlyImport. A re-export with a module specifier
 * is just as static a dependency edge as an import — it is how the shim
 * would end up pulling in the content module without ever writing
 * `import './ChangelogPanelContent'` in a form the first check would flag on
 * its own. Only the declaration forms below are exempt:
 *
 *   - `export type { X } from '…'`            (whole declaration type-only)
 *   - `export { type X, type Y } from '…'`    (every named specifier type-only)
 *
 * `export * from '…'` and `export * as ns from '…'` have no per-specifier
 * type annotation to check — they are never exempt.
 */
function isTypeOnlyExport(stmt: ts.ExportDeclaration): boolean {
  if (stmt.isTypeOnly) return true;
  const clause = stmt.exportClause;
  if (!clause) return false; // `export * from …` — no per-specifier type info
  if (!ts.isNamedExports(clause)) return false; // `export * as ns from …` — a value
  return clause.elements.every((el) => el.isTypeOnly);
}

/** Modules imported or re-exported for their value, minus the allow-list. */
function valueImportOffenders(sf: ts.SourceFile): string[] {
  const offenders: string[] = [];
  const allowed = [...ALLOWED_VALUE_IMPORTS].join(', ');
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      if (isTypeOnlyImport(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) continue;
      if (!ALLOWED_VALUE_IMPORTS.has(spec.text)) {
        offenders.push(
          `${spec.text} is imported for its value; only ${allowed} may be. ` +
            `A static import here pulls the changelog back into the entry chunk.`
        );
      }
      continue;
    }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      if (isTypeOnlyExport(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) continue;
      if (!ALLOWED_VALUE_IMPORTS.has(spec.text)) {
        offenders.push(
          `${spec.text} is re-exported for its value; only ${allowed} may be. ` +
            `A static re-export here pulls the changelog back into the entry chunk — even while the ` +
            `re-exported name has no consumer yet and the bundler tree-shakes it away today. The moment a ` +
            `consumer appears, the same re-export stops being dead code and merges the chunk back into the ` +
            `entry, so it is rejected now rather than left to fail silently later.`
        );
      }
    }
  }
  return offenders;
}

/** Names bound, as values, to imports from 'react'. */
function reactValueImports(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || spec.text !== 'react') continue;
    const clause = stmt.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
    else for (const el of bindings.elements) if (!el.isTypeOnly) names.add(el.name.text);
  }
  return names;
}

/** The dynamic-import call inside a top-level `const X = lazy(() => import('…'))`. */
function sanctionedLazyImport(sf: ts.SourceFile): ts.CallExpression | null {
  const react = reactValueImports(sf);
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      if (!init || !ts.isCallExpression(init)) continue;
      if (!ts.isIdentifier(init.expression) || !react.has(init.expression.text)) continue;
      if (init.arguments.length !== 1) continue;
      const arrow = init.arguments[0];
      if (!ts.isArrowFunction(arrow) || !ts.isCallExpression(arrow.body)) continue;
      const inner = arrow.body;
      if (
        inner.expression.kind === ts.SyntaxKind.ImportKeyword &&
        inner.arguments.length === 1 &&
        ts.isStringLiteral(inner.arguments[0])
      ) {
        return inner;
      }
    }
  }
  return null;
}

function lazyTargetOf(sf: ts.SourceFile): string | null {
  const call = sanctionedLazyImport(sf);
  if (!call) return null;
  return (call.arguments[0] as ts.StringLiteral).text;
}

/**
 * Dynamic `import()` calls other than the one the lazy() binding owns.
 *
 * The three checks above all look at declaration syntax, so none of them sees a
 * bare `import('./ChangelogPanelContent');` sitting at module scope. That shape
 * fires the fetch unconditionally at module evaluation — exactly what the split
 * exists to prevent — while the chunk stays nominally separate, so no other
 * assertion notices. It also evades noUnusedLocals, having no binding, and this
 * project's ESLint config carries no no-unused-expressions rule.
 *
 * Anything that is not the sanctioned call is reported, whether it is a bare
 * statement, an eager `void import(…)` prefetch, or an await at module scope.
 */
function strayDynamicImports(sf: ts.SourceFile): string[] {
  const sanctioned = sanctionedLazyImport(sf);
  const strays: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node !== sanctioned
    ) {
      const arg = node.arguments[0];
      strays.push(arg && ts.isStringLiteral(arg) ? arg.text : '<computed specifier>');
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return strays;
}

/**
 * Does the default export return before it can render the lazy element?
 *
 * Accepts both `if (!isOpen) return null;` and the braced form. They are
 * behaviourally identical and the braced one is a common lint preference;
 * rejecting it made the guard fail correct code, which is how guards get
 * deleted rather than repaired.
 */
function gatesOnIsOpen(sf: ts.SourceFile): boolean {
  let first: ts.Statement | undefined;
  for (const stmt of sf.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      first = stmt.body?.statements[0];
    }
  }
  if (
    !first ||
    !ts.isIfStatement(first) ||
    !ts.isPrefixUnaryExpression(first.expression) ||
    first.expression.operator !== ts.SyntaxKind.ExclamationToken ||
    !ts.isIdentifier(first.expression.operand) ||
    first.expression.operand.text !== 'isOpen'
  ) {
    return false;
  }
  const then = first.thenStatement;
  return (
    ts.isReturnStatement(then) ||
    (ts.isBlock(then) && then.statements.length === 1 && ts.isReturnStatement(then.statements[0]))
  );
}

describe('ChangelogPanel.tsx stays a shim', () => {
  it('imports or re-exports nothing for its value except the allow-list', () => {
    const offenders = valueImportOffenders(parseShim());
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('reaches the content module only through a lazy() call assigned at module scope', () => {
    expect(
      lazyTargetOf(parseShim()),
      `no top-level \`const X = lazy(() => import('${CONTENT_MODULE}'))\` found — either the panel is not ` +
        `code-split, the lazy() call moved out of module scope, or its callee is not the \`lazy\` imported ` +
        `from 'react'`
    ).toBe(CONTENT_MODULE);
  });

  it('has no dynamic import other than the one lazy() owns', () => {
    const strays = strayDynamicImports(parseShim());
    expect(
      strays,
      `dynamic import of ${strays.join(', ')} outside the lazy() binding — it fires at module ` +
        `evaluation, so the chunk downloads on every page load whether or not the drawer opens`
    ).toEqual([]);
  });

  it('returns before rendering the lazy element when closed', () => {
    expect(
      gatesOnIsOpen(parseShim()),
      "the default export's first statement must be `if (!isOpen) return null;` — " +
        'without it the lazy chunk downloads on mount and the split saves nothing ' +
        "(or the shim's shape changed — see this file's header)"
    ).toBe(true);
  });
});

/**
 * The checks above run against the real shim, so they can only ever prove it is
 * currently well-formed. These run the same functions over synthetic sources, to
 * prove each check would actually reject what it claims to — and, as importantly,
 * that it accepts the correct variants it must not reject.
 */
describe('the checks themselves', () => {
  const SHIM_SRC = `
import { lazy, Suspense } from 'react';
import type { ChangelogPanelProps } from './ChangelogPanelContent';
const ChangelogPanelContent = lazy(() => import('./ChangelogPanelContent'));
export default function ChangelogPanel({ isOpen, onClose }: ChangelogPanelProps) {
  if (!isOpen) return null;
  return <Suspense fallback={null}><ChangelogPanelContent isOpen onClose={onClose} /></Suspense>;
}
`;

  const LAZY_LINE = `const ChangelogPanelContent = lazy(() => import('${CONTENT_MODULE}'));`;

  it('accepts the shim shape it is modelled on', () => {
    const sf = parse(SHIM_SRC);
    expect(valueImportOffenders(sf)).toEqual([]);
    expect(lazyTargetOf(sf)).toBe(CONTENT_MODULE);
    expect(strayDynamicImports(sf)).toEqual([]);
    expect(gatesOnIsOpen(sf)).toBe(true);
  });

  it('rejects a bare dynamic import at module scope', () => {
    const sf = parse(SHIM_SRC.replace(LAZY_LINE, `import('${CONTENT_MODULE}');\n${LAZY_LINE}`));
    expect(strayDynamicImports(sf)).toEqual([CONTENT_MODULE]);
    // Nothing else notices — which is why this check had to be added.
    expect(valueImportOffenders(sf)).toEqual([]);
    expect(lazyTargetOf(sf)).toBe(CONTENT_MODULE);
    expect(gatesOnIsOpen(sf)).toBe(true);
  });

  it('rejects an eager void-prefetch too', () => {
    const sf = parse(
      SHIM_SRC.replace(LAZY_LINE, `void import('${CONTENT_MODULE}');\n${LAZY_LINE}`)
    );
    expect(strayDynamicImports(sf)).toEqual([CONTENT_MODULE]);
  });

  it('accepts a braced gate, which is behaviourally identical', () => {
    const sf = parse(
      SHIM_SRC.replace('if (!isOpen) return null;', 'if (!isOpen) {\n    return null;\n  }')
    );
    expect(gatesOnIsOpen(sf)).toBe(true);
  });

  it('still rejects a gate that does not return', () => {
    const sf = parse(SHIM_SRC.replace('if (!isOpen) return null;', 'if (!isOpen) onClose();'));
    expect(gatesOnIsOpen(sf)).toBe(false);
  });

  it('still rejects a value re-export and a lazy() moved off module scope', () => {
    const reexported = parse(SHIM_SRC + "export { ScopeBadge } from './ChangelogPanelContent';\n");
    expect(valueImportOffenders(reexported)).toHaveLength(1);

    const nested = parse(
      SHIM_SRC.replace(
        "const ChangelogPanelContent = lazy(() => import('./ChangelogPanelContent'));",
        ''
      ).replace(
        'if (!isOpen) return null;',
        "if (!isOpen) return null;\n  const ChangelogPanelContent = lazy(() => import('./ChangelogPanelContent'));"
      )
    );
    expect(lazyTargetOf(nested)).toBeNull();
  });
});
