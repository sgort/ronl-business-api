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
 * Decisions are checked separately, by verifyRequiredDecisions below: the DMNs
 * these processes call are deployed WITHOUT a tenant-id on purpose — decision
 * logic is shared regulation, process instances are tenant-isolated — so they
 * need their own query and their own assertion. This comment used to end by
 * noting that a DMN deployed under a tenant surfaces as a 500 on process start
 * rather than as a missing process here. That is still true, and is now caught
 * before the suite runs.
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

/**
 * The decision definitions the suite's processes call.
 *
 * Kept beside REQUIRED_PROCESSES and in sync with
 * linked-data-explorer/e2e-fixtures/manifest.json by hand, the same way and for
 * the same reason. The manifest is the authority: its `sharedDecisions` block
 * lists the files and what each provides, and every entry declares the keys its
 * BPMN calls. A test there asserts the two agree, so this list changing without
 * that one is a mismatch someone will notice.
 *
 * Unlike processes, these carry NO tenant: the DMNs are deployed once, without
 * an Organization, and every businessRuleTask reaches them with
 * camunda:decisionRefTenantId="${null}". Decision logic is shared regulation;
 * process instances are tenant-isolated.
 *
 * Checking them here is the point of sgort/linked-data-explorer#187. A stack
 * rebuilt from the fixture bundle deploys cleanly, serves its start forms
 * cleanly, and then fails at the first business rule task with
 *
 *   Cannot instantiate process definition AwbShellProcess:1:...:
 *   no decision definition deployed with key 'AwbCompletenessCheck'
 *   and tenant-id 'null': decisionDefinition is null
 *
 * — one key at a time. Reaching that through the UI shows a citizen
 * "probeer het opnieuw" (#171) and reaching it through a spec shows a failed
 * assertion halfway through a journey. Neither says a DMN is missing. This
 * turns both into a precondition failure that names the key before anything
 * runs.
 *
 * A decision deployed UNDER a tenant is the other half, and the more confusing
 * one: it is present, it is visible in Cockpit, and it is still invisible to a
 * `${null}` lookup. Hence the tenant assertion rather than mere existence.
 */
export const REQUIRED_DECISIONS: string[] = [
  'AwbCompletenessCheck',
  'ArchivesActRetention',
  'TreeFellingDecision',
  'ReplacementTreeDecision',
  'zorgtoeslag_resultaat',
  'BehaalbareHoogteSubsidie',
  'RechtOpSubsidieThuisbatterij',
];

/**
 * Queries Operaton for each required decision-definition key and checks an
 * UNTENANTED version exists. Returns one problem string per key that is missing
 * or only present under a tenant; an empty array means the decisions are ready.
 */
export async function verifyRequiredDecisions(): Promise<string[]> {
  const keys = REQUIRED_DECISIONS.join(',');
  let deployed: Array<{ key: string; tenantId: string | null }>;
  try {
    const res = await fetch(
      `${OPERATON_URL}/decision-definition?keysIn=${encodeURIComponent(keys)}&latestVersion=true`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deployed = (await res.json()) as Array<{ key: string; tenantId: string | null }>;
  } catch (err) {
    return [
      `- Could not query Operaton at ${OPERATON_URL} to verify required decisions: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`,
    ];
  }

  // latestVersion=true returns the latest PER TENANT, so a key can come back
  // more than once: untenanted and pinned. Only the untenanted one counts.
  const tenantsByKey = new Map<string, Array<string | null>>();
  for (const d of deployed) {
    const seen = tenantsByKey.get(d.key) ?? [];
    seen.push(d.tenantId);
    tenantsByKey.set(d.key, seen);
  }

  const problems: string[] = [];
  for (const key of REQUIRED_DECISIONS) {
    const tenants = tenantsByKey.get(key);
    if (!tenants) {
      problems.push(`- decision '${key}' is not deployed on ${targetLabel}'s engine`);
      continue;
    }
    if (!tenants.includes(null)) {
      const seen = tenants.map((t) => t ?? '(none)').join(', ');
      problems.push(
        `- decision '${key}' is deployed only under a tenant (found: ${seen}); the BPMN resolves it ` +
          `with decisionRefTenantId="\${null}" and will not see it. Re-import it with the ` +
          `Organization field EMPTY.`
      );
    }
  }
  return problems;
}
