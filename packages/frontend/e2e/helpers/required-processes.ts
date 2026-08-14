export interface RequiredProcess {
  processDefinitionKey: string;
  tenantId: string;
}

/**
 * The five process-definition-key + tenant-id pairs ronl-business-api's E2E
 * suite requires to be deployed on Operaton before tests run. Kept in sync
 * with linked-data-explorer's own e2e-fixtures/manifest.json by hand — see
 * docs/superpowers/specs/2026-08-14-tenant-mandatory-adoption-design.md
 * Section C for why this is two small manifests rather than one shared file.
 */
export const REQUIRED_PROCESSES: RequiredProcess[] = [
  { processDefinitionKey: 'AwbShellProcess', tenantId: 'flevoland' },
  { processDefinitionKey: 'TreeFellingPermitSubProcessE2E', tenantId: 'flevoland' },
  { processDefinitionKey: 'RipR21Process', tenantId: 'flevoland' },
  { processDefinitionKey: 'AwbZorgtoeslagProcess', tenantId: 'toeslagen' },
  { processDefinitionKey: 'ZorgtoeslagProvisionalSubProcessE2E', tenantId: 'toeslagen' },
];

const OPERATON_BASE_URL = 'http://localhost:8081/engine-rest';

/**
 * Queries Operaton directly (same base URL the backend itself uses in dev —
 * see packages/backend/.env.development) for the latest version of each
 * required process-definition key, and checks its deployed tenantId matches
 * what this suite expects. Returns one human-readable problem string per
 * mismatch/missing key; an empty array means the bundle is ready.
 */
export async function verifyRequiredProcesses(): Promise<string[]> {
  const keys = REQUIRED_PROCESSES.map((p) => p.processDefinitionKey).join(',');
  let deployed: Array<{ key: string; tenantId: string | null }>;
  try {
    const res = await fetch(
      `${OPERATON_BASE_URL}/process-definition?keysIn=${encodeURIComponent(keys)}&latestVersion=true`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deployed = (await res.json()) as Array<{ key: string; tenantId: string | null }>;
  } catch (err) {
    return [
      `- Could not query Operaton at ${OPERATON_BASE_URL} to verify required processes: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`,
    ];
  }

  const deployedTenantsByKey = new Map<string, Array<string | null>>();
  for (const d of deployed) {
    const existing = deployedTenantsByKey.get(d.key) ?? [];
    existing.push(d.tenantId);
    deployedTenantsByKey.set(d.key, existing);
  }

  const problems: string[] = [];
  for (const { processDefinitionKey, tenantId } of REQUIRED_PROCESSES) {
    const tenantIds = deployedTenantsByKey.get(processDefinitionKey);
    if (!tenantIds) {
      problems.push(`- '${processDefinitionKey}' is not deployed on Operaton`);
      continue;
    }
    if (!tenantIds.includes(tenantId)) {
      const seen = tenantIds.map((t) => t ?? '(none)').join(', ');
      problems.push(
        `- '${processDefinitionKey}' is deployed but not under tenant-id '${tenantId}' (found: ${seen})`
      );
    }
  }
  return problems;
}
