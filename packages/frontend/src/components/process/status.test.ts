import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- plain ESM script outside the workspace, no types
import { resolveValue } from '../../../../../scripts/css-colour/colour.mjs';
// @ts-expect-error -- plain ESM script outside the workspace, no types
import { collectEnv } from '../../../../../scripts/css-colour/check-equivalence.mjs';
import { STATUS, type StatusKey } from './status';

/**
 * Status colours come from the shared tokens (#374, step 1), so the Flevoland
 * tenant gets its own status colours while every other tenant keeps today's.
 */
const require_ = createRequire(import.meta.url);
const STYLES = join(dirname(require_.resolve('@ronl/shared/package.json')), 'styles');
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULTS: Record<Exclude<StatusKey, 'wachtend'>, string> = {
  done: '#3fa535',
  active: '#0046ad',
  risk: '#e5b700',
  overdue: '#b0103c',
  action: '#e70077',
  todo: '#c2c7d0',
};

type Rgba = { r: number; g: number; b: number };

function toHex({ r, g, b }: Rgba): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

describe('STATUS colours', () => {
  const env = collectEnv(
    [
      readFileSync(join(STYLES, 'flevoland', 'tokens.css'), 'utf8'),
      readFileSync(join(STYLES, 'tokens.css'), 'utf8'),
    ],
    null
  );

  it('come from the tokens and keep their default values', () => {
    for (const [key, hex] of Object.entries(DEFAULTS)) {
      const color = STATUS[key as StatusKey].color;
      expect(color, key).toMatch(/^var\(--rba-[\w-]+\)$/);
      const resolved = resolveValue(color, env) as { colours: Rgba[] } | null;
      expect(resolved && toHex(resolved.colours[0]), key).toBe(hex);
    }
  });

  it('keep wachtend as a data colour', () => {
    expect(STATUS.wachtend.color).toBe('#7a5af0');
  });

  it('are used only in style props, where var() works', () => {
    const consumers = [
      'components/InfraBoardDashboard/MijnDag.tsx',
      'components/InfraBoardDashboard/Portfolio.tsx',
      'components/process/PhaseSwimlane.tsx',
      'components/process/ProcessView.tsx',
    ];
    for (const file of consumers) {
      const text = readFileSync(join(SRC, file), 'utf8');
      // `s` is the STATUS entry in these files; `p.color` (a phase) is a data colour.
      expect(text, file).not.toMatch(/\b(fill|stroke)=\{(s|STATUS\[[^\]]+\])\.color\}/);
      expect(text, file).not.toMatch(/\.color\s*\+|`[^`]*\$\{[^}]*\.color\}[0-9a-f]/i);
    }
  });
});
