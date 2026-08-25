/**
 * Per-environment origin for the social card's absolute URLs.
 *
 * index.html hardcodes og:url and og:image to the production origin, because a
 * static HTML file cannot know its own deploy target and the Open Graph spec
 * requires absolute URLs — scrapers do not resolve relative paths. This
 * rewrites both to whichever origin is actually being built for.
 *
 * Without it, an acceptance build advertises a production domain that is not
 * live yet (§1/§3 of docs/PA-DEMO-GO-LIVE.md: the PROD Static Web App and DNS
 * do not exist), so every ACC link preview silently fails to load its image.
 * That exact bug shipped once already in public-site v2026.08.15 — see the
 * comment above rewriteSocialCardOrigin in
 * packages/public-site/scripts/prerender.ts, which this mirrors.
 *
 * public-site does the rewrite in its prerender step; pa-demo has no prerender,
 * so vite.config.ts calls this from a transformIndexHtml plugin instead. Kept
 * here in scripts/ rather than src/ for the same reason prerender.ts is: it is
 * build tooling, and nothing in the app's module graph should be able to import
 * a table of deploy origins.
 *
 * NOTE — this rewrites text, not pixels. The shipped og-pa-demo.png has its
 * environment baked in: an "ACCEPTATIEOMGEVING" badge and the acc. hostname in
 * its footer. Producing the production card is a manual re-capture, documented
 * in docs/pa-demo-social-handoff/reference/README.md, and must happen before
 * the first PROD deploy or the card will read ACC while og:url reads PROD.
 */

export type BuildMode = 'development' | 'acceptance' | 'production';

export const SITE_ORIGIN: Record<BuildMode, string> = {
  // pa-demo's dev server port, kept in step with `server.port` in vite.config.ts.
  development: 'http://localhost:5176',
  acceptance: 'https://acc.plato.open-regels.nl',
  production: 'https://plato.open-regels.nl',
};

/** The origin index.html is authored against; the string these rewrites replace. */
const AUTHORED_ORIGIN = SITE_ORIGIN.production;

/**
 * Unknown modes fall back to production rather than throwing: a typo'd --mode
 * should ship a card pointing at the real site, not fail the build or emit a
 * localhost URL into a deployed page.
 */
export function originForMode(mode: string): string {
  return SITE_ORIGIN[mode as BuildMode] ?? SITE_ORIGIN.production;
}

/**
 * Replaces only the two absolute URLs the card owns. Both search strings are
 * anchored on the closing quote, so `.../` cannot also match the start of
 * `.../og-pa-demo.png` — and nothing else in the document is touched, including
 * og:image:width/height and the og:image:alt text.
 */
export function rewriteSocialCardOrigin(html: string, origin: string): string {
  return html
    .replace(`content="${AUTHORED_ORIGIN}/"`, `content="${origin}/"`)
    .replace(`content="${AUTHORED_ORIGIN}/og-pa-demo.png"`, `content="${origin}/og-pa-demo.png"`);
}
