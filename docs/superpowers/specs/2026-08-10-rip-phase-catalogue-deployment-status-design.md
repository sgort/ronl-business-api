# Design: RIP phase catalogue + live deployment status

## Problem

`docs/infra-beheer-handoff/` hands off a multi-phase redesign of the Infra-board
Beheer page: manage all nine RIP sub-processes (R2.1…R5.2) through Starten /
WIP / Gereed, instead of today's hardcoded single "RIP Fase 1" flow. That
redesign is too large for one spec — see "Decomposition" below. This document
covers only the first, foundational slice: a phase catalogue that knows the
real RIP phase content, and a live answer to "is this phase's process
actually deployed here?" Nothing else in the handoff package can be honest
without this piece.

## Decomposition

The full handoff was split into six sub-projects during brainstorming, in
dependency order:

| #     | Sub-project                                                       | Depends on |
| ----- | ----------------------------------------------------------------- | ---------- |
| **A** | Phase catalogue + deployment-state source _(this spec)_           | —          |
| B     | Beheer — Faseladder overview                                      | A          |
| C     | Beheer — phase detail, Starten tab                                | A, B       |
| D     | Beheer — phase detail, WIP + Gereed tabs                          | A, B       |
| E     | Geparkeerd (R5.2) handling                                        | A          |
| F     | Cross-app ladder migration (Portfolio, Mijn dag, project stepper) | A          |

B–F are out of scope here and will each get their own spec.

## Scope

Both `ronl-business-api` packages: `shared`, `backend`, `frontend`. Delivers
a data + service layer only — **no UI wiring**. B–F consume what this spec
produces; this spec's own deliverable is independently unit/integration
testable without any page rendering it yet.

## Design

### 1. `packages/shared/src/rip-phases.ts` (new)

The single cross-package source for phase↔engine-key mapping — the one fact
that must never drift between backend and frontend:

```ts
export interface RipPhaseKey {
  code: string; // 'R2.1' … 'R5.2'
  stage: string; // 'R2' | 'R3' | 'R4' | 'R5'
  processDefinitionKey?: string; // undefined until the phase is modelled as BPMN
}

export const RIP_PHASE_KEYS: RipPhaseKey[] = [
  { code: 'R2.1', stage: 'R2', processDefinitionKey: 'RipPhase1Process' },
  { code: 'R2.2', stage: 'R2' },
  { code: 'R2.3', stage: 'R2' },
  { code: 'R2.4', stage: 'R2' },
  { code: 'R3.1', stage: 'R3' },
  { code: 'R3.2', stage: 'R3' },
  { code: 'R4.1', stage: 'R4' },
  { code: 'R5.1', stage: 'R5' },
  { code: 'R5.2', stage: 'R5' },
];
```

Exported from `packages/shared/src/index.ts` alongside the existing
`operaton.types.ts` exports. Only R2.1 has a key today — the other eight get
theirs filled in by whoever models that phase's BPMN, at the same moment the
process itself is created, so the mapping can't silently drift from reality.

Rich Dutch content (names, roles, products, gateways, source references)
stays in the frontend catalogue (§4) — the backend never needs it, so it
isn't forced to rebuild on UI-copy changes.

### 2. Backend — `OperatonService.getDeployedProcessKeys`

New method in `packages/backend/src/services/operaton.service.ts`, alongside
the other read-only passthrough queries (`listProcessInstances`,
`queryProcessHistory`):

```ts
/**
 * Given a list of process-definition keys, return the subset that is
 * actually deployed on this environment's Operaton instance. One query
 * regardless of how many keys are asked about.
 */
async getDeployedProcessKeys(keys: string[]): Promise<string[]> {
  try {
    const response = await this.client.get('/process-definition', {
      params: { keysIn: keys.join(','), latestVersion: true },
    });
    const found = new Set((response.data as Array<{ key: string }>).map((d) => d.key));
    return keys.filter((k) => found.has(k));
  } catch (error) {
    logger.error('Failed to query deployed process keys', {
      keys,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
```

