// Reads the JSON payload the prerender step embeds into each route's HTML, so
// the first client render already has its data instead of rendering a short
// loading placeholder and then re-fetching. That null→loading→content churn is
// what shifts the footer/facets on content pages (the measured CLS).
//
// The blob carries the route it was built for; a read only returns data when
// that route matches, so a stale blob isn't reused after client-side navigation
// to a different page. The reader is pure (no DOM mutation) so it's safe to call
// from a useState lazy initializer, which React StrictMode double-invokes in dev.
// Reusing the initial blob when navigating back to the same route is harmless for
// this near-static content.
export function readPrerenderedData<T>(route: string): T | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('__PUB_DATA__');
  if (!el?.textContent) return null;
  try {
    const parsed = JSON.parse(el.textContent) as { route?: string; data?: T };
    if (parsed.route !== route) return null;
    return (parsed.data ?? null) as T | null;
  } catch {
    return null;
  }
}
