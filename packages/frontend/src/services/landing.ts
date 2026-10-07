/**
 * The landing page for a tenant, as an absolute URL for Keycloak's logout
 * redirect. With a tenant id the user returns to that tenant's page
 * (`/?tenant=amsterdam`); without one, to the plain landing page, which is
 * the default tenant's.
 */
export function landingUrl(tenantId?: string | null): string {
  const base = window.location.origin + '/';
  return tenantId ? `${base}?tenant=${encodeURIComponent(tenantId)}` : base;
}
