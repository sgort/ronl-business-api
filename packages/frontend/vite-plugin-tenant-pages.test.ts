// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cardEnvFor,
  escapeHtml,
  renderTenantPage,
  tenantPageTenants,
  withTenantRoutes,
  writeTenantPages,
  type PageEnv,
  type TenantPage,
} from './vite-plugin-tenant-pages';

// index.html as Vite writes it for a mode: placeholders filled, assets hashed.
const BUILT = `<!doctype html>
<html lang="nl">
  <head>
    <title>ronl. werkomgeving</title>
    <meta name="description" content="Vier borden voor het werk van de provincie." />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="canonical" href="https://acc.mijn.open-regels.nl/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="ronl. werkomgeving" />
    <meta property="og:url" content="https://acc.mijn.open-regels.nl/" />
    <meta property="og:title" content="[ACC] Vier borden voor het werk van de provincie" />
    <meta property="og:description" content="Flevoland." />
    <meta property="og:image" content="https://acc.mijn.open-regels.nl/og-image-acc.png" />
    <meta property="og:image:alt" content="ronl. werkomgeving — Flevoland" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-def456.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

const ACC: PageEnv = {
  siteUrl: 'https://acc.mijn.open-regels.nl',
  titlePrefix: '[ACC] ',
  cardEnv: 'acc',
};
const PROD: PageEnv = { siteUrl: 'https://mijn.open-regels.nl', titlePrefix: '', cardEnv: 'prod' };

const unive: TenantPage = {
  id: 'unive',
  displayName: 'Univé Verzekeringen',
  enabled: true,
  boards: ['caseworker'],
  share: {
    title: 'Al je claims en aanvragen, helder op een rij',
    description: 'Schadeclaims & "wijzigingen" <afhandelen>.',
  },
};

const meta = (html: string, attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html)?.[1];

describe('renderTenantPage', () => {
  it.each([
    ['acc', ACC],
    ['prod', PROD],
  ] as const)('fills the %s link preview for the tenant', (env, pageEnv) => {
    const html = renderTenantPage(BUILT, unive, pageEnv);
    const site = pageEnv.siteUrl;

    expect(meta(html, 'property', 'og:url')).toBe(`${site}/unive`);
    expect(html).toContain(`<link rel="canonical" href="${site}/unive" />`);
    expect(meta(html, 'property', 'og:image')).toBe(`${site}/og-image-unive-${env}.png`);
    expect(meta(html, 'property', 'og:title')).toBe(
      `${pageEnv.titlePrefix}Al je claims en aanvragen, helder op een rij`
    );
  });

  it('escapes every value it writes', () => {
    const html = renderTenantPage(BUILT, unive, PROD);

    expect(meta(html, 'property', 'og:description')).toBe(
      'Schadeclaims &amp; &quot;wijzigingen&quot; &lt;afhandelen&gt;.'
    );
    expect(meta(html, 'name', 'description')).toBe(
      'Schadeclaims &amp; &quot;wijzigingen&quot; &lt;afhandelen&gt;.'
    );
    expect(meta(html, 'property', 'og:site_name')).toBe('Univé Verzekeringen · werkomgeving');
    expect(meta(html, 'property', 'og:image:alt')).toBe(
      'Werkomgeving Univé Verzekeringen — Caseworker-dashboard voor medewerkers'
    );
    expect(html).toContain('<title>Univé Verzekeringen · werkomgeving</title>');
  });

  it('keeps robots, the scripts and the styles of the build it started from', () => {
    const html = renderTenantPage(BUILT, unive, ACC);

    expect(meta(html, 'name', 'robots')).toBe('noindex, nofollow');
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-abc123.js">');
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index-def456.css">');
    expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
  });

  it('fails loudly when the template no longer has a tag it fills', () => {
    const drifted = BUILT.replace(/<meta property="og:url"[^>]*>/, '');

    expect(() => renderTenantPage(drifted, unive, ACC)).toThrow(/og:url/);
  });

  it.each([
    ['og:title', /<meta property="og:title"[^>]*>/],
    ['title', /<title>[^<]*<\/title>/],
    ['canonical', /<link rel="canonical"[^>]*>/],
  ])('fails loudly when the template has %s twice', (label, tag) => {
    const doubled = BUILT.replace(tag, (t) => t + t);

    expect(() => renderTenantPage(doubled, unive, ACC)).toThrow(
      new RegExp(`one ${label} in index.html, found 2`)
    );
  });

  it('tells og:image apart from og:image:alt', () => {
    const html = renderTenantPage(BUILT, unive, ACC);

    expect(meta(html, 'property', 'og:image')).toBe(
      'https://acc.mijn.open-regels.nl/og-image-unive-acc.png'
    );
    expect(meta(html, 'property', 'og:image:alt')).toMatch(/^Werkomgeving Univé/);
  });
});

describe('tenantPageTenants', () => {
  const base = { displayName: 'X', enabled: true, share: unive.share };

  it('keeps only enabled tenants with exactly one board and share copy', () => {
    const picked = tenantPageTenants({
      flevoland: { ...base, id: 'flevoland', boards: ['caseworker', 'woo'] },
      utrecht: { ...base, id: 'utrecht' },
      amsterdam: { ...base, id: 'amsterdam', boards: ['caseworker'] },
      oldtown: { ...base, id: 'oldtown', boards: ['caseworker'], enabled: false },
      noshare: { ...base, id: 'noshare', boards: ['caseworker'], share: undefined },
    });

    expect(picked.map((t) => t.id)).toEqual(['amsterdam']);
  });
});

describe('withTenantRoutes', () => {
  it('rewrites /<id> to the tenant page, ahead of the existing routes', () => {
    const config = withTenantRoutes(
      { routes: [{ route: '/*', allowedRoles: ['anonymous'] }], navigationFallback: {} },
      ['amsterdam', 'unive']
    );

    expect(config.routes).toEqual([
      { route: '/amsterdam', rewrite: '/amsterdam/index.html' },
      { route: '/unive', rewrite: '/unive/index.html' },
      { route: '/*', allowedRoles: ['anonymous'] },
    ]);
    expect(config.navigationFallback).toEqual({});
  });

  // Static Web Apps ignores a trailing slash when it compares routes, and
  // refuses the whole config when two are equal: "A rule was already
  // processed with a duplicate route /amsterdam/". One rule covers both forms.
  it('never emits two routes that differ only by a trailing slash', () => {
    const config = withTenantRoutes({ routes: [{ route: '/*' }] }, ['amsterdam', 'unive']);
    const normalised = (config.routes ?? []).map((r) => r.route.replace(/\/+$/, '') || '/');

    expect(new Set(normalised).size).toBe(normalised.length);
  });

  it('refuses a tenant whose route the config already has', () => {
    expect(() => withTenantRoutes({ routes: [{ route: '/amsterdam/' }] }, ['amsterdam'])).toThrow(
      /duplicate route \/amsterdam/
    );
  });
});

describe('cardEnvFor', () => {
  it('uses the production card only for a production build', () => {
    expect(cardEnvFor('production')).toBe('prod');
    expect(cardEnvFor('acceptance')).toBe('acc');
    expect(cardEnvFor('development')).toBe('acc');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that matter inside an attribute', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('writeTenantPages', () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'tenant-pages-'));
    writeFileSync(join(dist, 'index.html'), BUILT);
    writeFileSync(
      join(dist, 'staticwebapp.config.json'),
      JSON.stringify({ routes: [{ route: '/*', allowedRoles: ['anonymous'] }] })
    );
    writeFileSync(
      join(dist, 'tenants.json'),
      JSON.stringify({
        default: 'flevoland',
        tenants: {
          flevoland: { ...unive, id: 'flevoland', boards: ['caseworker', 'woo'] },
          unive,
        },
      })
    );
  });

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it('writes a page per single-board tenant and none for Flevoland', () => {
    const written = writeTenantPages(dist, ACC);

    expect(written).toEqual(['unive']);
    const page = readFileSync(join(dist, 'unive', 'index.html'), 'utf-8');
    expect(meta(page, 'property', 'og:url')).toBe('https://acc.mijn.open-regels.nl/unive');
    expect(() => readFileSync(join(dist, 'flevoland', 'index.html'))).toThrow();
  });

  it('adds the tenant routes to the shipped staticwebapp.config.json', () => {
    writeTenantPages(dist, ACC);

    const config = JSON.parse(readFileSync(join(dist, 'staticwebapp.config.json'), 'utf-8'));
    expect(config.routes[0]).toEqual({ route: '/unive', rewrite: '/unive/index.html' });
  });
});

describe('the real tenants.json', () => {
  it('has a page for each single-board tenant', () => {
    const tenants = JSON.parse(
      readFileSync(resolve(__dirname, 'public', 'tenants.json'), 'utf-8')
    ).tenants;
    const ids = tenantPageTenants(tenants).map((t) => t.id);

    expect(ids.sort()).toEqual(['amsterdam', 'heusden', 'toeslagen', 'unive']);
  });

  it.each([
    ['acc', ACC],
    ['prod', PROD],
  ] as const)('renders the Heusden %s page from its entry', (env, pageEnv) => {
    const tenants = JSON.parse(
      readFileSync(resolve(__dirname, 'public', 'tenants.json'), 'utf-8')
    ).tenants;
    const heusden = tenantPageTenants(tenants).find((t) => t.id === 'heusden')!;
    const html = renderTenantPage(BUILT, heusden, pageEnv);

    expect(meta(html, 'property', 'og:url')).toBe(`${pageEnv.siteUrl}/heusden`);
    expect(meta(html, 'property', 'og:image')).toBe(
      `${pageEnv.siteUrl}/og-image-heusden-${env}.png`
    );
    expect(meta(html, 'property', 'og:title')).toBe(
      `${pageEnv.titlePrefix}Uw werkvoorraad, overzichtelijk op één plek`
    );
    expect(meta(html, 'property', 'og:site_name')).toBe('Gemeente Heusden · werkomgeving');
  });
});
