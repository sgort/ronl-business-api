import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ProcessView is the one way to show a process (see its header). This guard
 * fails when a file outside components/process imports PhaseSwimlane, so a
 * new dashboard cannot draw a swimlane around the shared rendering. It
 * asserts that it finds ProcessView's own import, so a broken scan cannot
 * pass by finding nothing.
 */
const PROCESS_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_SRC = join(PROCESS_DIR, '..', '..');
const COCKPIT_SRC = join(FRONTEND_SRC, '..', '..', 'pa-cockpit', 'src');
const IMPORTS_SWIMLANE = /(?:from\s+|import\s*\(\s*)['"][^'"]*\/PhaseSwimlane(?:\.[jt]sx?)?['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('process view guard', () => {
  const importers = [FRONTEND_SRC, COCKPIT_SRC]
    .flatMap(sourceFiles)
    .filter((f) => IMPORTS_SWIMLANE.test(readFileSync(f, 'utf8')));
  const inProcessDir = (f: string) =>
    !relative(PROCESS_DIR, f).startsWith('..') && !relative(PROCESS_DIR, f).includes(`..${sep}`);

  it('finds ProcessView’s own import (the scan works)', () => {
    expect(importers.some((f) => f.endsWith(`${sep}ProcessView.tsx`))).toBe(true);
  });

  it('recognises every spelling of the import, with or without an extension', () => {
    for (const line of [
      "import PhaseSwimlane from '../process/PhaseSwimlane';",
      "import PhaseSwimlane from '../process/PhaseSwimlane.tsx';",
      'import PhaseSwimlane from "../process/PhaseSwimlane.js";',
      "export { default } from './PhaseSwimlane';",
      "const P = await import('../process/PhaseSwimlane');",
    ]) {
      expect(IMPORTS_SWIMLANE.test(line), line).toBe(true);
    }
    expect(IMPORTS_SWIMLANE.test("import X from './PhaseSwimlaneLegend';")).toBe(false);
  });

  it('finds no PhaseSwimlane import outside components/process', () => {
    const outside = importers.filter((f) => !inProcessDir(f)).map((f) => relative(FRONTEND_SRC, f));
    expect(outside).toEqual([]);
  });
});
