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
 * project's entire release history. Three edits would undo it while leaving
 * every behavioural test green, which is why this file exists:
 *
 *   - a static value import that reaches the data, including one of the
 *     content module alongside the lazy() call;
 *   - dropping the word `type` from the props import, which restores the
 *     static edge in four characters;
 *   - removing the isOpen gate, after which React resolves the import on
 *     mount and the chunk ships on every page load anyway.
 *
 * None of the three changes what a user sees, so nothing else would notice.
 *
 * It parses rather than greps, as pa-cockpit-class-coverage.test.ts and
 * no-module-scope-modes.test.ts do, and for the same reason: a regex cannot
 * tell an import from the same words in a comment or a string literal, and the
 * parse tree distinguishes them by construction.
 */
const SHIM = join(dirname(fileURLToPath(import.meta.url)), 'ChangelogPanel.tsx');

/**
 * Modules the shim may import for their runtime value.
 *
 * An allow-list, not a list of forbidden specifiers. "Must not import
 * ./changelog-data" would be satisfied by importing ./ChangelogPanelContent
 * statically instead, which pulls in the data transitively and is the likelier
 * mistake. Naming what is permitted closes both doors with one rule.
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

describe('ChangelogPanel.tsx stays a shim', () => {
  it('imports nothing for its value except the allow-list', () => {
    const offenders: string[] = [];
    for (const stmt of parseShim().statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      if (isTypeOnlyImport(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) continue;
      if (!ALLOWED_VALUE_IMPORTS.has(spec.text)) {
        offenders.push(
          `${spec.text} is imported for its value; only ${[...ALLOWED_VALUE_IMPORTS].join(', ')} may be. ` +
            `A static import here pulls the changelog back into the entry chunk.`
        );
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('reaches the content module only through lazy(() => import(…))', () => {
    let lazyTarget: string | null = null;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'lazy' &&
        node.arguments.length === 1
      ) {
        const arrow = node.arguments[0];
        if (ts.isArrowFunction(arrow) && ts.isCallExpression(arrow.body)) {
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
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(parseShim(), visit);

    expect(
      lazyTarget,
      `no lazy(() => import('${CONTENT_MODULE}')) found — the panel is not code-split`
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
      firstStatement.expression.operand.text === 'isOpen';

    expect(
      gatesOnIsOpen,
      "the default export's first statement must be `if (!isOpen) return null;` — " +
        'without it the lazy chunk downloads on mount and the split saves nothing'
    ).toBe(true);
  });
});
