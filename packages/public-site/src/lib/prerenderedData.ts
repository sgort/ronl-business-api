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

/**
 * Whether a freshly fetched payload is the same as what is already on screen.
 *
 * The seed above is only a build-time snapshot: the RONL graph moves under it,
 * so every page that seeds from the blob has to revalidate against the API
 * (issue #88). Swapping state unconditionally would undo the reason the seed
 * exists — an unchanged response would still re-render and shift the layout —
 * so the swap is gated on this comparison.
 *
 * Both sides originate as JSON from the same backend serialisation, so key
 * order is stable and comparing the serialised form is a sound equality test
 * here. A spurious mismatch would cost one extra render, not correctness.
 */
export function isSamePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
