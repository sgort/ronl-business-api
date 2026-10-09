/**
 * The landing page for a tenant, as an absolute URL for Keycloak's logout
 * redirect. With a tenant id the user returns to that tenant's page
 * (`/amsterdam`); without one, to the plain landing page. An id without a
 * page of its own, such as the default tenant's, is sent on to `/` by the
 * landing page itself.
 */
export function landingUrl(tenantId?: string | null): string {
  const base = window.location.origin + '/';
  return tenantId ? base + encodeURIComponent(tenantId) : base;
}
