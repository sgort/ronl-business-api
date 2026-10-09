/**
 * A landing page per single-board tenant, e.g. dist/amsterdam/index.html.
 *
 * Unfurlers (WhatsApp, LinkedIn, Teams, Slack) do not run JavaScript, so a
 * link preview has to be in the HTML the host returns for the URL. After the
 * build this copies dist/index.html once per tenant with its own title,
 * description, canonical URL and Open Graph tags. Scripts and styles stay as
 * they are, so it is the same app; only the meta differs. The copy comes from
 * the tenant's "share" entry in tenants.json, the card image from
 * public/og-image-<id>-<acc|prod>.png.
 *
 * It also adds one rewrite per tenant to the shipped staticwebapp.config.json,
 * so /amsterdam serves the tenant page rather than the navigation fallback.
 * Static Web Apps ignores a trailing slash when matching routes, so that one
 * rule covers /amsterdam/ too.
 *
 * Which tenants qualify mirrors the landing page: enabled, exactly one board.
 * That their ids are valid, unreserved paths is enforced by a unit test over
 * tenants.json (src/pages/login-choice/tenants-landing.test.ts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface TenantPageEntry {
  id: string;
  displayName: string;
  enabled: boolean;
  boards?: string[];
  share?: { title: string; description: string };
}

/** A tenant that gets a page: one with share copy. */
export type TenantPage = TenantPageEntry & { share: NonNullable<TenantPageEntry['share']> };

export interface PageEnv {
  /** Absolute site URL without a trailing slash, from VITE_SITE_URL. */
  siteUrl: string;
  /** VITE_OG_TITLE_PREFIX, e.g. "[ACC] ". */
  titlePrefix: string;
  /** Which of the tenant's two cards this build ships. */
  cardEnv: 'acc' | 'prod';
}

interface SwaRoute {
  route: string;
  [key: string]: unknown;
}

interface SwaConfig {
  routes?: SwaRoute[];
  [key: string]: unknown;
}

export const cardEnvFor = (mode: string): PageEnv['cardEnv'] =>
  mode === 'production' ? 'prod' : 'acc';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tenantPageTenants(tenants: Record<string, TenantPageEntry>): TenantPage[] {
  return Object.values(tenants).filter(
    (t): t is TenantPage => t.enabled && t.boards?.length === 1 && Boolean(t.share)
  );
}

const failCount = (label: string, found: number) =>
  new Error(`tenant pages: expected one ${label} in index.html, found ${found}`);

/**
 * Replaces the one tag `pattern` matches; a missing or doubled tag fails the
 * build. `pattern` is a global regex literal, so it can count its matches
 * without building a RegExp at run time.
 */
function replaceOne(html: string, pattern: RegExp, replacement: string, label: string): string {
  if (!pattern.global) throw new Error(`tenant pages: the ${label} pattern must be global`);
  const found = html.match(pattern)?.length ?? 0;
  if (found !== 1) throw failCount(label, found);
  return html.replace(pattern, () => replacement);
}

const metaTag = (attr: 'name' | 'property', key: string, value: string) =>
  `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;

/**
 * Replaces the one <meta> tag for `key`, found by plain string search. The
 * opening includes the quote after the key, so og:image never matches
 * og:image:alt.
 */
function setMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const opening = `<meta ${attr}="${key}" content="`;
  const found = html.split(opening).length - 1;
  if (found !== 1) throw failCount(key, found);
  const start = html.indexOf(opening);
  const close = html.indexOf('" />', start + opening.length);
  if (close === -1) throw failCount(key, 0);
  return html.slice(0, start) + metaTag(attr, key, value) + html.slice(close + '" />'.length);
}

