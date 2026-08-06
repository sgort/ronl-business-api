// packages/public-site/scripts/prerender.ts
/**
 * Post-build step: writes a static, crawlable index.html per section and
 * detail route into dist/, plus sitemap.xml and robots.txt. Run via
 * `tsx scripts/prerender.ts --mode <development|acceptance|production>`
 * after `vite build`. See the DoD note in Task 19 of the implementation
 * plan for why this isn't full React SSR.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  getBerichten,
  getNieuws,
  getProducten,
  getRegelcatalogus,
  getProcessen,
} from '../src/lib/api';
import { PUB_SECTIONS } from '../src/lib/sections';
import { slugify } from '../src/lib/slug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

type Mode = 'development' | 'acceptance' | 'production';

const SITE_ORIGIN: Record<Mode, string> = {
  development: 'http://localhost:5175',
  acceptance: 'https://acc.publiek.open-regels.nl',
  production: 'https://publiek.open-regels.nl',
};
const ENV_FILE: Record<Mode, string> = {
  development: '.env.development',
  acceptance: '.env.acceptance',
  production: '.env.production',
};

// ── Pure helpers (unit-tested directly, see Step 1) ─────────────────────────

export function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

export function injectIntoShell(
  shell: string,
  opts: { title: string; description: string; canonical: string; bodyFragment: string }
): string {
  let html = shell.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(opts.title)}</title>`);
  html = html.replace(
    '</head>',
    `  <meta name="description" content="${escapeHtml(opts.description)}" />\n` +
      `  <link rel="canonical" href="${opts.canonical}" />\n</head>`
  );
  html = html.replace('<div id="root"></div>', `<div id="root">${opts.bodyFragment}</div>`);
  return html;
}

export function buildSitemap(origin: string, urls: string[]): string {
  const entries = urls
    .filter((u) => u !== '/zoeken' && u !== '/woordenboek')
    .map((u) => `  <url><loc>${origin}${u}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function buildRobots(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /zoeken\n\nSitemap: ${origin}/sitemap.xml\n`;
}

// ── Fragment builders (small, semantic — not the interactive React tree) ───

function factsTable(facts: [string, string][]): string {
  if (!facts.length) return '';
  const rows = facts
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

function detailFragment(
  title: string,
  summary: string,
  org: string,
  facts: [string, string][]
): string {
  return (
    `<main id="pub-main"><article>` +
    `<p>${escapeHtml(org)}</p>` +
    `<h1>${escapeHtml(title)}</h1>` +
    `<p>${escapeHtml(summary)}</p>` +
    factsTable(facts) +
    `</article></main>`
  );
}

function listFragment(
  title: string,
  sub: string,
  rows: { title: string; summary: string }[]
): string {
  const items = rows
    .map((r) => `<li><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.summary)}</p></li>`)
    .join('');
  return `<main id="pub-main"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(sub)}</p><ul>${items}</ul></main>`;
}

// ── Write one route ──────────────────────────────────────────────────────

async function writeRoute(
  shell: string,
  origin: string,
  route: string,
  opts: {
    title: string;
    description: string;
    bodyFragment: string;
  }
) {
  const html = injectIntoShell(shell, {
    title: opts.title,
    description: opts.description,
    canonical: `${origin}${route}`,
    bodyFragment: opts.bodyFragment,
  });
  const dir = route === '/' ? distDir : path.join(distDir, ...route.split('/').filter(Boolean));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html, 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const modeArgIndex = process.argv.indexOf('--mode');
  const mode = (modeArgIndex !== -1 ? process.argv[modeArgIndex + 1] : 'production') as Mode;
  const origin = SITE_ORIGIN[mode] ?? SITE_ORIGIN.production;

  const envText = await readFile(path.join(root, ENV_FILE[mode] ?? ENV_FILE.production), 'utf-8');
  const apiUrlMatch = envText.match(/^VITE_API_URL=(.*)$/m);
  if (!apiUrlMatch) throw new Error(`VITE_API_URL not found in ${ENV_FILE[mode]}`);
  process.env.PUBLIC_API_BASE_URL = apiUrlMatch[1].trim();

  const shell = await readFile(path.join(distDir, 'index.html'), 'utf-8');
  const urls: string[] = ['/', '/woordenboek', '/toegankelijkheid', '/open-data', '/zoeken'];

  // Home
  await writeRoute(shell, origin, '/', {
    title: 'Open Regels Nederland — publieke kennisbank',
    description:
      'Doorzoek de openbare regels, producten, processen en berichten van Provincie Flevoland — zonder inloggen.',
    bodyFragment: listFragment(
      'Open Regels Nederland',
      'Doorzoek de regels, producten en processen van de overheid.',
      PUB_SECTIONS.map((s) => ({ title: s.nl, summary: s.nlSub }))
    ),
  });

  // Berichten
  const { items: berichten } = await getBerichten(1000);
  await writeRoute(shell, origin, '/berichten', {
    title: 'Berichten — Open Regels Nederland',
    description: 'Officiële berichten van Provincie Flevoland.',
    bodyFragment: listFragment(
      'Berichten',
      'Officiële berichten van Provincie Flevoland.',
      berichten.map((b) => ({ title: b.subject, summary: b.preview }))
    ),
  });
  for (const b of berichten) {
    urls.push(`/berichten/${b.id}`);
    await writeRoute(shell, origin, `/berichten/${b.id}`, {
      title: `${b.subject} — Open Regels Nederland`,
      description: b.preview,
      bodyFragment: detailFragment(b.subject, b.preview, b.sender.name, [
        ['Afzender', b.sender.name],
      ]),
    });
  }

  // Nieuws
  const { items: nieuws } = await getNieuws(1000);
  await writeRoute(shell, origin, '/nieuws', {
    title: 'Nieuws — Open Regels Nederland',
    description: 'Landelijk nieuws van de Rijksoverheid.',
    bodyFragment: listFragment(
      'Nieuws',
      'Landelijk nieuws van de Rijksoverheid.',
      nieuws.map((n) => ({ title: n.title, summary: n.summary }))
    ),
  });
  for (const n of nieuws) {
    urls.push(`/nieuws/${n.id}`);
    await writeRoute(shell, origin, `/nieuws/${n.id}`, {
      title: `${n.title} — Open Regels Nederland`,
      description: n.summary,
      bodyFragment: detailFragment(n.title, n.summary, n.source.name, [['Bron', n.source.name]]),
    });
  }

  // Producten & Diensten
  const { items: producten } = await getProducten(1000);
  await writeRoute(shell, origin, '/producten', {
    title: 'Producten & Diensten — Open Regels Nederland',
    description: 'Vergunningen, meldingen en subsidies voor inwoners en ondernemers.',
    bodyFragment: listFragment(
      'Producten & Diensten',
      'Vergunningen, meldingen en subsidies.',
      producten.map((p) => ({ title: p.title, summary: p.description }))
    ),
  });
  for (const p of producten) {
    urls.push(`/producten/${p.id}`);
    await writeRoute(shell, origin, `/producten/${p.id}`, {
      title: `${p.title} — Open Regels Nederland`,
      description: p.description,
      bodyFragment: detailFragment(p.title, p.description, 'Provincie Flevoland', [
        ['Soort', p.soort],
      ]),
    });
  }

  // Regelcatalogus (services)
  const catalogus = await getRegelcatalogus();
  await writeRoute(shell, origin, '/regels', {
    title: 'Regelcatalogus — Open Regels Nederland',
    description: 'Publieke diensten en de regels waarmee de overheid ze uitvoert.',
    bodyFragment: listFragment(
      'Regelcatalogus',
      'Publieke diensten en de regels waarmee de overheid ze uitvoert.',
      catalogus.services.map((s) => ({ title: s.title, summary: s.description }))
    ),
  });
  for (const s of catalogus.services) {
    const slug = slugify(s.title);
    const org = catalogus.organizations.find((o) => o.services.some((os) => os.uri === s.uri));
    const ruleCount = catalogus.rules.filter((r) => r.serviceTitle === s.title).length;
    urls.push(`/regels/${slug}`);
    await writeRoute(shell, origin, `/regels/${slug}`, {
      title: `${s.title} — Open Regels Nederland`,
      description: s.description,
      bodyFragment: detailFragment(s.title, s.description, org?.name ?? 'Onbekend', [
        ['Uitvoeringsorganisatie', org?.name ?? '—'],
        ['Aantal regels', String(ruleCount)],
      ]),
    });
  }

  // Procesbibliotheek
  const processen = await getProcessen();
  await writeRoute(shell, origin, '/processen', {
    title: 'Procesbibliotheek — Open Regels Nederland',
    description: 'Hoe een aanvraag stap voor stap door de organisatie loopt.',
    bodyFragment: listFragment(
      'Procesbibliotheek',
      'Hoe een aanvraag stap voor stap door de organisatie loopt.',
      processen.map((p) => ({ title: p.naam, summary: p.beschrijving ?? '' }))
    ),
  });
  for (const p of processen) {
    urls.push(`/processen/${p.key}`);
    await writeRoute(shell, origin, `/processen/${p.key}`, {
      title: `${p.naam} — Open Regels Nederland`,
      description: p.beschrijving ?? '',
      bodyFragment: detailFragment(p.naam, p.beschrijving ?? '', 'Provincie Flevoland', [
        ['Proceskey', p.key],
        ['Status', p.status],
      ]),
    });
  }
  urls.push('/berichten', '/nieuws', '/producten', '/regels', '/processen');

  await writeFile(path.join(distDir, 'sitemap.xml'), buildSitemap(origin, urls), 'utf-8');
  await writeFile(path.join(distDir, 'robots.txt'), buildRobots(origin), 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`Prerendered ${urls.length} routes for mode=${mode} (${origin})`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Prerender failed:', error);
  process.exitCode = 1;
});
