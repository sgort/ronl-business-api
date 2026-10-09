#!/usr/bin/env node
/**
 * check-og.mjs <mode> — the link-preview tags in a BUILT dist/index.html and in
 * every tenant page (dist/<id>/index.html) the build wrote next to it.
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
  if (got !== expected)
    problems.push(`${label}: expected "${expected}", got "${got ?? '(missing)'}"`);
};
if (/%VITE_/.test(html))
  problems.push('an unfilled %VITE_…% placeholder is left in dist/index.html');
check('og:url', meta('property', 'og:url'), want.url);
check('og:image', meta('property', 'og:image'), want.image);
check('og:title', meta('property', 'og:title'), want.title);
check('robots', meta('name', 'robots'), want.robots);
const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
check('canonical', canonical, want.url);
const image = want.image.slice(want.image.lastIndexOf('/') + 1);
if (!existsSync(resolve(dist, image))) problems.push(`${image} is missing from dist/`);

// ── Tenant pages (vite-plugin-tenant-pages.ts) ───────────────────────────────
// Every enabled single-board tenant with share copy must have its own page,
// with this environment's URL, card and title prefix, and a route in the
// shipped staticwebapp.config.json; otherwise its links preview as Flevoland.
const site = want.url.replace(/\/$/, '');
const cardEnv = mode === 'production' ? 'prod' : 'acc';
const prefix = want.title.slice(0, want.title.indexOf('Vier borden'));
const { tenants } = JSON.parse(readFileSync(resolve(dist, 'tenants.json'), 'utf-8'));
const swa = JSON.parse(readFileSync(resolve(dist, 'staticwebapp.config.json'), 'utf-8'));
const pages = Object.values(tenants).filter((t) => t.enabled && t.boards?.length === 1 && t.share);
if (pages.length === 0)
  problems.push('no tenant pages: tenants.json lists no single-board tenant with share copy');
for (const tenant of pages) {
  const file = resolve(dist, tenant.id, 'index.html');
  if (!existsSync(file)) {
    problems.push(`${tenant.id}/index.html is missing from dist/`);
    continue;
  }
  const page = readFileSync(file, 'utf-8');
  const tag = (attr, key) =>
    // Same literals-only call sites as meta() above, run on our own built file.
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(page)?.[1];
  const url = `${site}/${tenant.id}`;
  const card = `og-image-${tenant.id}-${cardEnv}.png`;
  check(`${tenant.id} og:url`, tag('property', 'og:url'), url);
  check(`${tenant.id} og:image`, tag('property', 'og:image'), `${site}/${card}`);
  check(`${tenant.id} robots`, tag('name', 'robots'), want.robots);
  check(`${tenant.id} canonical`, /<link rel="canonical" href="([^"]*)"/.exec(page)?.[1], url);
  if (!tag('property', 'og:title')?.startsWith(prefix)) {
    problems.push(`${tenant.id} og:title lacks the "${prefix}" prefix`);
  }
  if (!existsSync(resolve(dist, card))) problems.push(`${card} is missing from dist/`);
  if (
    !swa.routes?.some(
      (r) => r.route === `/${tenant.id}` && r.rewrite === `/${tenant.id}/index.html`
    )
  ) {
    problems.push(`staticwebapp.config.json has no rewrite for /${tenant.id}`);
  }
}

// Static Web Apps ignores a trailing slash when it compares routes and
// refuses the whole config on a duplicate, which fails the upload after this
// check has passed (run 37620361964: "duplicate route /amsterdam/").
const routeKeys = (swa.routes ?? []).map((r) => r.route.replace(/\/+$/, '') || '/');
const duplicates = routeKeys.filter((key, i) => routeKeys.indexOf(key) !== i);
for (const key of new Set(duplicates)) {
  problems.push(
    `staticwebapp.config.json has a duplicate route ${key} (a trailing slash does not count)`
  );
}

if (problems.length > 0) {
  console.error(
    `check-og: the ${mode} build's link previews are wrong:\n  - ${problems.join('\n  - ')}`
  );
  process.exit(1);
}
console.log(
  `check-og: ${mode} link preview OK (${want.image}, robots "${want.robots}"; tenant pages: ${pages.map((t) => t.id).join(', ')})`
);
