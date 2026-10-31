import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- plain ESM script outside the workspace, no types
import * as move from '../../../scripts/css-colour/check-move.mjs';

/**
 * The cascade comparison behind `npm run check:css-move` (#374 item 4; design:
 * docs/superpowers/specs/2026-10-31-v2-chrome-shared-stylesheet-design.md).
 * It proves that moving rules between stylesheets changes nothing a host
 * renders: per selector and property the winning value is the same, and the
 * selectors competing for a property keep their order.
 */
type Finding = { kind: string; selector: string; prop: string; env: string; detail: string };
const { compareCascades, classOracle, cssLoadOrder, overlaps, HOSTS, ALIASES } = move as {
  overlaps(a: string, b: string): boolean;
  HOSTS: Record<string, { entry: string }>;
  ALIASES: Record<string, string>;
  compareCascades(args: {
    before: string[];
    after: string[];
    roots?: string[];
    envsBefore: Record<string, Map<string, string>>;
    envsAfter: Record<string, Map<string, string>>;
    competes?: (a: string, b: string) => boolean;
  }): Finding[];
  classOracle(
    sources: string[],
    options?: { exclusive?: string[][] }
  ): ((a: string, b: string) => boolean) & { renders(selector: string): boolean };
  cssLoadOrder(
    entry: string,
    read: (path: string) => string | null,
    aliases: Record<string, string>
  ): string[];
};

describe('cssLoadOrder', () => {
  const files: Record<string, string> = {
    'app/main.tsx': "import './index.css';\nimport App from './App';",
    'app/index.css': '.i {}',
    'app/App.tsx': [
      "import { useState } from 'react';",
      "import type { T } from './types';",
      "// import './commented.css';",
      "import {\n  A,\n  B,\n} from './pages/A';",
      "import '@pkg/styles.css';",
      "export * from './re';",
      "export const label = 'from';",
    ].join('\n'),
    'app/types.ts': "import './never.css';",
    'app/pages/A.tsx': "import './a.css';\nimport '../index.css';",
    'app/pages/a.css': '.a {}',
    'app/re/index.ts': "import './re.css';",
    'app/re/re.css': '.r {}',
    'pkg/src/styles.css':
      "/* @import './no.css'; */\n@import './shared.css';\n@import url('./own.css');\n.s {}",
    'pkg/src/shared.css': '.sh {}',
    'pkg/src/own.css': '.o {}',
  };
  const read = (p: string) => files[p] ?? null;
  const aliases = { '@pkg/styles.css': 'pkg/src/styles.css' };

  it('places a stylesheet that is also @imported at its last position, where its rules win', () => {
    // Vite inlines the @import; the JS import of the same module loads once.
    // The later copy decides, in dev and in the build.
    const twice: Record<string, string> = {
      'm/main.tsx':
        "import './a.css';\nimport './b.css';\nimport './entry.css';\nimport './a.css';",
      'm/a.css': '.a {}',
      'm/b.css': '.b {}',
      'm/entry.css': "@import './a.css';\n.e {}",
    };
    expect(cssLoadOrder('m/main.tsx', (p) => twice[p] ?? null, {})).toEqual([
      'm/b.css',
      'm/a.css',
      'm/entry.css',
    ]);
  });

  it("puts the shared v2 chrome first in both apps' real load order", () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const readReal = (p: string) => {
      const abs = join(repo, p);
      return existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, 'utf8') : null;
    };
    for (const host of Object.values(HOSTS)) {
      expect(cssLoadOrder(host.entry, readReal, ALIASES)[0]).toBe(
        'packages/shared/styles/v2-chrome.css'
      );
    }
  });

  it('lists the stylesheets in the order the browser applies them', () => {
    // Imports run depth first in statement order; a module runs once; a CSS
    // @import comes before the file that imports it. Type-only imports,
    // comments and bare packages load nothing.
    expect(cssLoadOrder('app/main.tsx', read, aliases)).toEqual([
      'app/index.css',
      'app/pages/a.css',
      'pkg/src/shared.css',
      'pkg/src/own.css',
      'pkg/src/styles.css',
      'app/re/re.css',
    ]);
  });
});

const ENV = { none: new Map([['--rba-x', '#0046ad']]) };
const run = (before: string[], after: string[], roots = ['.a']) =>
  compareCascades({ before, after, roots, envsBefore: ENV, envsAfter: ENV }).map(
    (f) => `${f.kind} ${f.selector} ${f.prop}`
  );

