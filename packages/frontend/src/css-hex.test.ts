import { describe, expect, it } from 'vitest';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';

/**
 * No new hex colours in our stylesheets (#374, item 3d). Since step 1 of the
 * Flevoland colours every neutral, brand and status colour comes from the
 * shared tokens; what is left as hex is a data or category colour, listed
 * here per file with its reason.
 *
 * Runs stylelint's own color-no-hex rule with the repository's config, so the
 * files it exempts (HEX_ALLOWED: the token files, the Keycloak theme,
 * public-site, the app shells' --color-* defaults) stay exempt. The config
 * itself stays report-only; this test is the gate. A new hex anywhere fails,
 * and so does a listed colour that is no longer used, so the list cannot go
 * stale.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const STYLESHEETS = [
  'packages/frontend/src/**/*.css',
  'packages/pa-cockpit/src/**/*.css',
  'packages/pa-demo/src/**/*.css',
  'packages/shared/styles/**/*.css',
];

/** The hex colours allowed to stay, per file: data and category colours only. */
const DATA_COLOURS: Record<string, Record<string, string>> = {
  'packages/frontend/src/pages/caseworker-v2/regelsimulatie.css': {
    '#7c3aed': '--sim-hold: the objection-hold segment, distinct from chrome and accent',
    '#9166f0': 'the light stripe of that hold segment',
  },
  'packages/frontend/src/pages/woo/dashboard-woo.css': {
    '#1f7a8c': '--w-teal: a requester category in the Woo charts',
  },
  'packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css': {
    '#ede9fe': 'media tag: category colour',
    '#5b21b6': 'media tag and the "teksten" sub-source: category colour',
    '#d6cdf7': 'media tag border: category colour',
    '#eeeefa': 'EU source badge: category colour',
    '#3b3a8f': 'EU source badge and raw EU source: category colour',
    '#c5c4e8': 'EU source badge border: category colour',
    '#f0e6ff': 'AI status badge: marks AI-generated content',
    '#6a0dad': 'AI status badge text',
    '#c080ff60': 'AI status badge border',
    '#f5f0ff': 'AI interpretation block: marks AI-generated content',
    '#9060e0': 'AI interpretation block rule',
    '#f4f0fb': '"teksten" sub-source: category colour',
    '#ded2f4': '"teksten" sub-source border',
    '#5b4b8a': 'OB (Officiële Bekendmakingen) source chip: category colour',
    '#f1eefb': 'OB source chip background',
    '#d9cff2': 'OB source chip border',
    '#7ee2a0': 'success tick on the dark toast; status tokens are for light backgrounds',
  },
};

async function hexByFile(): Promise<Record<string, string[]>> {
  const { results } = await stylelint.lint({
    files: STYLESHEETS,
    cwd: REPO,
    configFile: join(REPO, 'stylelint.config.mjs'),
  });
  const out: Record<string, string[]> = {};
  for (const r of results) {
    const hexes = r.warnings
      .filter((w) => w.rule === 'color-no-hex')
      .map((w) => (/"(#[0-9a-fA-F]+)"/.exec(w.text)?.[1] ?? w.text).toLowerCase());
    if (hexes.length)
      out[
        relative(REPO, r.source ?? '')
          .split('\\')
          .join('/')
      ] = hexes;
  }
  return out;
}

describe('hex colours in stylesheets', () => {
  it('only the listed data colours are written as hex', async () => {
    const found = await hexByFile();
    const unexpected = Object.entries(found).flatMap(([file, hexes]) =>
      hexes.filter((hex) => !(hex in (DATA_COLOURS[file] ?? {}))).map((hex) => `${file}: ${hex}`)
    );
    expect(unexpected).toEqual([]);
  }, 60_000);

  it('every listed data colour is still used', async () => {
    const found = await hexByFile();
    const stale = Object.entries(DATA_COLOURS).flatMap(([file, colours]) =>
      Object.keys(colours)
        .filter((hex) => !(found[file] ?? []).includes(hex))
        .map((hex) => `${file}: ${hex}`)
    );
    expect(stale).toEqual([]);
  }, 60_000);
});
