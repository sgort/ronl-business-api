#!/usr/bin/env node
/**
 * check-shared-declarations.mjs — @ronl/shared holds declarations, not logic.
 *
 * THE GAP THIS CLOSES (#84). The per-file 80% branch floor (#80) is enforced in
 * the five workspaces that have a test runner. `@ronl/shared` is not one of
 * them, so a function placed there is not under-tested — it is outside the
 * measurement entirely. No run fails, no reviewer sees a number move, and the
 * first hint is someone wondering later why coverage dropped in the package
 * that had to re-implement it.
 *
 * That is not hypothetical: v2026.09.4 moved a branching label helper OUT of
 * this package for exactly this reason. The helper was fine; the measurement
 * was silently absent.
 *
 * WHY A CHECK RATHER THAN A TEST RUNNER. Giving `shared` its own runner was the
 * other option, and it is worse today: the package contains zero executable
 * lines, so the runner would measure an empty set and report a green check that
 * means nothing — the same class of false comfort the coverage floor exists to
 * remove. "This package is declarations and constants" is a real, checkable
 * property, and it explains WHY there is no runner. If `shared` ever genuinely
 * needs runtime logic, delete this script and give it a Vitest runner with the
 * same per-file floor; that is the documented fallback, not a workaround.
 *
 * WHY THE COMPILER API RATHER THAN GREP. A regex cannot tell
 * `(x: string) => void` in an interface — a FunctionType, perfectly fine here —
 * from `const f = (x) => {...}`, an ArrowFunction, which is not. It would also
 * miss a function expression assigned to a const. The TypeScript parser knows
 * the difference; a pattern over text does not, and a check with false
 * positives gets disabled.
 *
 * Exit 0 when the package is declarations and constant data only, 1 otherwise.
 * The failure names the file, the line, and where the logic should live
 * instead — a check that only says "a rule was broken" makes the reader guess
 * at the fix.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = 'packages/shared/src';

/** Every .ts file under ROOT, recursively. */
function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out.sort();
}

/**
 * Node kinds that mean "this package now executes something".
 *
 * Deliberately NOT flagged: FunctionType and MethodSignature (a function shape
 * inside an interface is a declaration), and every type-level construct --
 * conditional types, mapped types, unions. Those are what this package is for.
 */
const FORBIDDEN = new Map([
  [ts.SyntaxKind.FunctionDeclaration, 'a function declaration'],
  [ts.SyntaxKind.FunctionExpression, 'a function expression'],
  [ts.SyntaxKind.ArrowFunction, 'an arrow function'],
  [ts.SyntaxKind.ClassDeclaration, 'a class declaration'],
  [ts.SyntaxKind.MethodDeclaration, 'a method implementation'],
  [ts.SyntaxKind.IfStatement, 'an if statement'],
  [ts.SyntaxKind.SwitchStatement, 'a switch statement'],
  [ts.SyntaxKind.ConditionalExpression, 'a ternary'],
  [ts.SyntaxKind.ForStatement, 'a for loop'],
  [ts.SyntaxKind.ForOfStatement, 'a for-of loop'],
  [ts.SyntaxKind.ForInStatement, 'a for-in loop'],
  [ts.SyntaxKind.WhileStatement, 'a while loop'],
  [ts.SyntaxKind.TryStatement, 'a try/catch'],
]);

const findings = [];

for (const file of sources(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    const what = FORBIDDEN.get(node.kind);
    if (what) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      findings.push({ file: relative('.', file), line: line + 1, what });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

const files = sources(ROOT).length;

if (findings.length === 0) {
  console.log(
    `check-shared-declarations: ${files} file(s) in ${ROOT}/ — declarations and constant data only.`
  );
  process.exit(0);
}

console.error(`\n${findings.length} finding(s) in ${ROOT}/:\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line} — ${f.what}`);
}
console.error(
  `
@ronl/shared has no test runner, so executable logic placed here escapes the
per-file 80% branch floor that every other workspace is held to (#80, #84). It
is not under-tested; it is unmeasured.

Put the function in the package that uses it. If both frontend and backend need
it, it belongs in whichever one owns the behaviour -- duplicate a few lines
rather than move branching logic somewhere nothing measures it. That is what
v2026.09.4 did with the label helper this rule comes from.

If this package genuinely needs runtime logic now, that is a deliberate change,
not a workaround: give it a Vitest runner with the same per-file floor, wire it
into the workflows that already carry packages/shared/** in their paths filter,
and delete this script. See packages/shared/README.md.
`
);
process.exit(1);
