import { isLocalTarget, OPERATON_URL, targetLabel } from './target';

export interface RequiredProcess {
  processDefinitionKey: string;
  tenantId: string;
}

interface ProcessSpec {
  /** Key as deployed from linked-data-explorer/e2e-fixtures onto the local engine. */
  fixtureKey: string;
  /** Key as deployed on a shared tier, from public/examples, with the E2E labels stripped. */
  deployedKey: string;
  /** Tenant the definition must run under. The same on every target, by design. */
  tenantId: string;
}

/**
 * The seven process definitions ronl-business-api's E2E suite requires. Kept
 * in sync with linked-data-explorer's own e2e-fixtures/manifest.json by hand —
 * see docs/superpowers/specs/2026-08-14-tenant-mandatory-adoption-design.md
 * Section C for why this is two small manifests rather than one shared file.
 *
 * Exactly one thing varies per target: the sub-process KEY. The fixtures carry
 * a deliberate `...E2E` suffix so a fixture gets its own Operaton key, distinct
 * from the deployed example (see the manifest's `source` notes); a shared tier
 * runs the plain key from public/examples.
 *
 * Tenancy does NOT vary. Every tier is meant to mirror localhost: these
 * processes are tenant-scoped everywhere, and an untenanted copy on a tier is
 * drift to be repaired, not an expectation to encode here. That is deliberate —
 * an earlier version of this file carried a per-target tenantId, which would
 * have let ACC quietly keep running untenanted definitions while the suite
 * reported green.
 *
 * Only process definitions are checked here, not decisions. The DMNs these
 * processes call are deployed WITHOUT a tenant-id on purpose — decision logic
 * is shared regulation, process instances are tenant-isolated — and each
 * businessRuleTask reaches them with camunda:decisionRefTenantId="${null}".
 * A DMN deployed under a tenant by mistake does not show up as a missing
 * process here; it surfaces as a 500 on process start.
 */
const PROCESS_SPECS: ProcessSpec[] = [
  {
    fixtureKey: 'AwbShellProcess',
    deployedKey: 'AwbShellProcess',
    tenantId: 'flevoland',
  },
  {
    fixtureKey: 'TreeFellingPermitSubProcessE2E',
    deployedKey: 'TreeFellingPermitSubProcess',
    tenantId: 'flevoland',
  },
  {
    fixtureKey: 'RipR21Process',
    deployedKey: 'RipR21Process',
    tenantId: 'flevoland',
  },
  {
    fixtureKey: 'ThuisbatterijSubsidieAanvraagProcess',
    deployedKey: 'ThuisbatterijSubsidieAanvraagProcess',
    tenantId: 'flevoland',
  },
  {
    fixtureKey: 'ThuisbatterijSubsidieDecisionSubProcessE2E',
    deployedKey: 'ThuisbatterijSubsidieDecisionSubProcess',
    tenantId: 'flevoland',
  },
  {
    fixtureKey: 'AwbZorgtoeslagProcess',
    deployedKey: 'AwbZorgtoeslagProcess',
    tenantId: 'toeslagen',
  },
  {
    fixtureKey: 'ZorgtoeslagProvisionalSubProcessE2E',
    deployedKey: 'ZorgtoeslagProvisionalSubProcess',
    tenantId: 'toeslagen',
  },
];

export const REQUIRED_PROCESSES: RequiredProcess[] = PROCESS_SPECS.map((spec) => ({
  processDefinitionKey: isLocalTarget ? spec.fixtureKey : spec.deployedKey,
  tenantId: spec.tenantId,
}));

/**
 * Queries Operaton directly (the same engine the backend under test uses) for
 * the latest version of each required process-definition key, and checks its
 * deployed tenantId matches what this suite expects. Returns one
 * human-readable problem string per mismatch/missing key; an empty array means
 * the bundle is ready.
 */
export async function verifyRequiredProcesses(): Promise<string[]> {
  const keys = REQUIRED_PROCESSES.map((p) => p.processDefinitionKey).join(',');
  let deployed: Array<{ key: string; tenantId: string | null }>;
  try {
    const res = await fetch(
      `${OPERATON_URL}/process-definition?keysIn=${encodeURIComponent(keys)}&latestVersion=true`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deployed = (await res.json()) as Array<{ key: string; tenantId: string | null }>;
  } catch (err) {
    return [
      `- Could not query Operaton at ${OPERATON_URL} to verify required processes: ${
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
      problems.push(`- '${processDefinitionKey}' is not deployed on ${targetLabel}'s engine`);
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
