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

function parseShim(): ts.SourceFile {
  return ts.createSourceFile(
    SHIM,
    readFileSync(SHIM, 'utf-8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
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

describe('ChangelogPanel.tsx stays a shim', () => {
  it('imports or re-exports nothing for its value except the allow-list', () => {
    const offenders: string[] = [];
    for (const stmt of parseShim().statements) {
      if (ts.isImportDeclaration(stmt)) {
        if (isTypeOnlyImport(stmt)) continue;
        const spec = stmt.moduleSpecifier;
        if (!ts.isStringLiteral(spec)) continue;
        if (!ALLOWED_VALUE_IMPORTS.has(spec.text)) {
          offenders.push(
            `${spec.text} is imported for its value; only ${[...ALLOWED_VALUE_IMPORTS].join(', ')} may be. ` +
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
            `${spec.text} is re-exported for its value; only ${[...ALLOWED_VALUE_IMPORTS].join(', ')} may be. ` +
              `A static re-export here pulls the changelog back into the entry chunk — even while the ` +
              `re-exported name has no consumer yet and the bundler tree-shakes it away today. The moment a ` +
              `consumer appears, the same re-export stops being dead code and merges the chunk back into the ` +
              `entry, so it is rejected now rather than left to fail silently later.`
          );
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('reaches the content module only through a lazy() call assigned at module scope', () => {
    const sf = parseShim();

    // Names bound, as values, to imports from 'react' — the only source the
    // lazy() callee below may resolve to. Without this, a locally declared
    // `function lazy(f) { return f(); }` would satisfy the shape checks that
    // follow just as well as the real React API does.
    const reactValueImports = new Set<string>();
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec) || spec.text !== 'react') continue;
      const clause = stmt.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) reactValueImports.add(clause.name.text); // default import
      const bindings = clause.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) {
        reactValueImports.add(bindings.name.text);
      } else {
        for (const el of bindings.elements) {
          if (!el.isTypeOnly) reactValueImports.add(el.name.text);
        }
      }
    }

    // Only a top-level `const X = …` counts. A lazy() call nested inside the
    // component body would still satisfy a whole-file walk, but it mints a
    // fresh lazy type on every render and remounts the drawer each time —
    // see the header note on shape expectations.
    let lazyTarget: string | null = null;
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (!init || !ts.isCallExpression(init)) continue;
        if (!ts.isIdentifier(init.expression) || !reactValueImports.has(init.expression.text))
          continue;
        if (init.arguments.length !== 1) continue;
        const arrow = init.arguments[0];
        if (!ts.isArrowFunction(arrow) || !ts.isCallExpression(arrow.body)) continue;
        const inner = arrow.body;
        if (
          inner.expression.kind === ts.SyntaxKind.ImportKeyword &&
          inner.arguments.length === 1 &&
          ts.isStringLiteral(inner.arguments[0])
        ) {
          lazyTarget = (inner.arguments[0] as ts.StringLiteral).text;
        }
      }
    }

    expect(
      lazyTarget,
      `no top-level \`const X = lazy(() => import('${CONTENT_MODULE}'))\` found — either the panel is not ` +
        `code-split, the lazy() call moved out of module scope, or its callee is not the \`lazy\` imported ` +
        `from 'react'`
    ).toBe(CONTENT_MODULE);
  });

  it('returns before rendering the lazy element when closed', () => {
    // The gate is what makes the split real. Without it React resolves the
    // import on mount and the chunk ships on every page load — the component
    // still behaves correctly, so no other test would fail.
    const sf = parseShim();
    let firstStatement: ts.Statement | undefined;
    for (const stmt of sf.statements) {
      if (
        ts.isFunctionDeclaration(stmt) &&
        stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        firstStatement = stmt.body?.statements[0];
      }
    }

    const gatesOnIsOpen =
      !!firstStatement &&
      ts.isIfStatement(firstStatement) &&
      ts.isPrefixUnaryExpression(firstStatement.expression) &&
      firstStatement.expression.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isIdentifier(firstStatement.expression.operand) &&
      firstStatement.expression.operand.text === 'isOpen' &&
      ts.isReturnStatement(firstStatement.thenStatement);

    expect(
      gatesOnIsOpen,
      "the default export's first statement must be `if (!isOpen) return null;` — " +
        'without it the lazy chunk downloads on mount and the split saves nothing ' +
        "(or the shim's shape changed — see this file's header)"
    ).toBe(true);
  });
});