Filtering the input `keys` against `found` (rather than returning `found`
directly) keeps the result scoped to exactly what was asked and stable in
order — defensive against Operaton ever returning something unrelated.

No caching. This is one lightweight GET; caching "is it deployed" would risk
showing a stale answer right after a deploy, which is precisely the
information Beheer needs to be honest about.

### 3. Backend — `GET /v1/rip/phases/deployment-status`

New route in `packages/backend/src/routes/rip.routes.ts`, same
auth/tenant gating the file's existing routes already apply
(`jwtMiddleware` + `tenantMiddleware` at the router level, then a 401 check
for `req.user`):

```ts
router.get('/phases/deployment-status', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  try {
    const keys = RIP_PHASE_KEYS.map((p) => p.processDefinitionKey).filter((k): k is string => !!k);
    const deployedKeys = await operatonService.getDeployedProcessKeys(keys);
    res.json({ success: true, data: { deployedKeys } });
  } catch (error) {
    logger.error('Failed to fetch RIP phase deployment status', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'DEPLOYMENT_STATUS_FAILED',
        message: 'Failed to retrieve phase deployment status',
      },
    });
  }
});
```

`RIP_PHASE_KEYS` imported from `@ronl/shared`. Not tenant-scoped in the
query itself — deployment state is engine-wide, not per-municipality — but
still sits behind the router's existing auth gate like every other `/v1/rip`
route.

### 4. Frontend — `pages/infra-board/rip-phases.catalog.ts` (new)

The full 9-phase content catalogue, lifted verbatim from
`docs/infra-beheer-handoff/reference/pb-phases.reference.jsx`'s
`PB_RIP_PHASES` / `PB_STAGES` (name, lead, roles, entry, exit, docs, gates,
krediet, weeks, bron, `beyond` for R5.2) — with the static `deploy` field
dropped, replaced by the computed status in §5. Each entry's
`processDefinitionKey` is merged in from `RIP_PHASE_KEYS` so that field has
exactly one author:

```ts
import { RIP_PHASE_KEYS } from '@ronl/shared';

export interface RipStage {
  code: string;
  name: string;
  color: string;
}
export const RIP_STAGES: RipStage[] = [
  { code: 'R2', name: 'Planvoorbereiding', color: '#0046ad' },
  { code: 'R3', name: 'Contractvorming', color: '#7a5af0' },
  { code: 'R4', name: 'Aanbesteding', color: '#b85c00' },
  { code: 'R5', name: 'Uitvoering', color: '#0a8e8e' },
];

export interface RipPhase {
  code: string;
  stage: string;
  name: string;
  lead: string;
  roles: string[];
  entry: string;
  exit: string;
  docs: string[];
  gates: string[];
  krediet: boolean;
  weeks: number;
  bron: string;
  processDefinitionKey?: string;
  /** No process model even planned (R5.2) — never counts as WIP. */
  beyond?: boolean;
}

const CONTENT: Omit<RipPhase, 'processDefinitionKey'>[] = [
  /* all 9 entries, content lifted from pb-phases.reference.jsx */
];

export const RIP_PHASES: RipPhase[] = CONTENT.map((c) => ({
  ...c,
  processDefinitionKey: RIP_PHASE_KEYS.find((k) => k.code === c.code)?.processDefinitionKey,
}));

export const ripPhaseByCode = (code: string): RipPhase | undefined =>
  RIP_PHASES.find((p) => p.code === code);
```

### 5. Frontend — deploy-status computation

Pure function, same file:

