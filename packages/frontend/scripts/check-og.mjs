#!/usr/bin/env node
/**
 * check-og.mjs <mode> — the link-preview tags in a BUILT dist/index.html.
 *
 * Run by the ACC and PROD deploy workflows right after `vite build`, before
 * the upload. The unit test (src/indexHtml.test.ts) proves the template and
 * the .env files agree; this proves the file that is actually shipped is the
 * one for its environment. An ACC build carrying the production card (or a
 * placeholder Vite left unfilled) fails the deploy instead of reaching every
 * Teams and LinkedIn preview, where unfurlers then cache it for days.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const EXPECTED = {
  production: {
    url: 'https://mijn.open-regels.nl/',
    image: 'https://mijn.open-regels.nl/og-image-prod.png',
    robots: 'index, follow',
    title: 'Vier borden voor het werk van de provincie',
  },
  acceptance: {
    url: 'https://acc.mijn.open-regels.nl/',
    image: 'https://acc.mijn.open-regels.nl/og-image-acc.png',
    robots: 'noindex, nofollow',
    title: '[ACC] Vier borden voor het werk van de provincie',
  },
};

const mode = process.argv[2];
const want = EXPECTED[mode];
if (!want) {
  console.error(`usage: check-og.mjs <${Object.keys(EXPECTED).join('|')}>`);
  process.exit(2);
}

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf-8');
const meta = (attr, key) =>
  // `attr` and `key` are never user input: every call site below passes
  // literals ('property'/'name', 'og:url', 'robots', ...), `.` and `:` in the
  // key are escaped, and the only text matched is our own built index.html.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html)?.[1];

const problems = [];
const check = (label, got, expected) => {
  if (got !== expected) problems.push(`${label}: expected "${expected}", got "${got ?? '(missing)'}"`);
};
if (/%VITE_/.test(html)) problems.push('an unfilled %VITE_…% placeholder is left in dist/index.html');
check('og:url', meta('property', 'og:url'), want.url);
check('og:image', meta('property', 'og:image'), want.image);
check('og:title', meta('property', 'og:title'), want.title);
check('robots', meta('name', 'robots'), want.robots);
const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
check('canonical', canonical, want.url);
const image = want.image.slice(want.image.lastIndexOf('/') + 1);
if (!existsSync(resolve(dist, image))) problems.push(`${image} is missing from dist/`);

if (problems.length > 0) {
  console.error(`check-og: dist/index.html is not the ${mode} build's:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`check-og: ${mode} link preview OK (${want.image}, robots "${want.robots}")`);
