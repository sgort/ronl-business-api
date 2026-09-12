/**
 * Resolve a signingUrl into something an <iframe src> can actually load.
 *
 * In stub mode the backend returns a RELATIVE path
 * (`/v1/validsign/stub/ceremony/{packageId}`). A browser resolves a
 * relative iframe src against the FRONTEND's own origin, not the API's —
 * there is no dev-server proxy for `/v1`, so that path is an unknown route
 * on the frontend and the SPA serves its own index.html into the iframe
 * (the landing page, not the ceremony). The live ValidSign path returns a
 * full https://...validsign.eu/... URL and must be passed through
 * unchanged.
 *
 * `apiBaseUrl` (e.g. `http://localhost:3002/v1`) already carries `/v1`
 * itself, and the stub path duplicates it — concatenating naively would
 * give `.../v1/v1/validsign/...`. Only the ORIGIN is wanted; the relative
 * path is appended to that.
 *
 * `apiBaseUrl` itself may be relative or empty (an API served same-origin
 * behind a reverse proxy) or malformed — `new URL()` throws on both, and
 * in either case there is no origin to prefix with, so the relative
 * signingUrl is already correct (or, for a genuinely malformed value, is
 * at least not a crash that blanks the whole task view — a ceremony that
 * fails to load is a lesser failure than that).
 *
 * Lives in its own module rather than beside the component: a file that
 * exports both a component and a plain function breaks Fast Refresh
 * (react-refresh/only-export-components). Separating it also keeps it
 * unit-testable directly against the actual `src` an iframe would receive,
 * rather than an intermediate variable — that gap is exactly what let this
 * bug through the first time.
 */
export function resolveSigningUrl(signingUrl: string, apiBaseUrl: string): string {
  if (/^https?:\/\//i.test(signingUrl)) return signingUrl;
  try {
    return new URL(apiBaseUrl).origin + signingUrl;
  } catch {
    return signingUrl;
  }
}
