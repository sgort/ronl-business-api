import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Colours written inline in TS/TSX (#374, step 1): neutral and status colours
 * come from the shared tokens, so the Flevoland tenant gets its own; only data
 * colours (chart series, lanes, categories) stay as hex, and they are listed
 * here by file.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Files that are data, not styling: every colour in them is a series or category. */
const DATA_FILES = [
  'packages/frontend/src/pages/changelog-data.ts',
  'packages/frontend/src/pages/woo/woo.data.ts',
  'packages/frontend/src/pages/infra-board/rip-phases.catalog.ts',
  'packages/pa-cockpit/src/pages/public-affairs-v2/feiten.data.ts',
];

/** Data colours inside styling files, per file. */
const DATA_COLOURS: Record<string, string[]> = {
  'packages/frontend/src/components/process/laneSteps.ts': [
    '#7a5af0',
    '#0046ad',
    '#6b7280',
    '#64707f',
  ],
  'packages/frontend/src/components/process/status.ts': ['#7a5af0'],
  'packages/frontend/src/pages/infra-board/rail-stats.ts': ['#7a5af0'],
  'packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.tsx': [
    '#0046ad',
    '#5b93d6',
    '#e5b700',
    '#f2d472',
  ],
  'packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.tsx': [
    '#f4569f',
    '#a06ff0',
    '#e08a1e',
  ],
};

function sources(): string[] {
  return execFileSync('git', ['ls-files', 'packages/frontend/src', 'packages/pa-cockpit/src'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.') && !DATA_FILES.includes(f));
}

/** Hex colours outside a var() fallback (a fallback never applies: the tokens are always defined). */
function bareHex(text: string): string[] {
  // A line comment starts at // that is not part of a URL (https://).
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const noFallbacks = noComments.replace(
    /var\(--[\w-]+,\s*(var\(--[\w-]+,\s*)?#[0-9a-fA-F]{3,8}\)+/g,
    ''
  );
  return (
    [
      ...noFallbacks.matchAll(
        /['"`(\s,:[]#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g
      ),
    ]
      .map((m) => `#${m[1].toLowerCase()}`)
      // all-digit 3- and 4-character forms are issue numbers (#374), not colours
      .filter((hex) => hex.length > 5 || /[a-f]/.test(hex))
  );
}

describe('bareHex', () => {
  it('finds hex in Tailwind arbitrary values, 4-digit hex and after a URL on the line', () => {
    expect(bareHex("className='bg-[#ff0000]'")).toEqual(['#ff0000']);
    expect(bareHex("color: '#f00a'")).toEqual(['#f00a']);
    expect(bareHex("const u = 'https://x.nl'; const c = '#123abc';")).toEqual(['#123abc']);
  });

  it('skips var() fallbacks, comments and issue numbers', () => {
    expect(bareHex("color: 'var(--rba-ink, #1f2937)'")).toEqual([]);
    expect(bareHex('// see #374 and #fff')).toEqual([]);
    expect(bareHex("title: 'issue #374'")).toEqual([]);
  });
});

describe('inline colours', () => {
  const files = sources();

  it('only listed data colours are written as hex', () => {
    const found = files.flatMap((file) => {
      const allowed = DATA_COLOURS[file] ?? [];
      return bareHex(readFileSync(join(REPO, file), 'utf8'))
        .filter((hex) => !allowed.includes(hex))
        .map((hex) => `${file}: ${hex}`);
    });
    expect(found).toEqual([]);
  });

  it('every listed data colour is still used', () => {
    const stale = Object.entries(DATA_COLOURS).flatMap(([file, hexes]) => {
      const used = new Set(bareHex(readFileSync(join(REPO, file), 'utf8')));
      return hexes.filter((hex) => !used.has(hex)).map((hex) => `${file}: ${hex}`);
    });
    expect(stale).toEqual([]);
  });

  // For Flevoland the warning marker colour is brown; a filled area with text
  // on it takes --rba-warn-fill (yellow) and --rba-on-warn-fill.
  it('an inline warning fill uses the fill token, not the marker colour', () => {
    const found = files.flatMap((file) =>
      readFileSync(join(REPO, file), 'utf8')
        .split('\n')
        .filter((line) =>
          /background[\w]*:.*var\(--(v2-amber|pb-amber|w-amber|rba-warn)\)/.test(line)
        )
        .map((line) => `${file}: ${line.trim()}`)
    );
    expect(found).toEqual([]);
  });
});
