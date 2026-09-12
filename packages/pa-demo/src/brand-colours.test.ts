import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

/**
 * The five RONL brand colours exist as literals in four files, and nothing
 * keeps them in step.
 *
 *   packages/frontend/src/index.css     :root { --color-primary: #01689b; … }
 *   packages/pa-demo/src/index.css      the same block, byte-identical today
 *   packages/frontend/tailwind.config.js   var(--color-primary, #01689b)
 *   packages/pa-demo/tailwind.config.js    the same
 *
 * The copies are deliberate: pa-demo/src/index.css:1-16 records that this
 * app-shell CSS stays per-app on purpose and that @ronl/pa-cockpit leaves it
 * out of styles.css. So the fix is not to merge them — it is to make an
 * edit-one-and-forget-the-others impossible to ship.
 *
 * This lives in packages/pa-demo because pa-demo is the workspace that
 * documents itself as owning a copy. Reading a sibling workspace's source is a
 * dev-time filesystem read, not a package dependency: no @ronl/frontend entry
 * exists and nothing reaches the bundle. The path is resolved upward to the
 * repo root because module resolution would not find it — which is the point.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** `--color-primary: #01689b;` in a CSS :root block. */
const CSS_DECL = /--(color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;

/** `var(--color-primary, #01689b)` in a Tailwind colour value. */
const TW_FALLBACK = /var\(\s*--(color-[a-z-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;

const SOURCES = [
  { file: 'packages/frontend/src/index.css', pattern: CSS_DECL },
  { file: 'packages/pa-demo/src/index.css', pattern: CSS_DECL },
  { file: 'packages/frontend/tailwind.config.js', pattern: TW_FALLBACK },
  { file: 'packages/pa-demo/tailwind.config.js', pattern: TW_FALLBACK },
] as const;

const BRAND_TOKENS = [
  'color-primary',
  'color-primary-dark',
  'color-primary-light',
  'color-secondary',
  'color-accent',
] as const;

/**
 * Strip `/* ... *\/` and `// ...` comments before matching.
 *
 * All four SOURCES files narrate themselves in prose — pa-demo/src/index.css
 * carries a 16-line doc comment about these very tokens, and tailwind.config.js
 * has both comment styles. A comment naming a token in the same syntax as a
 * real declaration is not a definition of it, the same reasoning
 * pa-cockpit-class-coverage.test.ts's definesClass() already applies to
 * dashboard-pa.css and dashboard-v2.css.
 *
 * The two tests below need this in different amounts, not the same amount:
 *
 *  - The conflict test (below) is safe either way. A comment that mismatches
 *    the real value is a false *positive* — it fails loudly, on a run where
 *    nothing is actually broken, and gets fixed the first time someone looks.
 *  - The anti-vacuity test inherits the dangerous direction. Delete a file's
 *    real `:root` block but leave a doc comment spelling
 *    `--color-primary: #01689b;` in colon-semicolon form, and an unstripped
 *    match still "finds" every token — the guard goes green on the very
 *    defect it exists to catch, with nothing left to notice. Comments do not
 *    nest, so a non-greedy global replace is exact, not an approximation.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Every (token, value) pair one file declares. Values lower-cased: #FFF and #fff are one colour. */
function pairsIn(relPath: string, pattern: RegExp): Array<[string, string]> {
  const full = join(REPO_ROOT, relPath);
  let text: string;
  try {
    text = readFileSync(full, 'utf-8');
  } catch {
    // Fail rather than skip. A guard that silently stops reading a file it was
    // written to watch is worse than no guard: it reports green forever.
    throw new Error(
      `brand-colours guard: cannot read ${relPath} at ${full}. If the file moved, ` +
        `update SOURCES — do not delete the entry.`
    );
  }
  return [...stripComments(text).matchAll(new RegExp(pattern.source, 'g'))].map((m) => [
    m[1],
    m[2].toLowerCase(),
  ]);
}

describe('the five brand colours agree across every file that spells them', () => {
  it('gives each --color-* token exactly one value everywhere', () => {
    const seen = new Map<string, { value: string; file: string }>();
    const conflicts: string[] = [];

    for (const { file, pattern } of SOURCES) {
      for (const [token, value] of pairsIn(file, pattern)) {
        const prior = seen.get(token);
        if (!prior) {
          seen.set(token, { value, file });
        } else if (prior.value !== value) {
          conflicts.push(`--${token}: ${prior.value} in ${prior.file}, but ${value} in ${file}`);
        }
      }
    }

    expect(conflicts, conflicts.join('\n')).toEqual([]);
  });

  it('actually finds all five tokens in all four files', () => {
    // Without this, a rename or a broken pattern makes the assertion above
    // vacuously green: it reads nothing, finds no conflict, and passes.
    const missing: string[] = [];
    for (const { file, pattern } of SOURCES) {
      const found = new Set(pairsIn(file, pattern).map(([token]) => token));
      for (const token of BRAND_TOKENS) {
        if (!found.has(token)) missing.push(`${file} does not declare --${token}`);
      }
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('does not count a token named only inside a comment as declared', () => {
    // Pins the strip in pairsIn(). This is the anti-vacuity test's own
    // exposure: a comment spelling `--color-primary: #01689b;` in the same
    // syntax as a real declaration, with no `:root` block anywhere in the
    // file, must still come back empty — not "found". Without the
    // `stripComments()` call in pairsIn(), this fixture would report the
    // token present, which is exactly how a deleted real declaration could
    // hide behind a doc comment and leave the guard green.
    const tmpDir = mkdtempSync(join(tmpdir(), 'brand-colours-'));
    const tmpCss = join(tmpDir, 'fixture.css');
    writeFileSync(
      tmpCss,
      '/*\n' +
        ' * Historical reference only, no :root block here:\n' +
        ' *   --color-primary: #01689b;\n' +
        ' */\n'
    );
    // pairsIn() re-joins its argument onto REPO_ROOT, so it needs a path
    // relative to that root, not the absolute tmpCss.
    expect(pairsIn(relative(REPO_ROOT, tmpCss), CSS_DECL)).toEqual([]);
  });
});
