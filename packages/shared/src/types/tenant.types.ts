/**
 * Multi-tenant types shared by the frontend and the backend.
 *
 * Only the organisation type is shared: it is a claim on the user's token,
 * which both sides read. A tenant's configuration (theme, logo, landing copy,
 * contact, boards) lives in the frontend, in packages/frontend/public/tenants.json,
 * typed by TenantConfig in packages/frontend/src/services/tenant.ts. A copy of
 * that type used to live here; nothing imported it and it had fallen behind the
 * frontend's, so it was removed (#354, #433).
 */

export type OrganisationType = 'municipality' | 'province' | 'national' | 'commercial';
