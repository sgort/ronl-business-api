import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import * as pkg from './index';

/**
 * Pins the package's public surface to an explicit list.
 *
 * Nothing was watching this before: eighteen names were added to the public
 * surface in one pass (Task 9) and reverted to one (PaSectionsRouter) in the
 * next, with no test noticing either change. The next widening should be a
 * failing assertion someone has to update on purpose, not a silent diff.
 *
 * Values and types need different mechanisms, and only the value half existed
 * until now — the type names sat in a `void`ed array as documentation, so the
 * fifteen type exports were exactly as unwatched as the whole surface had
 * been. Adding or removing one was silent. That is closed below.
 */
const EXPECTED_VALUE_EXPORTS = [
  'PADashboardV2',
  'configurePaCockpit',
  'getPaCockpitAuth',
  'getPaCockpitTenant',
  'PA_MODES',
  'SORT_SECTION_IDS',
  'deriveDossierRole',
  'DB_ROLES',
  'DB_CAPS',
  'isPaMock',
  'PaSectionsRouter',
].sort();

/**
 * The type-only exports. Erased at build and absent from `Object.keys`, so
 * `import * as pkg` cannot see them at all — the value assertion below is
 * blind to this entire half of the contract.
 *
 * Read from the source instead. `typescript` is already a devDependency and
 * already parses this package in `npm run type-check`, and the same
 * parse-don't-scan choice is made for the same reasons in
 * `src/modes/no-module-scope-modes.test.ts` — a regex over export clauses
 * cannot tell `export type { A }` from the string `'export type { A }'`, and
 * the AST distinguishes them by construction.
 */
const EXPECTED_TYPE_EXPORTS = [
  'PaCockpitHost',
  'PaSectionRouterProps',
  'PaDockProps',
  'PaChangelogPanelProps',
  'PaCockpitAuth',
  'PaCockpitTenant',
  'PaCockpitServices',
  'PaTenantConfig',
  'PaModeId',
  'PaModeConfig',
  'PaRailItem',
  'PaRailGroup',
  'DossierRole',
].sort();

/**
 * Every name this file exports as a type, from either spelling: the whole
 * clause marked `export type { … }`, or an individual `export { type … }`
 * specifier. Aliased forms report the *exported* name, which is what a host
 * sees.
 */
function declaredTypeExports(): string[] {
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.ts');
  const sf = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, 'utf-8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS
  );

  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    const clause = stmt.exportClause;
    if (!clause || !ts.isNamedExports(clause)) continue;
    for (const el of clause.elements) {
      if (stmt.isTypeOnly || el.isTypeOnly) names.push(el.name.text);
    }
  }
  return names.sort();
}

describe('the package public surface (src/index.ts)', () => {
  it('exports exactly the expected value names, no more, no fewer', () => {
    expect(Object.keys(pkg).sort()).toEqual(EXPECTED_VALUE_EXPORTS);
  });

  it('exports exactly the expected type names, no more, no fewer', () => {
    expect(declaredTypeExports()).toEqual(EXPECTED_TYPE_EXPORTS);
  });
});
