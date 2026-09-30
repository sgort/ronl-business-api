#!/usr/bin/env node
/**
 * check-og.mjs <mode> — the link-preview and robots tags in a BUILT dist/.
 *
 * Run by the ACC and PROD deploy workflows right after `npm run build:<env>`
 * (vite build + prerender), before the upload. The unit tests
 * (src/indexHtml.test.ts, scripts/prerender.test.ts) prove the template, the
 * .env files and the prerender agree; this proves the files actually shipped
 * are the ones for their environment. An ACC build carrying the production
 * card, or letting crawlers in, fails the deploy instead of reaching every
 * Teams and LinkedIn preview (where unfurlers cache it for days) or a search
 * index (where ACC would sit as a duplicate of the real site).
 *
 * Every prerendered page is a copy of the shell, so each one is checked, not
 * just the home page.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const EXPECTED = {
  production: {
    origin: 'https://publiek.open-regels.nl',
    robots: 'index, follow',
    title: 'Waar komt deze regel vandaan?',
    robotsTxt: `User-agent: *\nAllow: /\nDisallow: /zoeken\n\nSitemap: https://publiek.open-regels.nl/sitemap.xml\n`,
  },
  acceptance: {
    origin: 'https://acc.publiek.open-regels.nl',
    robots: 'noindex, nofollow',
    title: '[ACC] Waar komt deze regel vandaan?',
    robotsTxt: 'User-agent: *\nDisallow: /\n',
  },
};
const IMAGE = 'og-open-regels.png';

const mode = process.argv[2];
const want = EXPECTED[mode];
if (!want) {
  console.error(`usage: check-og.mjs <${Object.keys(EXPECTED).join('|')}>`);
  process.exit(2);
}

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const pages = (function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    // `dir` starts at this package's dist/ and `e.name` comes from
    // readdirSync of that tree, not from user input: the walk only ever
    // visits what `vite build` and the prerender wrote.
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    e.isDirectory() ? walk(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []
  );
})(dist);

const problems = [];
const meta = (html, attr, key) =>
  // `attr` and `key` are never user input: every call site below passes
  // literals ('property'/'name', 'og:url', 'robots', ...), `.` and `:` in the
  // key are escaped, and the only text matched is our own built pages.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html)?.[1];

for (const file of pages) {
  const html = readFileSync(file, 'utf-8');
  const page = relative(dist, file).replace(/\\/g, '/');
  const check = (label, got, expected) => {
    if (got !== expected)
      problems.push(`${page} ${label}: expected "${expected}", got "${got ?? '(missing)'}"`);
  };
  if (/%VITE_/.test(html)) problems.push(`${page}: an unfilled %VITE_…% placeholder is left`);
  check('og:url', meta(html, 'property', 'og:url'), `${want.origin}/`);
  check('og:image', meta(html, 'property', 'og:image'), `${want.origin}/${IMAGE}`);
  check('og:title', meta(html, 'property', 'og:title'), want.title);
  check('robots', meta(html, 'name', 'robots'), want.robots);
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  if (canonicals.length !== 1) problems.push(`${page}: ${canonicals.length} canonical links, expected 1`);
  else if (!canonicals[0].startsWith(`${want.origin}/`))
    problems.push(`${page} canonical: "${canonicals[0]}" is not on ${want.origin}`);
}
if (pages.length === 0) problems.push('no index.html found in dist/');

const home = resolve(dist, 'index.html');
if (existsSync(home)) {
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(readFileSync(home, 'utf-8'))?.[1];
  if (canonical !== `${want.origin}/`)
    problems.push(`index.html canonical: expected "${want.origin}/", got "${canonical}"`);
}
if (!existsSync(resolve(dist, IMAGE))) problems.push(`${IMAGE} is missing from dist/`);
const robotsTxt = existsSync(resolve(dist, 'robots.txt'))
  ? readFileSync(resolve(dist, 'robots.txt'), 'utf-8')
  : undefined;
if (robotsTxt !== want.robotsTxt)
  problems.push(`robots.txt: expected ${JSON.stringify(want.robotsTxt)}, got ${JSON.stringify(robotsTxt)}`);

if (problems.length > 0) {
  const shown = problems.slice(0, 20);
  const more = problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : '';
  console.error(`check-og: dist/ is not the ${mode} build's:\n  - ${shown.join('\n  - ')}${more}`);
  process.exit(1);
}
console.log(
  `check-og: ${mode} link preview OK on ${pages.length} pages (robots "${want.robots}", title "${want.title}")`
);
