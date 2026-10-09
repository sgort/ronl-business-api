import { CITIZEN_SERVICES, type CitizenServiceId } from '@ronl/shared';

/** One latest process definition as Operaton reports it: its key and tenant. */
export interface ProcessDeployment {
  key: string;
  tenantId: string | null;
}

/** Every process a citizen service starts, in registry order. */
export const CITIZEN_SERVICE_PROCESS_KEYS: string[] = CITIZEN_SERVICES.map((s) => s.processKey);

/**
 * The citizen services a citizen of `tenantId` may start (#344), in registry
 * order. own-tenant: deployed under the citizen's own tenant. cross-tenant:
 * deployed under exactly one tenant, which then handles the case; under
 * several the start would be ambiguous (409), so it is not offered. A
 * deployment without a tenant never counts: tenant is mandatory.
 */
export function citizenServicesAvailable(
  deployments: ProcessDeployment[],
  tenantId: string | undefined
): CitizenServiceId[] {
  return CITIZEN_SERVICES.filter((service) => {
    const tenants = new Set(
      deployments
        .filter((d) => d.key === service.processKey && d.tenantId !== null)
        .map((d) => d.tenantId as string)
    );
    return service.scope === 'own-tenant'
      ? Boolean(tenantId) && tenants.has(tenantId as string)
      : tenants.size === 1;
  }).map((service) => service.id);
}

/** Whether a citizen may start this process under another tenant than their own. */
export function isCrossTenantProcess(processKey: string): boolean {
  return CITIZEN_SERVICES.some((s) => s.processKey === processKey && s.scope === 'cross-tenant');
}