describe('compareCascades', () => {
  it('relates a shorthand to its longhands: a padding moved past a padding-bottom is an order change', () => {
    expect(
      run(
        ['.a .c { padding: 1px; } .a .c.d { margin: 0; } .a .e { padding-bottom: 2px; }'],
        ['.a .e { padding-bottom: 2px; }', '.a .c { padding: 1px; }'],
        ['.a']
      ).filter((f) => f.startsWith('order'))
    ).toEqual(['order .a .c padding']);
  });

  it('does not relate two different longhands of one family, which never overlap', () => {
    expect(
      run(
        ['.a .c { font-family: x; } .a .e { font-size: 2px; }'],
        ['.a .e { font-size: 2px; }', '.a .c { font-family: x; }']
      )
    ).toEqual([]);
  });

  it('relates border-left to border-color: both set border-left-color', () => {
    expect(
      run(
        ['.a .c { border-left: 1px solid red; } .a .e { border-color: blue; }'],
        ['.a .e { border-color: blue; }', '.a .c { border-left: 1px solid red; }']
      )
    ).toEqual(['order .a .c border-left']);
  });

  it('relates the shorthands whose longhands do not share their name', () => {
    expect(overlaps('font', 'line-height')).toBe(true);
    expect(overlaps('place-items', 'align-items')).toBe(true);
    expect(overlaps('place-items', 'align-self')).toBe(false);
    expect(overlaps('flex-flow', 'flex-wrap')).toBe(true);
    expect(overlaps('grid-area', 'grid-row')).toBe(true);
    expect(overlaps('columns', 'column-count')).toBe(true);
    expect(overlaps('inset-inline', 'left')).toBe(true);
    expect(overlaps('inset-block', 'left')).toBe(false);
    expect(overlaps('gap', 'column-gap')).toBe(true);
    expect(overlaps('border', 'border-image-source')).toBe(true);
    expect(overlaps('font-family', 'line-height')).toBe(false);
  });

  it('compares every selector when no roots are given', () => {
    expect(
      compareCascades({
        before: ['.x { color: red; }'],
        after: ['.x { color: blue; }'],
        envsBefore: ENV,
        envsAfter: ENV,
      }).map((f) => `${f.kind} ${f.selector} ${f.prop}`)
    ).toEqual(['changed .x color']);
  });

  it('passes a rule moved unchanged from the host file to a shared file before it', () => {
    expect(
      run(
        ['.a .t { color: red; height: 56px; }'],
        ['.a .t, .b .t { color: red; }', '.a .t { height: 56px; }']
      )
    ).toEqual([]);
  });

  it('reports a moved declaration whose value changed', () => {
    expect(run(['.a .t { height: 56px; }'], ['.a .t { height: 57px; }', ''])).toEqual([
      'changed .a .t height',
    ]);
  });

  it('reports a declaration that was dropped', () => {
    expect(run(['.a .t { color: red; height: 56px; }'], ['', '.a .t { color: red; }'])).toEqual([
      'removed .a .t height',
    ]);
  });

  it('reports two selectors competing for a property whose order the move swapped', () => {
    expect(
      run(
        ['.a .btn { padding: 1px; } .a .sm { padding: 2px; }'],
        ['.a .sm { padding: 2px; }', '.a .btn { padding: 1px; }']
      )
    ).toEqual(['order .a .btn padding']);
  });

  it("ignores the other host's selectors in a shared file", () => {
    expect(
      run(['.a .t { color: red; }'], ['.a .t, .b .t { color: red; } .b .u { margin: 0; }', ''])
    ).toEqual([]);
  });

  it('keeps the at-rule chain: a declaration moved out of @media is removed and added', () => {
    expect(
      run(['@media (max-width: 1px) { .a .t { color: red; } }'], ['.a .t { color: red; }', ''])
    ).toEqual(['removed @media (max-width: 1px) > .a .t color', 'added .a .t color']);
  });

  it('passes an alias replaced by the token it resolves to', () => {
    const envs = {
      none: new Map([
        ['--rba-x', '#0046ad'],
        ['--al', 'var(--rba-x)'],
      ]),
    };
    expect(
      compareCascades({
        before: ['.a .t { color: var(--al); }'],
        after: ['.a .t { color: var(--rba-x); }', ''],
        roots: ['.a'],
        envsBefore: envs,
        envsAfter: envs,
      })
    ).toEqual([]);
  });

  it('ignores a swap between selectors of different specificity: order does not decide there', () => {
    expect(
      run(
        ['.a .btn { padding: 1px; } .a .btn.sm { padding: 2px; }'],
        ['.a .btn.sm { padding: 2px; }', '.a .btn { padding: 1px; }']
      )
    ).toEqual([]);
  });

  it('counts the argument of :not() and :has() towards specificity, and :where() as nothing', () => {
    expect(
      run(
        ['.a .b:not(.c) { margin: 0; } .a .b.d { margin: 1px; }'],
        ['.a .b.d { margin: 1px; }', '.a .b:not(.c) { margin: 0; }']
      )
    ).toEqual(['order .a .b:not(.c) margin']);
    expect(
      run(
        ['.a .b:where(.c) { margin: 0; } .a .b.d { margin: 1px; }'],
        ['.a .b.d { margin: 1px; }', '.a .b:where(.c) { margin: 0; }']
      )
    ).toEqual([]);
  });

  describe('with the class oracle from the components', () => {
    const swapped = {
      before: ['.a .btn { padding: 1px; } .a .sm { padding: 2px; }'],
      after: ['.a .sm { padding: 2px; }', '.a .btn { padding: 1px; }'],
      roots: ['.a'],
      envsBefore: ENV,
      envsAfter: ENV,
    };
    const kinds = (competes: (x: string, y: string) => boolean) =>
      compareCascades({ ...swapped, competes }).map((f) => f.kind);

    it('reports the swap when the two classes share an element', () => {
      const competes = classOracle([
        '<div className="a" />',
        '<button className={`btn ${small ? "sm" : ""}`} />',
      ]);
      expect(kinds(competes)).toEqual(['order']);
    });

    it('ignores the swap when no element carries both classes', () => {
      const competes = classOracle(['<button className="btn" />', '<i className="sm" />']);
      expect(kinds(competes)).toEqual([]);
    });

    it('treats a class built at run time as competing, to be safe', () => {
      const competes = classOracle([
        '<div className="a" />',
        '<button className="btn" />',
        '<i className={`btn-${size}`} />',
      ]);
      expect(competes('.a .btn-sm', '.a .btn')).toBe(true);
    });

    it('never lets a pseudo-element compete with its element', () => {
      const competes = classOracle(['<div className="a" />', '<b className="btn sm" />']);
      expect(competes('.a .btn::before', '.a .sm')).toBe(false);
      expect(competes('.a .btn::before', '.a .sm::before')).toBe(true);
    });

    it('treats an element-type-only compound as competing with a class a component renders', () => {
      const competes = classOracle(['<div className="a x" />', '<Btn className="btn" />']);
      expect(competes('.a .x ul', '.a .btn')).toBe(true);
    });

    it('reads class names from string literals only, not from variable names', () => {
      const competes = classOracle(['<b className={sm ? "btn" : ""} />', '<i className="sm" />']);
      expect(competes('.a .btn', '.a .sm')).toBe(false);
    });

    it('lets the known classes decide when a compound also has an unknown one', () => {
      const competes = classOracle(['<b className="x" />', '<i className="y" />']);
      expect(competes('.a .x.dyn', '.a .y')).toBe(false);
    });

    it('matches an element-type-only compound against the elements that carry the other classes', () => {
      const competes = classOracle([
        '<div className="a q" />',
        '<span className="label" />',
        '<Item className="mode" />',
      ]);
      expect(competes('.a .q a', '.a .label')).toBe(false);
      expect(competes('.a .q span', '.a .label')).toBe(true);
      // A component renders an element we cannot see: it may be anything.
      expect(competes('.a .q a', '.a .mode')).toBe(true);
    });

    it('lets a class that no component names, not even through a template, compete with nothing', () => {
      const competes = classOracle([
        '<div className="a" />',
        '<b className="btn" />',
        '<i className={`fill-${n}`} />',
      ]);
      expect(competes('.a .gone', '.a .btn')).toBe(false);
      // fill-2 is built at run time from `fill-${n}`: it may be anything.
      expect(competes('.a .fill-2', '.a .btn')).toBe(true);
    });

    it("ignores rules for classes the app never renders: another app's selectors in a shared file", () => {
      const competes = classOracle(['<div className="a"><b className="t" /></div>']);
      expect(
        compareCascades({
          before: ['.a .t { color: red; }'],
          after: ['.a .t, .other .t { color: red; }', ''],
          envsBefore: ENV,
          envsAfter: ENV,
          competes,
        })
      ).toEqual([]);
    });

    it('does not take a class named only in a comment as rendered, but does one held in a variable', () => {
      const competes = classOracle([
        '// styles .gone in a comment\n/* and .gone again */\nconst cls = "kept";\n<b className="btn" />',
      ]);
      expect(competes.renders('.gone .btn')).toBe(false);
      expect(competes.renders('.kept .btn')).toBe(true);
    });

    it('counts a class written right before a ${} as one the element carries', () => {
      const competes = classOracle([
        '<div className="a" />',
        '<i className={`btn${small ? " sm" : ""}`} />',
        '<b className="x" />',
      ]);
      expect(competes('.a .btn', '.a .x')).toBe(false);
      expect(competes('.a .btn', '.a .sm')).toBe(true);
    });

    it('never lets selectors under page roots that are never nested compete', () => {
      const sources = ['<div className="a b btn" />'];
      expect(classOracle(sources)('.a .btn', '.b .btn')).toBe(true);
      expect(classOracle(sources, { exclusive: [['.a'], ['.b']] })('.a .btn', '.b .btn')).toBe(
        false
      );
      expect(classOracle(sources, { exclusive: [['.a', '.b']] })('.a .btn', '.b .btn')).toBe(true);
    });

    it('never lets two different element types compete', () => {
      const competes = classOracle(['<div className="a x y" />']);
      expect(competes('.a .x ul', '.a .y li')).toBe(false);
      expect(competes('.a .x ul', '.a .y ul')).toBe(true);
    });
  });

  it('matches a root used on its own and as a prefix only on a class boundary', () => {
    expect(run(['.a { color: red; } .ab { color: blue; }'], ['.a { color: red; }', ''])).toEqual(
      []
    );
  });
});