```ts
export type RipDeployStatus = 'gedeployed' | 'ontwerp' | 'onbekend';

export const RIP_DEPLOY_META: Record<
  RipDeployStatus,
  { label: string; short: string; color: string; can: boolean; note: string }
> = {
  gedeployed: {
    label: 'Gedeployed',
    short: 'LIVE',
    color: '#3fa535',
    can: true,
    note: 'Procesmodel gedeployed op deze Operaton-omgeving.',
  },
  ontwerp: {
    label: 'In ontwerp',
    short: 'ONTWERP',
    color: '#b85c00',
    can: false,
    note: 'Overzichtsplaat bekend, procesmodel nog niet gemodelleerd of nog niet gedeployed op deze omgeving.',
  },
  onbekend: {
    label: 'Niet gemodelleerd',
    short: 'N.V.T.',
    color: '#9aa1ab',
    can: false,
    note: 'Nog geen overzichtsplaat beschikbaar.',
  },
};

export function getPhaseDeployStatus(
  phase: RipPhase,
  deployedKeys: ReadonlySet<string>
): RipDeployStatus {
  if (phase.processDefinitionKey && deployedKeys.has(phase.processDefinitionKey)) {
    return 'gedeployed';
  }
  if (phase.beyond) return 'onbekend';
  return 'ontwerp';
}
```

This replaces the reference prototype's 4-state `live`/`test`/`ontwerp`/
`onbekend` model. Each environment (dev/acc/prod) only ever asks its own
Operaton instance, so "deployed here" is a single fact per environment — the
environment badge already shown in the dashboard header (e.g.
`test-infra-flevoland`) tells the admin which tier they're looking at. A
phase with a `processDefinitionKey` that Operaton doesn't (yet) report as
deployed on this environment still reads as `ontwerp` — same as not being
modelled at all, since neither is startable here.

### 6. Frontend — API call + hook

`packages/frontend/src/services/api.ts`, inside the existing `rip: { ... }`
namespace, matching `phase1Active()`'s shape:

```ts
deploymentStatus: async (): Promise<ApiResponse<{ deployedKeys: string[] }>> => {
  const response = await api.get('/rip/phases/deployment-status');
  return response.data;
},
```

`packages/frontend/src/services/infra.api.ts`, using the file's existing
`useAsync` helper:

```ts
export const useDeployedProcessKeys = () =>
  useAsync<{ deployedKeys: string[] }>(() => businessApi.rip.deploymentStatus(), []);
```

Consumers build `new Set(data?.deployedKeys ?? [])` and pass it to
`getPhaseDeployStatus`.

## Testing

- `operaton.service.test.ts` — `getDeployedProcessKeys`: correct
  `keysIn`/`latestVersion` params; returns only the subset Operaton reports
  as deployed, in the original input order; rethrows on failure.
- `rip.routes.test.ts` — `GET /phases/deployment-status`: 200 with
  `deployedKeys` from the service; 401 when unauthenticated; 500 with
  `DEPLOYMENT_STATUS_FAILED` when the service throws.
- `rip-phases.catalog.test.ts` (new) — catalogue shape: exactly 9 phases,
  codes/stages match `RIP-PHASES.md`'s table, R2.1 has
  `processDefinitionKey: 'RipPhase1Process'` and the other eight have none,
  R5.2 has `beyond: true`. `getPhaseDeployStatus` across its three branches:
  key present and deployed → `gedeployed`; key present but not deployed →
  `ontwerp`; no key, not `beyond` → `ontwerp`; `beyond: true` → `onbekend`
  regardless of `deployedKeys`.
- `infra.api.test.ts` — `useDeployedProcessKeys` resolves `deployedKeys` from
  the mocked `businessApi.rip.deploymentStatus()` call, following the file's
  existing hook-test conventions.

## Out of scope

- Any UI surface consuming this data (rail, KPIs, table, tabs) — B–F.
- Cross-environment deployment matrices (querying dev/acc/prod from a single
  request) — explicitly rejected; each environment only ever asks its own
  Operaton instance.
- Deriving `processDefinitionKey` from a naming convention — explicitly
  rejected; it's a static, manually-filled field per phase.
- Caching the deployment-status response.
- Role-gating the new backend route beyond standard auth — the existing
  `/v1/rip` routes don't role-check beyond auth+tenant, and this is
  read-only, non-sensitive engine metadata.
