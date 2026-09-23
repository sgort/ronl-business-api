/**
 * Which browser origins may call this backend.
 *
 * Two kinds are allowed, and they are allowed differently.
 *
 * **Configured origins** are listed exactly in `CORS_ORIGIN` — the real
 * front ends of a tier. Exact string equality, as before.
 *
 * **Preview origins** cannot be listed, because a Static Web Apps preview gets
 * a new hostname for every pull request. Before #37 that meant a preview could
 * only demonstrate that static pages render: every call to the backend was
 * refused, on an environment the pull request had already paid to deploy.
 *
 * The allowance is narrow on purpose. Azure derives a preview hostname from the
 * app's STABLE slug — confirmed against live previews on a neighbouring app
 * rather than from documentation:
 *
 *     brave-bay-04f351e03-117.westeurope.4.azurestaticapps.net   preview for PR 117
 *     brave-bay-04f351e03.4.azurestaticapps.net                  that app's default
 *
 * so matching on the slug admits this project's numbered previews and nothing
 * else. A pattern like `*.azurestaticapps.net` would have let ANY Azure Static
 * Web App in the world make credentialed cross-origin requests to the tier —
 * `credentials: true` is set — which is a bad trade for a preview.
 *
 * **Never in production.** Previews reach the shared acceptance backend and
 * nothing else. That is enforced here rather than by trusting the setting to be
 * empty, so a value that finds its way onto the production App Service changes
 * nothing about what production accepts.
 */

/** `<slug>-<environment number>.<region>.<n>.azurestaticapps.net`, and nothing else. */
function previewPattern(slug: string): RegExp {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https://${escaped}-\\d+\\.[a-z0-9-]+\\.\\d+\\.azurestaticapps\\.net$`);
}

export function isAllowedOrigin(
  origin: string,
  allowedOrigins: readonly string[],
  previewSlugs: readonly string[],
  isProduction: boolean
): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (isProduction) return false;
  return previewSlugs.some((slug) => previewPattern(slug).test(origin));
}

/**
 * The callback shape the `cors` package wants.
 *
 * A request with no Origin header — server to server, curl, a health probe —
 * is allowed through, which is what passing an array used to do implicitly.
 * CORS governs browsers; it is not an authentication boundary, and refusing
 * origin-less requests here would break every non-browser caller while
 * stopping no attacker.
 */
export function corsOriginCallback(
  allowedOrigins: readonly string[],
  previewSlugs: readonly string[],
  isProduction: boolean
) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ): void => {
    if (!origin) {
      callback(null, true);
      return;
    }
    callback(null, isAllowedOrigin(origin, allowedOrigins, previewSlugs, isProduction));
  };
}