export function renderTenantPage(html: string, tenant: TenantPage, env: PageEnv): string {
  const url = `${env.siteUrl}/${tenant.id}`;
  const siteName = `${tenant.displayName} · werkomgeving`;
  let page = html;
  page = replaceOne(
    page,
    /<title>[^<]*<\/title>/g,
    `<title>${escapeHtml(siteName)}</title>`,
    'title'
  );
  page = setMeta(page, 'name', 'description', tenant.share.description);
  page = replaceOne(
    page,
    /<link rel="canonical" href="[^"]*" \/>/g,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    'canonical'
  );
  page = setMeta(page, 'property', 'og:site_name', siteName);
  page = setMeta(page, 'property', 'og:url', url);
  page = setMeta(page, 'property', 'og:title', `${env.titlePrefix}${tenant.share.title}`);
  page = setMeta(page, 'property', 'og:description', tenant.share.description);
  page = setMeta(
    page,
    'property',
    'og:image',
    `${env.siteUrl}/og-image-${tenant.id}-${env.cardEnv}.png`
  );
  page = setMeta(
    page,
    'property',
    'og:image:alt',
    `Werkomgeving ${tenant.displayName} — Caseworker-dashboard voor medewerkers`
  );
  return page;
}

/** How Static Web Apps compares routes: a trailing slash makes no difference. */
const routeKey = (route: string) => route.replace(/\/+$/, '') || '/';

/**
 * One rewrite per tenant. Static Web Apps treats /amsterdam and /amsterdam/
 * as the same route, so this rule serves both, and a second rule for the
 * slash form makes it refuse the whole config ("duplicate route"), which
 * fails the deploy. A clash with a route the config already has fails the
 * build here instead.
 */
export function withTenantRoutes(config: SwaConfig, ids: string[]): SwaConfig {
  const existing = config.routes ?? [];
  const taken = new Set(existing.map((r) => routeKey(r.route)));
  const tenantRoutes = ids.map((id) => {
    if (taken.has(routeKey(`/${id}`))) {
      throw new Error(
        `tenant pages: staticwebapp.config.json already has a duplicate route /${id}`
      );
    }
    taken.add(routeKey(`/${id}`));
    return { route: `/${id}`, rewrite: `/${id}/index.html` };
  });
  return { ...config, routes: [...tenantRoutes, ...existing] };
}

/** Writes dist/<id>/index.html per tenant page and their routes; returns the ids written. */
export function writeTenantPages(dist: string, env: PageEnv): string[] {
  const html = readFileSync(join(dist, 'index.html'), 'utf-8');
  const { tenants } = JSON.parse(readFileSync(join(dist, 'tenants.json'), 'utf-8'));
  const pages = tenantPageTenants(tenants);

  for (const tenant of pages) {
    mkdirSync(join(dist, tenant.id), { recursive: true });
    writeFileSync(join(dist, tenant.id, 'index.html'), renderTenantPage(html, tenant, env));
  }

  const ids = pages.map((t) => t.id);
  const swaPath = join(dist, 'staticwebapp.config.json');
  if (existsSync(swaPath)) {
    const config = JSON.parse(readFileSync(swaPath, 'utf-8')) as SwaConfig;
    writeFileSync(swaPath, JSON.stringify(withTenantRoutes(config, ids), null, 2) + '\n');
  }
  return ids;
}

export default function tenantPages(): Plugin {
  let dist = '';
  let env: PageEnv | null = null;

  return {
    name: 'ronl-tenant-pages',
    apply: 'build',
    configResolved(config) {
      dist = resolve(config.root, config.build.outDir);
      const siteUrl = config.env.VITE_SITE_URL as string | undefined;
      if (!siteUrl) throw new Error('tenant pages: VITE_SITE_URL is not set for this mode');
      env = {
        siteUrl: siteUrl.replace(/\/+$/, ''),
        titlePrefix: (config.env.VITE_OG_TITLE_PREFIX as string | undefined) ?? '',
        cardEnv: cardEnvFor(config.mode),
      };
    },
    closeBundle() {
      if (!env) return;
      const ids = writeTenantPages(dist, env);
      this.info(`tenant pages: ${ids.map((id) => `${id}/index.html`).join(', ')}`);
    },
  };
}
