# eDOCS per user through Entra ID — Implementation Plan (PR 1 and PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person's eDOCS call through RBA — over `/v1/edocs` or through the AI assistant — opens an eDOCS session with that person's own Entra ID token; machine clients keep the service account.

**Architecture:** Keycloak stores the brokered Entra tokens; a new `EntraTokenService` reads them from the broker token endpoint with the person's own Keycloak token and refreshes them at Entra. `EdocsService` keeps one session per principal (`service` or `user:<sub>`); a new `/v1/edocs` access middleware decides the principal per request. PR 2 passes the caseworker's token through the MCP chain in `_meta`, so the assistant's eDOCS tools reach `/v1/edocs` as that person.

**Tech Stack:** TypeScript, Express, axios, Jest + supertest (backend), MCP SDK, Keycloak 23 admin REST (bash + jq), OpenAPI 3 (`packages/backend/openapi/openapi.yaml`).

**Spec:** `docs/superpowers/specs/2026-10-01-edocs-per-user-entra-design.md`

**Out of scope here:** spec §6 (background attribution: `edocsAuthor` and the "namens …" text) — PR 3, planned separately once PR 1 is in. The attribution probe ran on 6 October 2026: the service account cannot set `AUTHOR_ID` to another user.

**Revised 2026-10-06** for RFC 9457 problem details (`81a6c49`, v2026.10.0) and the service account `testuser001`.

## Global Constraints

- Branches: PR 1 on `feat/edocs-per-user-entra` (holds the spec, commit `5c12151`); PR 2 on `feat/edocs-assistant-as-person`, created from `origin/acc` after PR 1 merges. Main checkout, no worktree.
- **Ask the user before every `git commit`.** Never `--no-verify`. Never merge into `acc`. Hand the user `npm test --workspace=@ronl/backend` per task and wait for their green before asking to commit.
- Never start, stop or restart the backend, frontend or Keycloak; ask the user.
- Tokens (Keycloak, Entra, eDOCS cookies) are never logged, never returned in a response, never written to disk or a database.
- Error codes, verbatim: `EDOCS_USER_TOKEN_UNAVAILABLE` (403), `EDOCS_REAUTH_REQUIRED` (401), `EDOCS_ACCESS_DENIED` (403), `EDOCS_CLIENT_NOT_ALLOWED` (403), `FORBIDDEN` (403), `EDOCS_ERROR` (502, unchanged).
- Settings, verbatim: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_IDP_ALIAS` (default `entra-flevoland`), `EDOCS_ALLOW_SERVICE_FALLBACK` (default `false`), `EDOCS_ALLOWED_CLIENTS`.
- Responses of `/v1/edocs` data routes carry `actingAs: 'user' | 'service'`.
- The service account stays `EDOCS_USER_ID` / `EDOCS_PASSWORD`: `testuser001` ("TestUser001 (voor iou)").
- Every refusal is a problem detail through `sendProblem(res, req, { status, code, detail })` from `@utils/problem` (`application/problem+json`); tests assert `res.body.code`, never `res.body.error.code`. OpenAPI error responses use `application/problem+json` with `#/components/schemas/Problem`.

## Rulings against the spec (made while planning)

1. **The exported `edocsService` singleton stays, and is the service principal.** The spec says "no unscoped call path". The worker and ValidSign archiving are service callers by design, so they keep calling `edocsService` unchanged; every `/v1/edocs` handler goes through the principal the middleware resolved. Cost if wrong: one rename (`edocsService.forService()`).
2. **`EDOCS_ALLOWED_CLIENTS` defaults to `edocs-mcp-client,copilot-studio-edocs,operaton-mcp-client`.** `test-edocs-live.sh`, `test-smoke-live.sh` and every ACC run authenticate as `operaton-mcp-client`; leaving it out would break them on merge. Narrowing is an App Setting. Cost if wrong: a setting. (Adopted into the spec on 2026-10-06.)
3. **Session expiry is the existing "reconnect once on 401/403", per principal**, not a timer from `SESSION_DURATION`: its unit is unverified. The value is recorded on connect for the live test. Cost if wrong: one extra failed request per expired session.
4. **The fallback's audit entry is a `logger.warn` with `audit: true`**, not a new audit-table row. Cost if wrong: a later call to the audit service.

## Review Focus

1. **A live tier without the `ENTRA_*` settings refuses to start after deploy** — expected: caught before merge, not on ACC. Pinned in Task 1 (config test) and Task 8 (ACC settings check before the PR merges).
2. **A person whose Entra session was revoked while their ID token is still cached** — expected: eDOCS rejects, one forced refresh, then `401 EDOCS_REAUTH_REQUIRED`, not a 502. Pinned in Task 3.
3. **Two people at the same time** — expected: user A's eDOCS cookies are never sent on user B's request. Pinned in Task 3.
4. **A token reaching a log line** — expected: none of the token values ever appears in a logger call. Pinned in Tasks 2 and 4.
5. **The existing smoke client after merge** — expected: `operaton-mcp-client` still gets `/v1/edocs` as the service. Pinned in Task 4.

---

## PR 1 — per-user eDOCS sessions for people

### Task 1: Configuration and startup checks

**Files:**

- Modify: `packages/backend/src/utils/config.ts` (types ~:136-148, values ~:330-350, `validateConfig` ~:465)
- Modify: `packages/backend/.env.example` (eDOCS block ~:92-119)
- Create: `packages/backend/src/utils/config.edocs.test.ts`

**Interfaces:**

- Produces: `config.entra: { tenantId: string; clientId: string; clientSecret: string; idpAlias: string }`; `config.edocs.allowServiceFallback: boolean`; `config.edocs.allowedClients: string[]`.

- [ ] **Step 1: Write the failing tests** — `config.edocs.test.ts`:

```ts
describe('config.edocs and config.entra', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD };
    // Required for validateConfig() which runs on import
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.EDOCS_STUB_MODE;
    delete process.env.EDOCS_ALLOW_SERVICE_FALLBACK;
    delete process.env.EDOCS_ALLOWED_CLIENTS;
    delete process.env.DEPLOYMENT_ENV;
  });
  afterEach(() => {
    process.env = OLD;
  });

  it('defaults: no fallback, the three known clients, the entra-flevoland alias', async () => {
    const { config } = await import('./config.js');
    expect(config.edocs.allowServiceFallback).toBe(false);
    expect(config.edocs.allowedClients).toEqual([
      'edocs-mcp-client',
      'copilot-studio-edocs',
      'operaton-mcp-client',
    ]);
    expect(config.entra.idpAlias).toBe('entra-flevoland');
  });

  it('parses EDOCS_ALLOWED_CLIENTS and the ENTRA_* settings', async () => {
    process.env.EDOCS_ALLOWED_CLIENTS = 'a, b';
    process.env.ENTRA_TENANT_ID = 't';
    process.env.ENTRA_CLIENT_ID = 'c';
    process.env.ENTRA_CLIENT_SECRET = 's';
    const { config } = await import('./config.js');
    expect(config.edocs.allowedClients).toEqual(['a', 'b']);
    expect(config.entra).toMatchObject({ tenantId: 't', clientId: 'c', clientSecret: 's' });
  });

  it('refuses live eDOCS without the service credentials and the ENTRA_* settings', async () => {
    process.env.EDOCS_STUB_MODE = 'false';
    process.env.EDOCS_USER_ID = '';
    process.env.EDOCS_PASSWORD = '';
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    await expect(import('./config.js')).rejects.toThrow(
      /EDOCS_USER_ID[\s\S]*EDOCS_PASSWORD[\s\S]*ENTRA_TENANT_ID[\s\S]*ENTRA_CLIENT_ID[\s\S]*ENTRA_CLIENT_SECRET/
    );
  });

  it('starts live eDOCS when everything is present', async () => {
    process.env.EDOCS_STUB_MODE = 'false';
    process.env.EDOCS_USER_ID = 'testuser001';
    process.env.EDOCS_PASSWORD = 'pw';
    process.env.ENTRA_TENANT_ID = 't';
    process.env.ENTRA_CLIENT_ID = 'c';
    process.env.ENTRA_CLIENT_SECRET = 's';
    const { config } = await import('./config.js');
    expect(config.edocs.stubMode).toBe(false);
  });

  it('refuses the service fallback on production, whatever the stub mode', async () => {
    process.env.EDOCS_ALLOW_SERVICE_FALLBACK = 'true';
    process.env.DEPLOYMENT_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.OPERATON_BASE_URL = 'http://x';
    await expect(import('./config.js')).rejects.toThrow(/EDOCS_ALLOW_SERVICE_FALLBACK/);
  });

  it('allows the service fallback outside production', async () => {
    process.env.EDOCS_ALLOW_SERVICE_FALLBACK = 'true';
    process.env.DEPLOYMENT_ENV = 'acceptance';
    const { config } = await import('./config.js');
    expect(config.edocs.allowServiceFallback).toBe(true);
  });
});
```

Note on the production test: `validateConfig` also checks `DATABASE_URL`/`OPERATON_BASE_URL` against `config.nodeEnv`, not `DEPLOYMENT_ENV`; they are set anyway so only the fallback error can fire.

- [ ] **Step 2: Run them to see them fail**

Run (from `packages/backend`): `npx jest src/utils/config.edocs.test.ts`
Expected: FAIL — `config.entra` is undefined, `allowServiceFallback` undefined, no rejection.

- [ ] **Step 3: Implement**

In the `Config` type, extend `edocs` and add `entra`:

```ts
  edocs: {
    baseUrl: string;
    library: string;
    userId: string;
    password: string;
    stubMode: boolean;
    department: string;
    /** People without an Entra token may fall back to the service account. Never on production. */
    allowServiceFallback: boolean;
    /** Machine clients (token `azp`) allowed on /v1/edocs. */
    allowedClients: string[];
  };
  /** Provincie Flevoland's Entra ID, for refreshing a person's brokered ID token. */
  entra: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    /** Keycloak identity-provider alias that brokers this tenant. */
    idpAlias: string;
  };
```

In the values, after `department` inside `edocs`:

```ts
    allowServiceFallback: parseEnvBool(process.env.EDOCS_ALLOW_SERVICE_FALLBACK, false),
    // operaton-mcp-client is the smoke-test and M2M client every live script and
    // ACC run authenticates as; leaving it out would break them on merge.
    allowedClients: parseEnvArray(process.env.EDOCS_ALLOWED_CLIENTS, [
      'edocs-mcp-client',
      'copilot-studio-edocs',
      'operaton-mcp-client',
    ]),
  },

  entra: {
    tenantId: process.env.ENTRA_TENANT_ID ?? '',
    clientId: process.env.ENTRA_CLIENT_ID ?? '',
    clientSecret: process.env.ENTRA_CLIENT_SECRET ?? '',
    idpAlias: process.env.ENTRA_IDP_ALIAS ?? 'entra-flevoland',
  },
```

(replace the closing `},` of the existing `edocs` block with the lines above.)

In `validateConfig()`, before `if (errors.length > 0)`:

```ts
// Live eDOCS needs the service account (machine callers, archiving) and the
// Entra client (refreshing a person's brokered ID token). Stub mode needs neither,
// so tests and local development keep starting with no eDOCS settings at all.
if (!config.edocs.stubMode) {
  if (!config.edocs.userId) errors.push('EDOCS_USER_ID is required when EDOCS_STUB_MODE=false');
  if (!config.edocs.password) errors.push('EDOCS_PASSWORD is required when EDOCS_STUB_MODE=false');
  if (!config.entra.tenantId) errors.push('ENTRA_TENANT_ID is required when EDOCS_STUB_MODE=false');
  if (!config.entra.clientId) errors.push('ENTRA_CLIENT_ID is required when EDOCS_STUB_MODE=false');
  if (!config.entra.clientSecret) {
    errors.push('ENTRA_CLIENT_SECRET is required when EDOCS_STUB_MODE=false');
  }
}

// A person must never silently act as the service account on production.
if (config.edocs.allowServiceFallback && config.deploymentEnv === 'production') {
  errors.push('EDOCS_ALLOW_SERVICE_FALLBACK=true is refused when DEPLOYMENT_ENV=production');
}
```

In `.env.example`, after `EDOCS_DEPARTMENT=IVR`:

```bash
# People act in eDOCS as themselves, with the Entra ID token Keycloak brokered at
# login (provider entra-flevoland). The backend refreshes that token at Entra, so it
# needs the same app registration Keycloak uses (IOU-demonstrator). Required when
# EDOCS_STUB_MODE=false.
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
# ENTRA_IDP_ALIAS=entra-flevoland
#
# A person without an Entra token (a Keycloak test account) is refused on
# /v1/edocs. true lets them fall back to the service account, visibly
# (actingAs: "service"). Refused on DEPLOYMENT_ENV=production.
EDOCS_ALLOW_SERVICE_FALLBACK=false
#
# Machine clients (token azp) allowed on /v1/edocs.
# EDOCS_ALLOWED_CLIENTS=edocs-mcp-client,copilot-studio-edocs,operaton-mcp-client
```

and change the comment above `EDOCS_USER_ID=` from "Service-account credentials." to "Service-account credentials (testuser001) — machine callers and archiving."

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx jest src/utils/config.edocs.test.ts src/utils/config.test.ts src/utils/config.validsign.test.ts`
Expected: PASS, all three files.

- [ ] **Step 5: Stage and ask to commit**

```bash
git add packages/backend/src/utils/config.ts packages/backend/src/utils/config.edocs.test.ts packages/backend/.env.example
```

Hand off `npm test --workspace=@ronl/backend`, wait for green, then ask. Message: `feat(config): settings for per-user eDOCS sessions through Entra ID`.

---

### Task 2: The Entra token service

**Files:**

- Create: `packages/backend/src/auth/entra-token.service.ts`
- Create: `packages/backend/src/auth/entra-token.service.test.ts`

**Interfaces:**

- Consumes: `config.keycloak.url`, `config.keycloak.realm`, `config.entra` (Task 1).
- Produces:
  - `class UserTokenUnavailableError extends Error { readonly code = 'EDOCS_USER_TOKEN_UNAVAILABLE' }`
  - `class ReauthRequiredError extends Error { readonly code = 'EDOCS_REAUTH_REQUIRED' }`
  - `class EntraTokenService { getIdToken(userSub: string, keycloakAccessToken: string, opts?: { forceRefresh?: boolean }): Promise<string>; forget(userSub: string): void }`
  - `export const entraTokenService: EntraTokenService`
  - `export function jwtExp(token: string): number`

- [ ] **Step 1: Write the failing tests** — `entra-token.service.test.ts`:

```ts
const mockConfig = {
  keycloak: { url: 'http://kc', realm: 'ronl' },
  entra: { tenantId: 'tid', clientId: 'cid', clientSecret: 'csecret', idpAlias: 'entra-flevoland' },
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));

import type { AxiosInstance } from 'axios';
import {
  EntraTokenService,
  ReauthRequiredError,
  UserTokenUnavailableError,
  jwtExp,
} from './entra-token.service';

const NOW = 1_800_000_000_000; // ms
const jwt = (exp: number, tag = 'x') =>
  ['h', Buffer.from(JSON.stringify({ exp, tag })).toString('base64url'), 'sig'].join('.');
const valid = (tag: string) => jwt(NOW / 1000 + 3600, tag);
const expired = (tag: string) => jwt(NOW / 1000 - 10, tag);

function make(maxEntries = 500) {
  const http = { get: jest.fn(), post: jest.fn() };
  const svc = new EntraTokenService(http as unknown as AxiosInstance, () => NOW, maxEntries);
  return { http, svc };
}
const httpError = (status: number, data: unknown = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

beforeEach(() => jest.clearAllMocks());

describe('jwtExp', () => {
  it('reads exp, and answers 0 for garbage', () => {
    expect(jwtExp(jwt(123))).toBe(123);
    expect(jwtExp('not-a-jwt')).toBe(0);
  });
});

describe('EntraTokenService', () => {
  it('reads the stored token from the broker endpoint with the person’s own Keycloak token', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: valid('a'), refresh_token: 'r1' } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
    expect(http.get).toHaveBeenCalledWith('http://kc/realms/ronl/broker/entra-flevoland/token', {
      headers: { Authorization: 'Bearer kc-a' },
    });
  });

  it('accepts the stored token response as a JSON string too', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: JSON.stringify({ id_token: valid('a') }) });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
  });

  it('caches per user: a second call does not ask Keycloak again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: valid('a'), refresh_token: 'r1' } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-a', 'kc-a');
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('never gives user A the token of user B', async () => {
    const { http, svc } = make();
    http.get
      .mockResolvedValueOnce({ data: { id_token: valid('a') } })
      .mockResolvedValueOnce({ data: { id_token: valid('b') } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
    await expect(svc.getIdToken('sub-b', 'kc-b')).resolves.toBe(valid('b'));
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
  });

  it('refreshes an expired ID token at Entra with the client secret', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post.mockResolvedValue({ data: { id_token: valid('new'), refresh_token: 'r2' } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('new'));
    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('https://login.microsoftonline.com/tid/oauth2/v2.0/token');
    const form = new URLSearchParams(body as string);
    expect(Object.fromEntries(form)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: 'cid',
      client_secret: 'csecret',
      scope: 'openid profile email offline_access',
    });
  });

  it('keeps the old refresh token when Entra does not rotate it', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post
      .mockResolvedValueOnce({ data: { id_token: expired('mid') } })
      .mockResolvedValueOnce({ data: { id_token: valid('new') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-a', 'kc-a');
    expect(new URLSearchParams(http.post.mock.calls[1][1] as string).get('refresh_token')).toBe(
      'r1'
    );
  });

  it('forceRefresh refreshes a still-valid token', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: valid('a'), refresh_token: 'r1' } });
    http.post.mockResolvedValue({ data: { id_token: valid('fresh') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await expect(svc.getIdToken('sub-a', 'kc-a', { forceRefresh: true })).resolves.toBe(
      valid('fresh')
    );
  });

  it.each([400, 401, 403, 404])(
    'a %d from the broker endpoint means no stored token',
    async (status) => {
      const { http, svc } = make();
      http.get.mockRejectedValue(httpError(status));
      await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(
        UserTokenUnavailableError
      );
    }
  );

  it('a stored response without an id_token means no stored token', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { access_token: 'graph-only' } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(UserTokenUnavailableError);
  });

  it('a 5xx from the broker endpoint is not mistaken for a missing token', async () => {
    const { http, svc } = make();
    http.get.mockRejectedValue(httpError(503));
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toThrow('HTTP 503');
  });

  it('a refused refresh means sign in again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post.mockRejectedValue(httpError(400, { error: 'invalid_grant' }));
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('an expired token with no refresh token means sign in again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old') } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('evicts the oldest user beyond the bound', async () => {
    const { http, svc } = make(1);
    http.get
      .mockResolvedValueOnce({ data: { id_token: valid('a') } })
      .mockResolvedValueOnce({ data: { id_token: valid('b') } })
      .mockResolvedValueOnce({ data: { id_token: valid('a2') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-b', 'kc-b');
    await svc.getIdToken('sub-a', 'kc-a');
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  it('never puts a token in a log line (Review Focus 4)', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r-secret' } });
    http.post.mockRejectedValue(httpError(400, { error: 'invalid_grant' }));
    await svc.getIdToken('sub-a', 'kc-secret').catch(() => undefined);
    const logged = JSON.stringify([
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
      mockLogger.debug.mock.calls,
    ]);
    for (const secret of ['kc-secret', 'r-secret', expired('old'), 'csecret']) {
      expect(logged).not.toContain(secret);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest src/auth/entra-token.service.test.ts`
Expected: FAIL — `Cannot find module './entra-token.service'`.

- [ ] **Step 3: Implement** — `entra-token.service.ts`:

```ts
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('entra-token');

/** The person has no Entra ID token stored in Keycloak (e.g. a Keycloak-native test account). */
export class UserTokenUnavailableError extends Error {
  readonly code = 'EDOCS_USER_TOKEN_UNAVAILABLE';
  constructor(message = 'No Entra ID token is stored for this user') {
    super(message);
    this.name = 'UserTokenUnavailableError';
  }
}

/** The stored Entra session can no longer be refreshed; the person must sign in again. */
export class ReauthRequiredError extends Error {
  readonly code = 'EDOCS_REAUTH_REQUIRED';
  constructor(message = 'The Entra ID session can no longer be refreshed') {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

interface EntraTokens {
  idToken: string;
  /** `exp` of the ID token, seconds since epoch. */
  idTokenExp: number;
  refreshToken?: string;
}

/** `exp` of a JWT in seconds since epoch; 0 when absent or unreadable. Not a verification. */
export function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    return typeof payload?.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

function toTokens(body: unknown): EntraTokens | null {
  let data: unknown = body;
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
  }
  const record = (data ?? {}) as { id_token?: unknown; refresh_token?: unknown };
  if (typeof record.id_token !== 'string' || !record.id_token) return null;
  const refreshToken =
    typeof record.refresh_token === 'string' && record.refresh_token
      ? record.refresh_token
      : undefined;
  return { idToken: record.id_token, idTokenExp: jwtExp(record.id_token), refreshToken };
}

const status = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

/** Seconds of remaining validity below which a cached ID token is refreshed first. */
const MIN_VALIDITY_MS = 60_000;

/**
 * Gives a person's Entra ID token for eDOCS (X-DM-AUTH).
 *
 * Keycloak stores the token response it received when it brokered the person's
 * Entra login (provider `config.entra.idpAlias`, storeToken). The broker token
 * endpoint returns it only to that person — it is called with their own Keycloak
 * token — so this service can never read someone else's. Keycloak does not refresh
 * stored tokens; an expired ID token is refreshed here, at Entra, with the stored
 * refresh token and the same app registration Keycloak uses. Refreshed tokens are
 * kept in memory only (Keycloak's stored copy is not updated).
 *
 * Tokens never reach a log line.
 */
export class EntraTokenService {
  private readonly cache = new Map<string, EntraTokens>();

  constructor(
    private readonly http: AxiosInstance = axios.create({ timeout: 10_000 }),
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 500
  ) {}

  async getIdToken(
    userSub: string,
    keycloakAccessToken: string,
    opts: { forceRefresh?: boolean } = {}
  ): Promise<string> {
    let tokens = this.cache.get(userSub);
    if (!tokens) {
      tokens = await this.readStored(keycloakAccessToken);
      this.remember(userSub, tokens);
    }
    if (!opts.forceRefresh && tokens.idTokenExp * 1000 - this.now() > MIN_VALIDITY_MS) {
      return tokens.idToken;
    }
    if (!tokens.refreshToken) {
      this.cache.delete(userSub);
      throw new ReauthRequiredError('No refresh token is stored for this user');
    }
    const refreshed = await this.refresh(tokens.refreshToken).catch((err: unknown) => {
      this.cache.delete(userSub);
      throw err;
    });
    this.remember(userSub, {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    });
    return refreshed.idToken;
  }

  forget(userSub: string): void {
    this.cache.delete(userSub);
  }

  private remember(userSub: string, tokens: EntraTokens): void {
    this.cache.delete(userSub);
    this.cache.set(userSub, tokens);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  private async readStored(keycloakAccessToken: string): Promise<EntraTokens> {
    const url = `${config.keycloak.url}/realms/${config.keycloak.realm}/broker/${config.entra.idpAlias}/token`;
    let response;
    try {
      response = await this.http.get(url, {
        headers: { Authorization: `Bearer ${keycloakAccessToken}` },
      });
    } catch (err) {
      const code = status(err);
      if (code !== undefined && code >= 400 && code < 500) {
        logger.info('No stored Entra token for this user', { status: code });
        throw new UserTokenUnavailableError();
      }
      throw err;
    }
    const tokens = toTokens(response.data);
    if (!tokens) {
      throw new UserTokenUnavailableError('The stored Entra token response carries no id_token');
    }
    return tokens;
  }

  private async refresh(refreshToken: string): Promise<EntraTokens> {
    const url = `https://login.microsoftonline.com/${config.entra.tenantId}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.entra.clientId,
      client_secret: config.entra.clientSecret,
      scope: 'openid profile email offline_access',
    });
    let response;
    try {
      response = await this.http.post(url, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      const code = status(err);
      if (code === 400 || code === 401) {
        const error = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        logger.warn('Entra refused to refresh the ID token', { status: code, error });
        throw new ReauthRequiredError();
      }
      throw err;
    }
    const tokens = toTokens(response.data);
    if (!tokens) throw new ReauthRequiredError('Entra refreshed without an id_token');
    return tokens;
  }
}

export const entraTokenService = new EntraTokenService();
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx jest src/auth/entra-token.service.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Stage and ask to commit**

```bash
git add packages/backend/src/auth/entra-token.service.ts packages/backend/src/auth/entra-token.service.test.ts
```

Hand off `npm test --workspace=@ronl/backend`; then ask. Message: `feat(auth): read and refresh a person's brokered Entra ID token`.

---

### Task 3: Per-principal eDOCS sessions

**Files:**

- Modify: `packages/backend/src/services/edocs.service.ts`
- Modify: `packages/backend/src/services/edocs.service.test.ts`

**Interfaces:**

- Consumes: `UserTokenUnavailableError`, `ReauthRequiredError` (Task 2).
- Produces:
  - `type EdocsUserPrincipal = { kind: 'user'; sub: string; email?: string; getIdToken: (opts?: { forceRefresh?: boolean }) => Promise<string> }`
  - `type EdocsPrincipal = { kind: 'service' } | EdocsUserPrincipal`
  - `class EdocsAccessDeniedError extends Error { readonly code = 'EDOCS_ACCESS_DENIED' }`
  - `EdocsService#forUser(p: Omit<EdocsUserPrincipal, 'kind'>): EdocsService`
  - `EdocsService#forService(): EdocsService`
  - `EdocsService#actingAs: 'user' | 'service'` (getter)
  - `EdocsService#probeUser(): Promise<{ authenticated: boolean; edocsUserId?: string; error?: string }>`
  - `export function lookupEdocsUserId(email: string): string | undefined` (filled by every user connect; PR 3 reads it)
  - `edocsService` — unchanged export, the service principal.

- [ ] **Step 1: Write the failing tests** — append to `edocs.service.test.ts`:

```ts
import { ReauthRequiredError, UserTokenUnavailableError } from '@auth/entra-token.service';
import { EdocsAccessDeniedError, lookupEdocsUserId } from './edocs.service';

/** The interceptor the most recently constructed client registered. */
function lastInterceptor() {
  const calls = mockClient.interceptors.request.use.mock.calls;
  return calls[calls.length - 1][0] as (c: { headers: Record<string, string> }) => {
    headers: Record<string, string>;
  };
}

const userConnectResponse = (userId = 'GORTS01') => ({
  ...connectResponse,
  data: { data: { USER_ID: userId, SESSION_DURATION: 480 } },
});

describe('EdocsService — per-user sessions', () => {
  let service: EdocsService;
  beforeEach(() => {
    mockConfig.edocs.stubMode = false;
    service = new EdocsService();
  });

  const userClient = (sub: string, token = `id-${sub}`) =>
    service.forUser({
      sub,
      email: `${sub}@flevoland.nl`,
      getIdToken: jest.fn().mockResolvedValue(token),
    });

  it('connects a person with X-DM-AUTH and no password', async () => {
    mockClient.post.mockResolvedValueOnce(userConnectResponse());
    mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } });
    const user = userClient('a', 'id-token-a');
    await user.listWorkspaces();
    const [path, body, opts] = mockClient.post.mock.calls[0];
    expect(path).toBe('connect');
    expect(body.data).toMatchObject({ library: 'DOCUVITT', timezone: 'Europe/Amsterdam' });
    expect(body.data).not.toHaveProperty('userid');
    expect(body.data).not.toHaveProperty('password');
    expect(opts).toMatchObject({
      headers: { 'X-DM-AUTH': 'id-token-a' },
      params: { library: 'DOCUVITT' },
    });
    expect(user.actingAs).toBe('user');
  });

  it('records the eDOCS USER_ID for the person’s e-mail', async () => {
    mockClient.post.mockResolvedValueOnce(userConnectResponse('GORTS01'));
    mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } });
    await userClient('steven.gort').listWorkspaces();
    expect(lookupEdocsUserId('steven.gort@flevoland.nl')).toBe('GORTS01');
  });

  it('keeps the service session and a person’s session apart', async () => {
    mockClient.post.mockResolvedValueOnce(connectResponse); // service
    mockClient.get.mockResolvedValue({ data: { data: { list: [] } } });
    await service.listWorkspaces();
    const user = userClient('a');
    mockClient.post.mockResolvedValueOnce({
      ...userConnectResponse(),
      headers: { 'set-cookie': ['X-DM-DST=dst-user-a; Path=/'] },
    });
    await user.listWorkspaces();
    expect(mockClient.post).toHaveBeenCalledTimes(2); // each principal connected once
    expect(lastInterceptor()({ headers: {} }).headers['X-DM-DST']).toBe('dst-user-a');
  });

  it('never sends user A’s cookies on user B’s request (Review Focus 3)', async () => {
    mockClient.get.mockResolvedValue({ data: { data: { list: [] } } });
    const a = userClient('a');
    mockClient.post.mockResolvedValueOnce({
      ...userConnectResponse('A'),
      headers: { 'set-cookie': ['X-DM-DST=dst-a; Path=/'] },
    });
    await a.listWorkspaces();
    const interceptorA = lastInterceptor();
    const b = userClient('b');
    mockClient.post.mockResolvedValueOnce({
      ...userConnectResponse('B'),
      headers: { 'set-cookie': ['X-DM-DST=dst-b; Path=/'] },
    });
    await b.listWorkspaces();
    const interceptorB = lastInterceptor();
    expect(interceptorA({ headers: {} }).headers['X-DM-DST']).toBe('dst-a');
    expect(interceptorB({ headers: {} }).headers['X-DM-DST']).toBe('dst-b');
  });

  it('a derived client for the same person reuses that person’s session', async () => {
    mockClient.get.mockResolvedValue({ data: { data: { list: [] } } });
    mockClient.post.mockResolvedValueOnce(userConnectResponse());
    await userClient('a').listWorkspaces();
    await userClient('a').listWorkspaces();
    expect(mockClient.post).toHaveBeenCalledTimes(1);
  });

  it('sends the CSRF token as a header as well as a cookie', async () => {
    mockClient.post.mockResolvedValueOnce(userConnectResponse());
    mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } });
    await userClient('a').listWorkspaces();
    const headers = lastInterceptor()({ headers: {} }).headers;
    expect(headers['X-DM-CSRF-TOKEN']).toBe('csrf-xyz-789');
    expect(headers['Cookie']).toContain('X-DM-CSRF-TOKEN=csrf-xyz-789');
  });

  it('on a 401 it reconnects with a forced-fresh ID token, then retries', async () => {
    const getIdToken = jest.fn().mockResolvedValue('id-a');
    const user = service.forUser({ sub: 'a', getIdToken });
    mockClient.post.mockResolvedValue(userConnectResponse());
    mockClient.get
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: { data: { list: [{ id: 'w' }] } } });
    await expect(user.listWorkspaces()).resolves.toEqual([{ id: 'w' }]);
    expect(getIdToken).toHaveBeenNthCalledWith(1, {});
    expect(getIdToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it('eDOCS refusing a person’s token is an EdocsAccessDeniedError', async () => {
    mockClient.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { ERROR: { rapi_code: 13, rapi_details: ['Access not allowed'] } },
      },
    });
    await expect(userClient('a').listWorkspaces()).rejects.toBeInstanceOf(EdocsAccessDeniedError);
  });

  it('a revoked session ends in ReauthRequiredError, not an upstream error (Review Focus 2)', async () => {
    const getIdToken = jest
      .fn()
      .mockResolvedValueOnce('id-cached')
      .mockRejectedValueOnce(new ReauthRequiredError());
    const user = service.forUser({ sub: 'a', getIdToken });
    mockClient.post.mockResolvedValueOnce(userConnectResponse());
    mockClient.get.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(user.listWorkspaces()).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('passes a missing token straight through', async () => {
    const user = service.forUser({
      sub: 'a',
      getIdToken: jest.fn().mockRejectedValue(new UserTokenUnavailableError()),
    });
    await expect(user.listWorkspaces()).rejects.toBeInstanceOf(UserTokenUnavailableError);
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it('probeUser reports the person’s eDOCS user, or why not', async () => {
    mockClient.post.mockResolvedValueOnce(userConnectResponse('GORTS01'));
    await expect(userClient('a').probeUser()).resolves.toEqual({
      authenticated: true,
      edocsUserId: 'GORTS01',
    });
    mockClient.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { ERROR: { message: '', rapi_details: ['Access not allowed'] } },
      },
    });
    await expect(userClient('z').probeUser()).resolves.toEqual({
      authenticated: false,
      error: 'Access not allowed',
    });
  });

  it('forService returns a service client; the default instance is the service', () => {
    expect(service.actingAs).toBe('service');
    expect(userClient('a').forService().actingAs).toBe('service');
  });
});

describe('EdocsService — per-user sessions, stub mode', () => {
  it('a person gets a stub session and the STUB-USER id without any network call', async () => {
    mockConfig.edocs.stubMode = true;
    const user = new EdocsService().forUser({ sub: 'a', getIdToken: jest.fn() });
    await expect(user.probeUser()).resolves.toEqual({
      authenticated: true,
      edocsUserId: 'STUB-USER',
    });
    expect(mockClient.post).not.toHaveBeenCalled();
  });
});
```

Also add `jest.mock('@auth/entra-token.service', () => jest.requireActual('@auth/entra-token.service'));` is **not** needed — the real error classes are imported; the module's `entraTokenService` singleton is never called here. But the module imports `@utils/config` and `@utils/logger`, both already mocked in this file, so importing it is safe.

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest src/services/edocs.service.test.ts`
Expected: FAIL — `forUser` is not a function; `EdocsAccessDeniedError`/`lookupEdocsUserId` not exported. The existing tests still pass.

- [ ] **Step 3: Implement** — in `edocs.service.ts`:

3a. Imports and new types, after the existing imports:

```ts
import { ReauthRequiredError, UserTokenUnavailableError } from '@auth/entra-token.service';
```

and after `EdocsDownloadResult`:

```ts
export interface EdocsUserPrincipal {
  kind: 'user';
  /** Keycloak `sub` — the session key. */
  sub: string;
  /** For recording `email → eDOCS USER_ID` (PR 3 attribution). */
  email?: string;
  /** The person's Entra ID token for X-DM-AUTH. `forceRefresh` after eDOCS rejected a session. */
  getIdToken: (opts?: { forceRefresh?: boolean }) => Promise<string>;
}
export type EdocsPrincipal = { kind: 'service' } | EdocsUserPrincipal;

/** eDOCS refused a person's Entra token (not an expired session). */
export class EdocsAccessDeniedError extends Error {
  readonly code = 'EDOCS_ACCESS_DENIED';
  constructor(message: string) {
    super(message);
    this.name = 'EdocsAccessDeniedError';
  }
}

interface EdocsSession {
  /** "X-DM-DST=…; X-DM-CSRF-TOKEN=…" */
  cookies: string;
  /** eDOCS USER_ID, for a person's session. */
  edocsUserId?: string;
}

/** Sessions per principal key ('service' | 'user:<sub>'), bounded, oldest evicted first. */
class EdocsSessionStore {
  private readonly sessions = new Map<string, EdocsSession>();
  constructor(private readonly maxEntries = 500) {}
  get(key: string): EdocsSession | undefined {
    return this.sessions.get(key);
  }
  set(key: string, session: EdocsSession): void {
    this.sessions.delete(key);
    this.sessions.set(key, session);
    if (this.sessions.size > this.maxEntries) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest);
    }
  }
  delete(key: string): void {
    this.sessions.delete(key);
  }
}

// email (lower case) → eDOCS USER_ID, learned from every person's connect. Bounded.
const edocsUserIds = new Map<string, string>();
const MAX_KNOWN_USERS = 2000;

function rememberEdocsUser(email: string, userId: string): void {
  const key = email.toLowerCase();
  edocsUserIds.delete(key);
  edocsUserIds.set(key, userId);
  if (edocsUserIds.size > MAX_KNOWN_USERS) {
    const oldest = edocsUserIds.keys().next().value;
    if (oldest !== undefined) edocsUserIds.delete(oldest);
  }
}

/** The eDOCS USER_ID last seen for this e-mail address, if any person connected with it. */
export function lookupEdocsUserId(email: string): string | undefined {
  return edocsUserIds.get(email.toLowerCase());
}

/**
 * InfoCenter's connect body carries the client's time zone. The backend runs in
 * UTC on Azure, so the offset is computed for Europe/Amsterdam, not taken from the
 * process: -120 in summer, -60 in winter (the sign of Date#getTimezoneOffset).
 */
function amsterdamTimeZone(at = new Date()): {
  tzOffset: number;
  timezone: string;
  tzDST: boolean;
} {
  const local = new Date(at.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzOffset = Math.round((utc.getTime() - local.getTime()) / 60_000);
  return { tzOffset, timezone: 'Europe/Amsterdam', tzDST: tzOffset === -120 };
}
```

3b. In the class: replace the field `private sessionToken: string | null = null;` with:

```ts
  private readonly principal: EdocsPrincipal;
  private readonly store: EdocsSessionStore;
```

and replace the constructor signature `constructor() {` with:

```ts
  /**
   * Without arguments: the service principal with its own session store — the
   * exported singleton, and what the archiving callers use. A person's client is
   * derived with forUser() and shares the singleton's store.
   */
  constructor(principal: EdocsPrincipal = { kind: 'service' }, store = new EdocsSessionStore()) {
    this.principal = principal;
    this.store = store;
```

3c. Add, right after the constructor:

```ts
  private get sessionKey(): string {
    return this.principal.kind === 'service' ? 'service' : `user:${this.principal.sub}`;
  }

  private get sessionToken(): string | null {
    return this.store.get(this.sessionKey)?.cookies ?? null;
  }

  private set sessionToken(cookies: string | null) {
    if (cookies === null) this.store.delete(this.sessionKey);
    else this.store.set(this.sessionKey, { ...this.store.get(this.sessionKey), cookies });
  }

  private get edocsUserId(): string | undefined {
    return this.store.get(this.sessionKey)?.edocsUserId;
  }

  get actingAs(): 'user' | 'service' {
    return this.principal.kind;
  }

  /** A client acting as this person. Shares this instance's session store. */
  forUser(principal: Omit<EdocsUserPrincipal, 'kind'>): EdocsService {
    return new EdocsService({ kind: 'user', ...principal }, this.store);
  }

  /** A client acting as the service account. */
  forService(): EdocsService {
    return this.principal.kind === 'service' ? this : new EdocsService({ kind: 'service' }, this.store);
  }
```

3d. In the request interceptor, after the `X-DM-DST` header block, add:

```ts
const csrfValue = this.sessionToken
  .split('; ')
  .find((c) => c.startsWith('X-DM-CSRF-TOKEN='))
  ?.split('=')[1];
if (csrfValue) {
  cfg.headers['X-DM-CSRF-TOKEN'] = csrfValue;
}
```

(The getter makes the existing `if (this.sessionToken)` block read the principal's own session.)

3e. Replace `connect()` entirely:

```ts
  private async connect(opts: { forceRefresh?: boolean } = {}): Promise<void> {
    const principal = this.principal;
    if (this.stubMode) {
      this.sessionToken = 'stub-session-token';
      if (principal.kind === 'user') {
        this.store.set(this.sessionKey, { cookies: 'stub-session-token', edocsUserId: 'STUB-USER' });
      }
      return;
    }

    logger.info('Connecting to eDOCS DM Server', {
      baseUrl: config.edocs.baseUrl,
      library: config.edocs.library,
      as: principal.kind === 'user' ? 'user' : config.edocs.userId,
    });

    let response;
    try {
      if (principal.kind === 'user') {
        // Throws UserTokenUnavailableError / ReauthRequiredError untouched — no
        // `response` on those, so the catch below passes them through.
        const idToken = await principal.getIdToken(opts);
        response = await this.client.post(
          'connect',
          { data: { library: config.edocs.library, ...amsterdamTimeZone() } },
          { params: { library: config.edocs.library }, headers: { 'X-DM-AUTH': idToken } }
        );
      } else {
        response = await this.client.post('connect', {
          data: {
            userid: config.edocs.userId,
            password: config.edocs.password,
            library: config.edocs.library,
          },
        });
      }
    } catch (err) {
      this.logUpstreamError('connect', err);
      if (principal.kind === 'user' && (err as { response?: unknown })?.response) {
        throw new EdocsAccessDeniedError(this.upstreamMessage(err));
      }
      throw err;
    }

    const setCookies = response.headers['set-cookie'] ?? [];
    const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
    const findCookie = (name: string): string | undefined => {
      const match = cookieArray.find((c) => c.startsWith(`${name}=`));
      return match?.split(';')[0]; // returns "NAME=VALUE"
    };
    const dmDst = findCookie('X-DM-DST');
    const dmCsrf = findCookie('X-DM-CSRF-TOKEN');
    if (!dmDst) {
      throw new Error('eDOCS connect() succeeded but X-DM-DST cookie was absent from response');
    }

    const cookies = [dmDst, dmCsrf].filter(Boolean).join('; ');
    if (principal.kind === 'user') {
      const sessionData = (response.data?.data ?? {}) as { USER_ID?: unknown; SESSION_DURATION?: unknown };
      const edocsUserId = typeof sessionData.USER_ID === 'string' ? sessionData.USER_ID : undefined;
      this.store.set(this.sessionKey, { cookies, edocsUserId });
      if (edocsUserId && principal.email) rememberEdocsUser(principal.email, edocsUserId);
      logger.info('Connected to eDOCS as a person', {
        edocsUserId,
        sessionDuration: sessionData.SESSION_DURATION,
      });
    } else {
      this.sessionToken = cookies;
      logger.info('Connected to eDOCS — session token cached');
    }
  }
```

3f. In `withAuth`, replace `await this.connect();` (the reconnect inside the 401/403 branch) with:

```ts
await this.connect({ forceRefresh: this.principal.kind === 'user' });
```

and in `ensureConnected` leave `await this.connect();` as it is (the first connect never forces a refresh).

3g. After `healthCheck()`, add:

```ts
  /** Can an eDOCS session be opened as this person? For /v1/edocs/status. */
  async probeUser(): Promise<{ authenticated: boolean; edocsUserId?: string; error?: string }> {
    if (this.principal.kind !== 'user') throw new Error('probeUser() needs a person’s client');
    try {
      await this.ensureConnected();
      return { authenticated: true, edocsUserId: this.edocsUserId };
    } catch (err) {
      if (err instanceof UserTokenUnavailableError || err instanceof ReauthRequiredError) {
        return { authenticated: false, error: err.code };
      }
      return {
        authenticated: false,
        error: err instanceof EdocsAccessDeniedError ? err.message : this.upstreamMessage(err),
      };
    }
  }
```

3h. Update the class doc comment's "Authentication" paragraph to:

```ts
 * Authentication — one session per principal:
 *   service → POST /connect {userid, password} (EDOCS_USER_ID, a service account)
 *   person  → POST /connect with their Entra ID token in X-DM-AUTH (no password)
 *   Each yields X-DM-DST (+ X-DM-CSRF-TOKEN), kept in a shared, bounded store keyed
 *   'service' or 'user:<sub>'. A 401/403 reconnects once — for a person with a
 *   forced-fresh ID token — and retries.
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx jest src/services/edocs.service.test.ts`
Expected: PASS — the existing tests unchanged plus 13 new. If an existing test reads `mock.calls[0][0]` of the interceptor after constructing a second client, switch it to `lastInterceptor()`.

- [ ] **Step 5: Run the callers' tests**

Run: `npx jest src/services/externalTaskWorker.service.test.ts src/services/validsignCompletion.service.test.ts`
Expected: PASS — both mock `edocsService` and call it unchanged (ruling 1).

- [ ] **Step 6: Stage and ask to commit**

```bash
git add packages/backend/src/services/edocs.service.ts packages/backend/src/services/edocs.service.test.ts
```

Hand off `npm test --workspace=@ronl/backend`; then ask. Message: `feat(edocs): one session per principal, with a person's Entra token in X-DM-AUTH`.

---

### Task 4: The `/v1/edocs` access middleware and routes

**Files:**

- Modify: `packages/backend/src/auth/jwt.middleware.ts` (~:150-157), `packages/backend/src/types/auth.types.ts` (`AuthContext`)
- Modify: `packages/backend/src/auth/jwt.middleware.test.ts`
- Create: `packages/backend/src/routes/edocs.access.ts`, `packages/backend/src/routes/edocs.access.test.ts`
- Modify: `packages/backend/src/routes/edocs.routes.ts`, `packages/backend/src/routes/edocs.routes.test.ts`
- Modify: `packages/backend/openapi/openapi.yaml` (the ten `/edocs…` operations, ~:3031-3410; `components/responses`)
- Regenerate: `packages/backend/openapi/openapi.json`

**Interfaces:**

- Consumes: `entraTokenService`, the two errors (Task 2); `edocsService`, `EdocsService`, `EdocsAccessDeniedError` (Task 3); `config.edocs.allowedClients`, `config.edocs.allowServiceFallback`, `config.keycloak.clientId` (`'ronl-business-api'`).
- Produces: `req.auth.token`; `edocsAccess`, `requireEdocsPrincipal`, `sendEdocsError(req, res, error, message)`; `req.edocs`, `req.edocsActingAs`, `req.edocsUserProblem`.

- [ ] **Step 1: Keep the raw bearer token on `req.auth` (test first)**

In `jwt.middleware.test.ts`, in the test that asserts `toMatchObject({ azp: 'ronl-frontend', ipAddress: '2.2.2.2' })` (~:104), add after it:

```ts
expect(req.auth?.token).toBe(validToken);
```

where `validToken` is the bearer string that test sends (use the variable the test already passes in the `Authorization` header; if it inlines the string, extract it to a `const validToken`). Run `npx jest src/auth/jwt.middleware.test.ts` — FAIL (`undefined`).

Then in `auth.types.ts`, add to `AuthContext`:

```ts
  /** The raw bearer token, for calls made on the person's behalf (Keycloak broker endpoint). Never log it. */
  token?: string;
```

and in `jwt.middleware.ts`, inside `req.auth = { … }`, add `token,` after `azp: payload.azp,`. Re-run — PASS.

- [ ] **Step 2: Write the failing middleware tests** — `edocs.access.test.ts`:

```ts
const mockConfig = {
  keycloak: { clientId: 'ronl-business-api' },
  edocs: {
    stubMode: false,
    allowServiceFallback: false,
    allowedClients: ['edocs-mcp-client', 'copilot-studio-edocs', 'operaton-mcp-client'],
    userId: 'testuser001',
  },
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockGetIdToken = jest.fn();
const mockForUser = jest.fn((p: unknown) => ({ actingAs: 'user', principal: p }));
const mockService = { actingAs: 'service', forUser: mockForUser };

jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));
jest.mock('@auth/entra-token.service', () => {
  const actual = jest.requireActual('@auth/entra-token.service');
  return {
    ...actual,
    entraTokenService: { getIdToken: (...a: unknown[]) => mockGetIdToken(...a) },
  };
});
jest.mock('@services/edocs.service', () => {
  class EdocsAccessDeniedError extends Error {
    readonly code = 'EDOCS_ACCESS_DENIED';
  }
  return { edocsService: mockService, EdocsAccessDeniedError };
});

import type { Request, Response, NextFunction } from 'express';
import { ReauthRequiredError, UserTokenUnavailableError } from '@auth/entra-token.service';
import { EdocsAccessDeniedError } from '@services/edocs.service';
import { edocsAccess, requireEdocsPrincipal, sendEdocsError } from './edocs.access';

function res() {
  const r = { statusCode: 200, body: undefined as unknown } as Response & { body: unknown };
  r.status = jest.fn((c: number) => {
    r.statusCode = c;
    return r;
  }) as unknown as Response['status'];
  r.type = jest.fn(() => r) as unknown as Response['type'];
  r.json = jest.fn((b: unknown) => {
    r.body = b;
    return r;
  }) as unknown as Response['json'];
  return r;
}
const anyReq = { originalUrl: '/v1/edocs/workspaces' } as unknown as Request;
const person = (roles: string[] = ['caseworker']) =>
  ({
    path: '/workspaces',
    user: { userId: 'sub-a', roles, email: 'a@flevoland.nl', preferredUsername: 'a@flevoland.nl' },
    auth: { azp: 'ronl-business-api', token: 'kc-a' },
  }) as unknown as Request;
const machine = (azp: string) =>
  ({
    path: '/workspaces',
    user: { userId: 'svc', roles: [] },
    auth: { azp },
  }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.edocs.stubMode = false;
  mockConfig.edocs.allowServiceFallback = false;
});

describe('edocsAccess', () => {
  it('a listed machine client acts as the service (Review Focus 5)', async () => {
    const req = machine('operaton-mcp-client');
    const next = jest.fn();
    await edocsAccess(req, res(), next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.edocs).toBe(mockService);
    expect(req.edocsActingAs).toBe('service');
  });

  it('an unlisted machine client gets 403 EDOCS_CLIENT_NOT_ALLOWED', async () => {
    const r = res();
    await edocsAccess(machine('some-other-client'), r, jest.fn());
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'EDOCS_CLIENT_NOT_ALLOWED' });
  });

  it('a person without caseworker or admin gets 403 FORBIDDEN', async () => {
    const r = res();
    await edocsAccess(person(['citizen']), r, jest.fn());
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });

  it('a person with an Entra token acts as themselves', async () => {
    mockGetIdToken.mockResolvedValue('id-a');
    const req = person(['admin']);
    await edocsAccess(req, res(), jest.fn());
    expect(mockGetIdToken).toHaveBeenCalledWith('sub-a', 'kc-a');
    expect(req.edocsActingAs).toBe('user');
    const principal = mockForUser.mock.calls[0][0] as {
      sub: string;
      email: string;
      getIdToken: (o?: object) => Promise<string>;
    };
    expect(principal).toMatchObject({ sub: 'sub-a', email: 'a@flevoland.nl' });
    await principal.getIdToken({ forceRefresh: true });
    expect(mockGetIdToken).toHaveBeenLastCalledWith('sub-a', 'kc-a', { forceRefresh: true });
  });

  it.each([
    [new UserTokenUnavailableError(), 'EDOCS_USER_TOKEN_UNAVAILABLE'],
    [new ReauthRequiredError(), 'EDOCS_REAUTH_REQUIRED'],
  ])('records %s as the person’s problem and continues', async (err, problem) => {
    mockGetIdToken.mockRejectedValue(err);
    const req = person();
    const next = jest.fn();
    await edocsAccess(req, res(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.edocs).toBeUndefined();
    expect(req.edocsUserProblem).toBe(problem);
  });

  it('in stub mode a person acts as the (stub) service without asking Keycloak', async () => {
    mockConfig.edocs.stubMode = true;
    const req = person();
    await edocsAccess(req, res(), jest.fn());
    expect(mockGetIdToken).not.toHaveBeenCalled();
    expect(req.edocs).toBe(mockService);
  });

  it('never logs the Keycloak token (Review Focus 4)', async () => {
    const r = res();
    await edocsAccess(machine('some-other-client'), r, jest.fn());
    mockGetIdToken.mockRejectedValue(new UserTokenUnavailableError());
    await edocsAccess(person(), res(), jest.fn());
    expect(
      JSON.stringify(mockLogger.warn.mock.calls) + JSON.stringify(mockLogger.info.mock.calls)
    ).not.toContain('kc-a');
  });
});

describe('requireEdocsPrincipal', () => {
  it('passes a resolved principal', () => {
    const next = jest.fn();
    requireEdocsPrincipal({ edocs: mockService } as unknown as Request, res(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('no token → 403 EDOCS_USER_TOKEN_UNAVAILABLE', () => {
    const r = res();
    requireEdocsPrincipal(
      { ...person(), edocsUserProblem: 'EDOCS_USER_TOKEN_UNAVAILABLE' } as unknown as Request,
      r,
      jest.fn()
    );
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'EDOCS_USER_TOKEN_UNAVAILABLE' });
  });

  it('no token, fallback on → the service, visibly, with an audit line', () => {
    mockConfig.edocs.allowServiceFallback = true;
    const req = {
      ...person(),
      edocsUserProblem: 'EDOCS_USER_TOKEN_UNAVAILABLE',
    } as unknown as Request;
    const next = jest.fn();
    requireEdocsPrincipal(req, res(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.edocs).toBe(mockService);
    expect(req.edocsActingAs).toBe('service');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('fallback'),
      expect.objectContaining({ audit: true, userId: 'sub-a', actingAs: 'testuser001' })
    );
  });

  it('reauth required → 401 EDOCS_REAUTH_REQUIRED, even with the fallback on', () => {
    mockConfig.edocs.allowServiceFallback = true;
    const r = res();
    requireEdocsPrincipal(
      { ...person(), edocsUserProblem: 'EDOCS_REAUTH_REQUIRED' } as unknown as Request,
      r,
      jest.fn()
    );
    expect(r.statusCode).toBe(401);
    expect(r.body).toMatchObject({ code: 'EDOCS_REAUTH_REQUIRED' });
  });
});

describe('sendEdocsError', () => {
  it.each([
    [new ReauthRequiredError(), 401, 'EDOCS_REAUTH_REQUIRED'],
    [new UserTokenUnavailableError(), 403, 'EDOCS_USER_TOKEN_UNAVAILABLE'],
    [new EdocsAccessDeniedError('nope'), 403, 'EDOCS_ACCESS_DENIED'],
    [new Error('boom'), 502, 'EDOCS_ERROR'],
  ])('%s → %d %s', (err, status, code) => {
    const r = res();
    sendEdocsError(anyReq, r, err, 'Failed to list eDOCS workspaces.');
    expect(r.statusCode).toBe(status);
    expect(r.body).toMatchObject({ status, code });
    expect(r.type).toHaveBeenCalledWith('application/problem+json');
  });

  it('keeps the route’s own message for an upstream failure', () => {
    const r = res();
    sendEdocsError(anyReq, r, new Error('boom'), 'Failed to list eDOCS workspaces.');
    expect(r.body).toMatchObject({ detail: 'Failed to list eDOCS workspaces.' });
  });
});
```

Run: `npx jest src/routes/edocs.access.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement** — `edocs.access.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';
import {
  entraTokenService,
  ReauthRequiredError,
  UserTokenUnavailableError,
} from '@auth/entra-token.service';
import { EdocsAccessDeniedError, edocsService, type EdocsService } from '@services/edocs.service';

const logger = createLogger('edocs-access');

type UserProblem = 'EDOCS_USER_TOKEN_UNAVAILABLE' | 'EDOCS_REAUTH_REQUIRED';

declare module 'express-serve-static-core' {
  interface Request {
    /** The eDOCS client for this request: the person, or the service account. */
    edocs?: EdocsService;
    edocsActingAs?: 'user' | 'service';
    /** Why a person has no client of their own (set by edocsAccess, acted on by requireEdocsPrincipal). */
    edocsUserProblem?: UserProblem;
  }
}

const PERSON_ROLES = ['caseworker', 'admin'];

/** Every refusal is an RFC 9457 problem detail, like the rest of the API. */
const fail = (req: Request, res: Response, status: number, code: string, detail: string) =>
  sendProblem(res, req, { status, code, detail });

/**
 * Who may call /v1/edocs, and as whom eDOCS sees the call (spec §4).
 *
 * - A machine client (token `azp` other than the frontend's) must be on
 *   EDOCS_ALLOWED_CLIENTS and acts as the service account.
 * - A person (azp = the frontend client) needs caseworker or admin and acts as
 *   themselves, with the Entra ID token Keycloak brokered at their login. When
 *   they have none, the reason is recorded and requireEdocsPrincipal decides.
 * - In stub mode nobody talks to eDOCS, so a person gets the stub service client.
 */
export async function edocsAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const azp = req.auth?.azp;
  if (azp !== config.keycloak.clientId) {
    if (azp && config.edocs.allowedClients.includes(azp)) {
      req.edocs = edocsService;
      req.edocsActingAs = 'service';
      return next();
    }
    logger.warn('eDOCS request from a client not on the allow-list', { azp, path: req.path });
    fail(
      req,
      res,
      403,
      'EDOCS_CLIENT_NOT_ALLOWED',
      'This API is only available to registered eDOCS clients.'
    );
    return;
  }

  if (!(req.user?.roles ?? []).some((role) => PERSON_ROLES.includes(role))) {
    fail(req, res, 403, 'FORBIDDEN', 'eDOCS requires the caseworker or admin role.');
    return;
  }

  if (config.edocs.stubMode) {
    req.edocs = edocsService;
    req.edocsActingAs = 'service';
    return next();
  }

  const sub = req.user!.userId;
  const keycloakToken = req.auth?.token ?? '';
  try {
    await entraTokenService.getIdToken(sub, keycloakToken);
  } catch (err) {
    if (err instanceof UserTokenUnavailableError || err instanceof ReauthRequiredError) {
      req.edocsUserProblem = err.code as UserProblem;
      return next();
    }
    return next(err);
  }

  req.edocs = edocsService.forUser({
    sub,
    email: req.user?.email ?? req.user?.preferredUsername,
    getIdToken: (opts) => entraTokenService.getIdToken(sub, keycloakToken, opts),
  });
  req.edocsActingAs = 'user';
  next();
}

/** Data routes need a client. A person without one is refused — or, where allowed, falls back visibly. */
export function requireEdocsPrincipal(req: Request, res: Response, next: NextFunction): void {
  if (req.edocs) return next();

  if (req.edocsUserProblem === 'EDOCS_REAUTH_REQUIRED') {
    fail(
      req,
      res,
      401,
      'EDOCS_REAUTH_REQUIRED',
      'Sign in again with your Flevoland account to use eDOCS.'
    );
    return;
  }

  if (config.edocs.allowServiceFallback) {
    logger.warn('eDOCS service fallback for a person without an Entra token', {
      audit: true,
      userId: req.user?.userId,
      actingAs: config.edocs.userId,
      path: req.path,
    });
    req.edocs = edocsService;
    req.edocsActingAs = 'service';
    return next();
  }

  fail(
    req,
    res,
    403,
    'EDOCS_USER_TOKEN_UNAVAILABLE',
    'eDOCS is available after signing in with your Flevoland account.'
  );
}

/** Maps an eDOCS call's failure to a response; anything unrecognised stays the route's 502. */
export function sendEdocsError(req: Request, res: Response, error: unknown, message: string): void {
  if (error instanceof ReauthRequiredError) {
    fail(
      req,
      res,
      401,
      'EDOCS_REAUTH_REQUIRED',
      'Sign in again with your Flevoland account to use eDOCS.'
    );
  } else if (error instanceof UserTokenUnavailableError) {
    fail(
      req,
      res,
      403,
      'EDOCS_USER_TOKEN_UNAVAILABLE',
      'eDOCS is available after signing in with your Flevoland account.'
    );
  } else if (error instanceof EdocsAccessDeniedError) {
    fail(req, res, 403, 'EDOCS_ACCESS_DENIED', 'eDOCS refused access for this account.');
  } else {
    fail(req, res, 502, 'EDOCS_ERROR', message);
  }
}
```

Run: `npx jest src/routes/edocs.access.test.ts` — PASS (17 tests).

- [ ] **Step 4: Rewire the routes** — `edocs.routes.ts`:

1. Imports: add `import { config } from '@utils/config';` and `import { edocsAccess, requireEdocsPrincipal, sendEdocsError } from './edocs.access';`.
2. Replace `router.use(jwtMiddleware);` with `router.use(jwtMiddleware, edocsAccess);`.
3. Replace the `/status` handler with:

```ts
router.get('/status', async (req: Request, res: Response) => {
  const health = await edocsService.healthCheck();
  logger.info('eDOCS status requested', health);

  // For a person: can eDOCS be reached as them? Machine clients get the service view only.
  let user:
    | {
        available: boolean;
        authenticated?: boolean;
        edocsUserId?: string;
        problem?: string;
        error?: string;
      }
    | undefined;
  if (req.auth?.azp === config.keycloak.clientId) {
    if (config.edocs.stubMode) user = { available: false, problem: 'STUB_MODE' };
    else if (req.edocsActingAs === 'user' && req.edocs)
      user = { available: true, ...(await req.edocs.probeUser()) };
    else
      user = { available: false, ...(req.edocsUserProblem && { problem: req.edocsUserProblem }) };
  }

  res.json({
    success: true,
    data: {
      status: health.status,
      library: process.env.EDOCS_LIBRARY ?? 'DOCUVITT',
      baseUrl: process.env.EDOCS_BASE_URL ?? '',
      stubMode: health.status === 'stub',
      reachable: health.reachable,
      authenticated: health.authenticated,
      ...(health.latency !== undefined && { latencyMs: health.latency }),
      ...(health.error !== undefined && { error: health.error }),
      ...(user && { user }),
    },
    timestamp: new Date().toISOString(),
  });
});

// Every route below needs an eDOCS client: the person's own, or the service.
router.use(requireEdocsPrincipal);
```

4. In each of the nine data handlers:
   - replace `edocsService.<method>(` with `req.edocs!.<method>(` (the handlers that declare `_req` rename it to `req`);
   - add `actingAs: req.edocsActingAs,` to the success JSON, after `success: true,`;
   - replace the `sendProblem(res, req, { status: 502, code: 'EDOCS_ERROR', detail: '<msg>' });` call with `return sendEdocsError(req, res, error, '<msg>');`, keeping `<msg>` and the `logger.error(...)` line before it unchanged. Remove the `sendProblem` import from the routes file if no other call is left.

   The nine handlers and their messages, as they stand in the file (verify each while editing):

   | Handler                                        | Service call                                   |
   | ---------------------------------------------- | ---------------------------------------------- |
   | `GET /workspaces`                              | `listWorkspaces()`                             |
   | `POST /workspaces/ensure`                      | `ensureWorkspace(projectNumber, projectName)`  |
   | `POST /documents`                              | `uploadDocument(…)`                            |
   | `GET /workspaces/:workspaceId/documents`       | `getWorkspaceDocuments(workspaceId)`           |
   | `GET /documents/:documentId/profile`           | `getDocumentProfile(documentId)`               |
   | `GET /documents/:documentId/versions`          | `getDocumentVersions(documentId)`              |
   | `GET /documents/:documentId/versions/:version` | `downloadDocumentVersion(documentId, version)` |
   | `DELETE /documents/:documentId`                | `deleteDocument(documentId)`                   |
   | `DELETE /workspaces/:workspaceId`              | `deleteWorkspace(workspaceId)`                 |

- [ ] **Step 5: Update the route tests** — `edocs.routes.test.ts`:

1. Make the jwt mock set the frontend `azp`, a caseworker role, and the token, so `edocsAccess` treats the default caller as a person:

```ts
    req.user = { …existing fields…, roles: ['caseworker'] };
    req.auth = { ...req.user, azp: (req.headers['x-test-azp'] as string) ?? 'ronl-business-api', token: 'kc-test', requestId: 'r' };
```

2. Mock config and the token service at the top (alongside the existing mocks):

```ts
const mockConfig = {
  keycloak: { clientId: 'ronl-business-api' },
  edocs: {
    stubMode: false,
    allowServiceFallback: false,
    allowedClients: ['edocs-mcp-client', 'copilot-studio-edocs', 'operaton-mcp-client'],
    userId: 'testuser001',
  },
};
// Merge over the real config: other modules this router pulls in (version
// middleware, conformance helpers) read their own keys. The edocs/keycloak
// objects stay the mockConfig ones, so tests can still flip them.
jest.mock('@utils/config', () => {
  const actual = jest.requireActual('@utils/config').config;
  return {
    config: {
      ...actual,
      keycloak: { ...actual.keycloak, ...mockConfig.keycloak },
      edocs: Object.assign(mockConfig.edocs, { ...actual.edocs, ...mockConfig.edocs }),
    },
  };
});
const mockGetIdToken = jest.fn().mockResolvedValue('id-test');
jest.mock('@auth/entra-token.service', () => {
  const actual = jest.requireActual('@auth/entra-token.service');
  return {
    ...actual,
    entraTokenService: { getIdToken: (...a: unknown[]) => mockGetIdToken(...a) },
  };
});
```

3. In the `@services/edocs.service` mock, give the mocked service `forUser: jest.fn(() => mockSvc)` and `probeUser: jest.fn()`, and export a real error class:

```ts
jest.mock('@services/edocs.service', () => {
  const svc: Record<string, jest.Mock> = {
    healthCheck: jest.fn(),
    listWorkspaces: jest.fn(),
    ensureWorkspace: jest.fn(),
    uploadDocument: jest.fn(),
    getWorkspaceDocuments: jest.fn(),
    getDocumentProfile: jest.fn(),
    getDocumentVersions: jest.fn(),
    downloadDocumentVersion: jest.fn(),
    deleteDocument: jest.fn(),
    deleteWorkspace: jest.fn(),
    probeUser: jest.fn(),
  };
  svc.forUser = jest.fn(() => svc);
  class EdocsAccessDeniedError extends Error {
    readonly code = 'EDOCS_ACCESS_DENIED';
  }
  return { edocsService: svc, EdocsAccessDeniedError };
});
```

The existing happy-path, 400 and 502 tests keep passing: the person resolves to `forUser(...)`, which returns the same mocked service. Add `actingAs: 'user'` to the success-body expectations that use `toEqual` (or switch them to `toMatchObject`).

4. Add these tests:

```ts
describe('/v1/edocs — principals', () => {
  it('a listed machine client acts as the service', async () => {
    svc.listWorkspaces.mockResolvedValue([]);
    const res = await request(app)
      .get('/v1/edocs/workspaces')
      .set('x-test-auth', '1')
      .set('x-test-azp', 'operaton-mcp-client');
    expect(res.status).toBe(200);
    expect(res.body.actingAs).toBe('service');
  });

  it('an unlisted machine client is refused', async () => {
    const res = await request(app)
      .get('/v1/edocs/workspaces')
      .set('x-test-auth', '1')
      .set('x-test-azp', 'random-client');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EDOCS_CLIENT_NOT_ALLOWED');
  });

  it('a person with an Entra token acts as themselves', async () => {
    svc.listWorkspaces.mockResolvedValue([]);
    const res = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(res.status).toBe(200);
    expect(res.body.actingAs).toBe('user');
  });

  it('a person without an Entra token gets 403 on data, but 200 on status with the reason', async () => {
    const { UserTokenUnavailableError } = jest.requireActual('@auth/entra-token.service');
    mockGetIdToken.mockRejectedValue(new UserTokenUnavailableError());
    svc.healthCheck.mockResolvedValue({ status: 'up', reachable: true, authenticated: true });
    const data = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(data.status).toBe(403);
    expect(data.body.code).toBe('EDOCS_USER_TOKEN_UNAVAILABLE');
    const status = await request(app).get('/v1/edocs/status').set('x-test-auth', '1');
    expect(status.status).toBe(200);
    expect(status.body.data.user).toEqual({
      available: false,
      problem: 'EDOCS_USER_TOKEN_UNAVAILABLE',
    });
    mockGetIdToken.mockResolvedValue('id-test');
  });

  it('status tells a person whether eDOCS knows them', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', reachable: true, authenticated: true });
    svc.probeUser.mockResolvedValue({ authenticated: true, edocsUserId: 'GORTS01' });
    const res = await request(app).get('/v1/edocs/status').set('x-test-auth', '1');
    expect(res.body.data.user).toEqual({
      available: true,
      authenticated: true,
      edocsUserId: 'GORTS01',
    });
  });

  it('eDOCS refusing the person is 403 EDOCS_ACCESS_DENIED, not 502', async () => {
    const { EdocsAccessDeniedError } = jest.requireMock('@services/edocs.service');
    svc.listWorkspaces.mockRejectedValue(new EdocsAccessDeniedError('Access not allowed'));
    const res = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EDOCS_ACCESS_DENIED');
  });
});
```

Each test that the file runs through `expectToMatchOperation` keeps doing so; the OpenAPI changes in Step 6 make the new codes conform.

- [ ] **Step 6: Describe it in OpenAPI** — `openapi/openapi.yaml`:

1. Under `components/responses`, after `UpstreamFailed`, add:

```yaml
EdocsForbidden:
  description: |
    Refused before or by eDOCS. The codes:

    - **`FORBIDDEN`** -- a person without the `caseworker` or `admin` realm role.
    - **`EDOCS_CLIENT_NOT_ALLOWED`** -- a machine client not on `EDOCS_ALLOWED_CLIENTS`.
    - **`EDOCS_USER_TOKEN_UNAVAILABLE`** -- a person with no Entra ID token
      (a Keycloak account, or signed in before tokens were stored).
    - **`EDOCS_ACCESS_DENIED`** -- eDOCS refused the person's token.
  content:
    application/problem+json:
      schema: { $ref: '#/components/schemas/Problem' }
EdocsUnauthorized:
  description: |
    `MISSING_TOKEN` / `INVALID_TOKEN` as everywhere, or **`EDOCS_REAUTH_REQUIRED`**:
    the person's Entra session can no longer be refreshed -- sign in again.
  content:
    application/problem+json:
      schema: { $ref: '#/components/schemas/Problem' }
```

2. In each of the nine data operations under `/edocs…` (all but `/edocs/status`): replace `'401': $ref: '#/components/responses/Unauthorized'` with `'401': $ref: '#/components/responses/EdocsUnauthorized'`, add `'403': $ref: '#/components/responses/EdocsForbidden'`, and in the `200`/`201` schema's second `allOf` object add, beside `data`:

```yaml
actingAs:
  type: string
  enum: [user, service]
  description: Whether eDOCS saw the signed-in person or the service account.
```

3. In `/edocs/status`, add `'403': $ref: '#/components/responses/EdocsForbidden'`, and under `data.properties`:

```yaml
user:
  type: object
  description: Present for a person only -- can eDOCS be reached as them?
  required: [available]
  properties:
    available: { type: boolean }
    authenticated: { type: boolean }
    edocsUserId: { type: string }
    problem:
      type: string
      enum: [EDOCS_USER_TOKEN_UNAVAILABLE, EDOCS_REAUTH_REQUIRED, STUB_MODE]
    error: { type: string }
```

4. Rebuild and lint: `npm run lint:openapi` (from `packages/backend`; it runs `build:openapi` first). Expected: no errors.

- [ ] **Step 7: Run the route, OpenAPI and jwt tests**

Run: `npx jest src/routes/edocs src/auth src/openapi`
Expected: PASS.

- [ ] **Step 8: Stage and ask to commit**

```bash
git add packages/backend/src/auth/jwt.middleware.ts packages/backend/src/auth/jwt.middleware.test.ts \
  packages/backend/src/types/auth.types.ts packages/backend/src/routes/edocs.access.ts \
  packages/backend/src/routes/edocs.access.test.ts packages/backend/src/routes/edocs.routes.ts \
  packages/backend/src/routes/edocs.routes.test.ts packages/backend/openapi/openapi.yaml packages/backend/openapi/openapi.json
```

Hand off `npm test --workspace=@ronl/backend`; then ask. Message: `feat(edocs): /v1/edocs acts as the signed-in person, or the listed service client`.

---

### Task 5: Keycloak stores the brokered tokens

**Files:**

- Modify: `scripts/keycloak-entra-idp.json` (`provider`)
- Modify: `scripts/keycloak-add-entra-idp.sh` (new final step)

**Interfaces:**

- Produces: on every run, `entra-flevoland` has `storeToken: true`, `addReadTokenRoleOnCreate: true`, scope `openid profile email offline_access`; every user linked to `entra-flevoland` holds the `broker` client role `read-token`.

- [ ] **Step 1: Change the definition** — in `scripts/keycloak-entra-idp.json`:

```json
    "storeToken": true,
    "addReadTokenRoleOnCreate": true,
```

and `"defaultScope": "openid profile email offline_access"`.

- [ ] **Step 2: Add the read-token step** — at the end of `scripts/keycloak-add-entra-idp.sh`, before `echo "Done."`, add:

```bash
# ── Existing brokered users: the broker read-token role ──────────────────────
# addReadTokenRoleOnCreate only applies to users Keycloak creates from now on.
# Users who already signed in through this provider need the broker client's
# read-token role to read their own stored Entra token (the backend calls the
# broker token endpoint with the person's own Keycloak token).
BROKER_ID=$(curl -sS "${AUTH[@]}" "${BASE}/clients?clientId=broker" | jqr -r '.[0].id // empty')
ROLE_JSON=$(curl -sS "${AUTH[@]}" "${BASE}/clients/${BROKER_ID}/roles/read-token")
[[ -n "$BROKER_ID" && "$(jqr -r '.name // empty' <<<"$ROLE_JSON")" == "read-token" ]] || {
  echo "broker client or its read-token role not found in realm ${REALM}" >&2
  exit 1
}
GRANTED=0 HELD=0
while IFS= read -r uid; do
  [[ -n "$uid" ]] || continue
  has=$(curl -sS "${AUTH[@]}" "${BASE}/users/${uid}/role-mappings/clients/${BROKER_ID}" \
    | jqr -r '[.[].name] | index("read-token") // empty')
  if [[ -n "$has" ]]; then HELD=$((HELD + 1)); continue; fi
  code=$(jq -c '[{id, name}]' <<<"$ROLE_JSON" | curl -sS -o /dev/null -w '%{http_code}' -X POST "${AUTH[@]}" \
    -H 'Content-Type: application/json' "${BASE}/users/${uid}/role-mappings/clients/${BROKER_ID}" --data-binary @-)
  [[ "$code" == "204" ]] && GRANTED=$((GRANTED + 1)) \
    || { echo "  FAILED        read-token for user ${uid} -> HTTP ${code}" >&2; FAILED=$((FAILED + 1)); }
done < <(curl -sS "${AUTH[@]}" "${BASE}/users?idpAlias=${ALIAS}&max=1000" | jqr -r '.[].id')
echo "→ broker read-token: ${GRANTED} granted, ${HELD} already held"
[[ "$FAILED" -eq 0 ]] || exit 1
echo "→ users who signed in before this run must sign in once more for Keycloak to store their tokens"
```

Also add one line to the header comment, under "WHAT IT SENDS": `# It also grants the broker read-token role to every user already linked to the provider.`

- [ ] **Step 3: Dry run and syntax**

Run: `bash -n scripts/keycloak-add-entra-idp.sh && KEYCLOAK_URL=http://localhost:8080 ENTRA_TENANT_ID=95f3a7d8-730c-4f35-a909-867d3fbde8fe ENTRA_CLIENT_ID=ef967eb0-3902-408f-8161-4e294c826473 bash scripts/keycloak-add-entra-idp.sh --dry-run | grep -E 'storeToken|addReadTokenRoleOnCreate|defaultScope'`
Expected: `"storeToken": true`, `"addReadTokenRoleOnCreate": true`, `"defaultScope": "openid profile email offline_access"`. (The dry run exits before the read-token step.)

- [ ] **Step 4: The user runs it locally** — hand the user the rollout procedure's step 1 (secret check, then the script) against `http://localhost:8080`, with `export CURL_HOME=…` if on the Flevoland network. Expected: `updated provider`, seven `updated mapper` lines, `broker read-token: 1 granted, 0 already held` (their own account), and the sign-in-again note. They sign out and in once with the Flevoland button.

- [ ] **Step 5: Stage and ask to commit**

```bash
git add scripts/keycloak-entra-idp.json scripts/keycloak-add-entra-idp.sh
```

Message: `feat(keycloak): store brokered Entra tokens and let users read their own`.

---

### Task 6: Live smoke scripts cover the per-user path

**Files:**

- Modify: `scripts/test-edocs-live.sh` (header ~:41-77; new section after "1. Status", ~:347)
- Modify: `scripts/test-smoke-live.sh` (header ~:40-50; Tier 2b, after the MCP `/sources` check)

**Interfaces:**

- Consumes: the `/v1/edocs` behaviour of Task 4 (`actingAs`, `data.user`, the 403/401 codes).

- [ ] **Step 1: `test-edocs-live.sh` — header**

Under "Optional overrides", add:

```bash
#   SMOKE_USER=test-caseworker-flevoland   # a Keycloak person WITHOUT an Entra token (section 1b);
#   SMOKE_PASSWORD=…                        # on local, from SMOKE_TEST_PASSWORD in .env.<NODE_ENV>
#   USER_CLIENT_ID=ronl-business-api        # public client for that password grant
#   EXPECT_FALLBACK=false                   # true when the backend runs EDOCS_ALLOW_SERVICE_FALLBACK=true
#   PERSON_TOKEN=<Keycloak access token>    # optional: a person signed in with the Flevoland
#                                           # button (DevTools → Network → any /v1 request →
#                                           # Authorization header, without "Bearer "). Enables 1c.
```

- [ ] **Step 2: `test-edocs-live.sh` — sections 1b and 1c**, inserted after the "Abort the mutating steps unless…" block:

```bash
# ─── 1b. A person without an Entra token (Keycloak test account) ──────────────
# The spec's rule: a person never silently becomes the service account. With the
# fallback off they are refused on data routes; with it on they act as the
# service and the response says so.
echo ""
echo "── 1b. Person without an Entra token (${SMOKE_USER:-test-caseworker-flevoland}) ──"
SMOKE_USER="${SMOKE_USER:-test-caseworker-flevoland}"
USER_CLIENT_ID="${USER_CLIENT_ID:-ronl-business-api}"
if [[ -z "${SMOKE_PASSWORD:-}" && -f "$ENV_FILE" && "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1) ]]; then
  SMOKE_PASSWORD="$(read_env_var SMOKE_TEST_PASSWORD "$ENV_FILE")"
fi
if [[ -z "${SMOKE_PASSWORD:-}" ]]; then
  skip "1b — no SMOKE_PASSWORD"
else
  USER_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token" \
    -d grant_type=password -d "client_id=${USER_CLIENT_ID}" \
    --data-urlencode "username=${SMOKE_USER}" --data-urlencode "password=${SMOKE_PASSWORD}" \
    | jq -r '.access_token // empty' | tr -d '\r')
  if [[ -z "$USER_TOKEN" ]]; then
    fail "1b — no token for ${SMOKE_USER} (password grant)"
  else
    U_CODE=$(curl -s -o /tmp/edocs_1b.json -w '%{http_code}' "${BASE_URL}/v1/edocs/workspaces" \
      -H "Authorization: Bearer ${USER_TOKEN}")
    if [[ "${EXPECT_FALLBACK:-false}" == "true" ]]; then
      check_status "GET /v1/edocs/workspaces as ${SMOKE_USER} (fallback on)" "$U_CODE" "200"
      check_field "acts as the service, visibly" "$(cat /tmp/edocs_1b.json)" '.actingAs' 'service'
    else
      check_status "GET /v1/edocs/workspaces as ${SMOKE_USER} (fallback off)" "$U_CODE" "403"
      check_field "refused for want of an Entra token" "$(cat /tmp/edocs_1b.json)" '.code' 'EDOCS_USER_TOKEN_UNAVAILABLE'
    fi
    S_CODE=$(curl -s -o /tmp/edocs_1b_status.json -w '%{http_code}' "${BASE_URL}/v1/edocs/status" \
      -H "Authorization: Bearer ${USER_TOKEN}")
    check_status "GET /v1/edocs/status as ${SMOKE_USER}" "$S_CODE" "200"
    check_field "status says the person has no eDOCS identity" "$(cat /tmp/edocs_1b_status.json)" '.data.user.available' 'false'
  fi
fi

# ─── 1c. A person signed in with the Flevoland button (optional) ──────────────
echo ""
echo "── 1c. Person with an Entra token (PERSON_TOKEN) ──"
if [[ -z "${PERSON_TOKEN:-}" ]]; then
  skip "1c — no PERSON_TOKEN (see the header for how to copy one)"
else
  P_CODE=$(curl -s -o /tmp/edocs_1c_status.json -w '%{http_code}' "${BASE_URL}/v1/edocs/status" \
    -H "Authorization: Bearer ${PERSON_TOKEN}")
  check_status "GET /v1/edocs/status as the person" "$P_CODE" "200"
  check_field "eDOCS knows the person" "$(cat /tmp/edocs_1c_status.json)" '.data.user.authenticated' 'true'
  echo "  · eDOCS user: $(jq -r '.data.user.edocsUserId // "?"' /tmp/edocs_1c_status.json)"
  W_CODE=$(curl -s -o /tmp/edocs_1c.json -w '%{http_code}' "${BASE_URL}/v1/edocs/workspaces" \
    -H "Authorization: Bearer ${PERSON_TOKEN}")
  check_status "GET /v1/edocs/workspaces as the person" "$W_CODE" "200"
  check_field "acts as the person" "$(cat /tmp/edocs_1c.json)" '.actingAs' 'user'
fi
```

Before inserting, confirm the helper names `pass`, `fail`, `skip`, `check_status`, `check_field` and `read_env_var` exist in this script with these signatures (`check_field <label> <json> <jq path> <expected>`); `skip` is defined in `test-smoke-live.sh` — if `test-edocs-live.sh` lacks it, add `skip() { echo "  ⊘ $1"; }` next to its `pass`/`fail` definitions.

- [ ] **Step 3: `test-smoke-live.sh` — Tier 2b**

In the header's "Tier 2b" block add `#   PERSON_TOKEN       optional: a Flevoland-signed-in person's Keycloak token → eDOCS as themselves`. After the existing `/v1/mcp/sources` check inside Tier 2b, add:

```bash
    # eDOCS as a person: the seeded caseworker has no Entra token, so status must
    # say so (and data routes would refuse it — test-edocs-live.sh 1b covers those).
    PS_CODE=$(get "$TMP/edocs_person.json" "${BASE_URL}/v1/edocs/status" "${AUTH_USER[@]}")
    check_status "GET /v1/edocs/status as ${SMOKE_USER}" "$PS_CODE" "200"
    if [[ "$(jq -r '.data.stubMode' "$TMP/edocs_person.json")" == "true" ]]; then
      skip "eDOCS person path — stub mode"
    elif [[ "$(jq -r '.data.user.available' "$TMP/edocs_person.json")" == "false" ]]; then
      pass "eDOCS: ${SMOKE_USER} has no Entra identity ($(jq -r '.data.user.problem // "?"' "$TMP/edocs_person.json"))"
    else
      fail "eDOCS: ${SMOKE_USER} unexpectedly has an eDOCS identity"
    fi
```

and after Tier 2b, a separate optional block:

```bash
if [[ -n "${PERSON_TOKEN:-}" ]]; then
  echo "── Tier 2c — Flevoland person → eDOCS as themselves ─────────────────────────"
  PC_CODE=$(get "$TMP/edocs_pc.json" "${BASE_URL}/v1/edocs/status" -H "Authorization: Bearer ${PERSON_TOKEN}")
  check_status "GET /v1/edocs/status as the person" "$PC_CODE" "200"
  [[ "$(jq -r '.data.user.authenticated' "$TMP/edocs_pc.json")" == "true" ]] \
    && pass "eDOCS knows the person as $(jq -r '.data.user.edocsUserId' "$TMP/edocs_pc.json")" \
    || fail "eDOCS person path: $(jq -r '.data.user.problem // .data.user.error // "no detail"' "$TMP/edocs_pc.json")"
fi
```

Confirm the variable holding the Tier 2b user's auth header array is named `AUTH_USER` (read it next to the `/sources` call) and use that name.

- [ ] **Step 4: Syntax**

Run: `bash -n scripts/test-edocs-live.sh && bash -n scripts/test-smoke-live.sh && echo OK`
Expected: `OK`.

- [ ] **Step 5: The user's live acceptance test (PR 1)** — hand off, against localhost with `EDOCS_STUB_MODE=false` and the `ENTRA_*` settings added to their `.env.development`, after Task 5's re-sign-in, and after they restart the backend:

1. `bash scripts/test-smoke-live.sh` — all green; Tier 2b says the seeded caseworker has no Entra identity.
2. `bash scripts/test-edocs-live.sh` — 1b passes with `EDOCS_USER_TOKEN_UNAVAILABLE`.
3. `PERSON_TOKEN=<copied> bash scripts/test-edocs-live.sh` — 1c: `authenticated: true`, `edocsUserId: GORTS01`, workspaces `actingAs: user`. Note the `sessionDuration` the backend logged on that connect (ruling 3).
4. With `EDOCS_ALLOW_SERVICE_FALLBACK=true` and a backend restart: `EXPECT_FALLBACK=true bash scripts/test-edocs-live.sh` — 1b passes with `actingAs: service`; the backend log shows the `audit: true` fallback line.

Note: the service-side steps (status `authenticated`, upload) run as `testuser001`, which passed `test-edocs-live.sh` 15/15 on 6 October 2026.

- [ ] **Step 6: Stage and ask to commit**

```bash
git add scripts/test-edocs-live.sh scripts/test-smoke-live.sh
```

Message: `test(edocs): live smoke covers a person with and without an Entra token`.

---

### Task 7: Documentation for PR 1

**Files:**

- Modify: `docs/EDOCS-GO-LIVE.md`
- Modify (iou-architectuur, on `acc`, per its remotes flow): `docs/en/ronl-business-api/developer/deployment/entra-id.md`

- [ ] **Step 1: `docs/EDOCS-GO-LIVE.md`** — add a section `## People act as themselves (Entra ID)` stating, in this order: the two identities (person via `X-DM-AUTH`, service `EDOCS_USER_ID` = `testuser001`); the new settings with one line each (copy the `.env.example` comments of Task 1); the error codes table (§ Global Constraints); the Keycloak prerequisite (Task 5 script run, then each person signs in once more); and the smoke commands of Task 6 Step 5. Replace "Prefer a **dedicated service account**…" with "The service account is `testuser001`; a person's eDOCS work no longer goes through it."

- [ ] **Step 2: Entra runbook** — in `entra-id.md`, section "The Keycloak side", after the mapper table, add:

```markdown
The provider also **stores the tokens** Entra issues (`storeToken`, with `offline_access` in the scope), and every brokered user holds the `broker` client's `read-token` role. RBA's backend reads a person's stored Entra ID token — with that person's own Keycloak token — to open eDOCS sessions as them. After the script first enables this, each person signs in once more for Keycloak to hold their tokens.
```

and in "Rolling out to an environment", step 1's expected output, add the line `broker read-token: N granted, M already held`.

- [ ] **Step 3: Stage and ask to commit** — RBA: `git add docs/EDOCS-GO-LIVE.md`, message `docs(edocs): people act in eDOCS as themselves`. iou-architectuur: commit on `acc` after asking, push to `flevoland` and `origin`, open the promotion PR when the user asks.

---

### Task 8: ACC readiness, then the PR

- [ ] **Step 1: Read ACC's eDOCS settings** (read-only):

```bash
az webapp config appsettings list --subscription "PDR - C1380" -g rg-ronl-acc -n ronl-business-api-acc \
  --query "[?starts_with(name,'EDOCS_') || starts_with(name,'ENTRA_')].{n:name}" -o tsv | tr -d '\r'
az webapp config appsettings list --subscription "PDR - C1380" -g rg-ronl-acc -n ronl-business-api-acc \
  --query "[?name=='EDOCS_STUB_MODE'].value" -o tsv | tr -d '\r'
```

Expected: the names present, and the stub-mode value. **If `EDOCS_STUB_MODE` is `false` on ACC (Review Focus 1)**, the backend will refuse to start after the merge unless `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` are set first. Hand the user a script per the global CLAUDE.md App Service procedure (written to `~/set-edocs-entra-acc.sh`, run as `! bash ~/set-edocs-entra-acc.sh`, secret read with `read -rsp`), confirm with the `list` command, and delete the script. If it is `true`, nothing must change before the merge; record that in the PR.

- [ ] **Step 2: Run the Keycloak script against ACC** — the user, per the runbook, so ACC's provider stores tokens and existing ACC users get `read-token`.

- [ ] **Step 3: Push and open PR 1** — when the user asks: `git push -u origin feat/edocs-per-user-entra`, `gh pr create --base acc` with a body summarising Tasks 1–7, the rulings, the ACC settings state from Step 1, and the live results of Task 6 Step 5. No attribution lines.

---

## PR 2 — the AI assistant as the person

Branch `feat/edocs-assistant-as-person` from `origin/acc` after PR 1 merges.

### Task 9: The caller's token travels with the tool call

**Files:**

- Modify: `packages/backend/src/services/mcp/McpProvider.ts`, `McpRegistry.ts`, `EdocsMcpProvider.ts`
- Modify: `packages/backend/src/services/mcpChat.service.ts` (`runChatStream` signature ~:33, the `callTool` call ~:107)
- Modify: `packages/backend/src/routes/mcp.routes.ts` (the `runChatStream` call ~:126)
- Test: `packages/backend/src/services/mcp/McpRegistry.test.ts`, `EdocsMcpProvider.test.ts`, `packages/backend/src/services/mcpChat.service.test.ts` (existing files; add cases)

**Interfaces:**

- Produces: `export interface McpCallContext { userToken?: string }`; `McpProvider.callTool(name, args, context?: McpCallContext)`; `McpRegistry.callTool(name, args, context?)`; `runChatStream(history, message, send, sources, modelId, signal, context?: McpCallContext)`.

- [ ] **Step 1: Write the failing tests**

In `McpRegistry.test.ts`:

```ts
it('passes the call context to the provider', async () => {
  const provider = makeProvider('edocs', ['workspace_list']); // use the file's existing provider factory
  registry.register(provider);
  await registry.getToolDefinitions();
  await registry.callTool('workspace_list', {}, { userToken: 'kc-a' });
  expect(provider.callTool).toHaveBeenCalledWith('workspace_list', {}, { userToken: 'kc-a' });
});
```

In `EdocsMcpProvider.test.ts`:

```ts
it('sends the caller’s token in _meta, never in the tool arguments', async () => {
  await provider.connect(); // as the file's other tests do
  await provider.callTool('workspace_list', { a: 1 }, { userToken: 'kc-a' });
  expect(mockClient.callTool).toHaveBeenCalledWith({
    name: 'workspace_list',
    arguments: { a: 1 },
    _meta: { userToken: 'kc-a' },
  });
});

it('sends no _meta without a caller', async () => {
  await provider.connect();
  await provider.callTool('workspace_list', {});
  expect(mockClient.callTool).toHaveBeenCalledWith({ name: 'workspace_list', arguments: {} });
});
```

In `mcpChat.service.test.ts`: in the existing test that drives a tool-use turn, call `runChatStream(…, signal, { userToken: 'kc-a' })` and assert `mcpRegistry.callTool` was called with `(toolName, input, { userToken: 'kc-a' })`.

Use the variable names these files already use for their mocks (`mockClient`, the registry instance, the provider factory); read each file's setup before adding the case.

Run: `npx jest src/services/mcp src/services/mcpChat.service.test.ts` — FAIL on the three new assertions.

- [ ] **Step 2: Implement**

`McpProvider.ts` — add above `McpProvider`:

```ts
/** Who a tool call is made for. Never part of the tool arguments the model sees. */
export interface McpCallContext {
  /** The caller's raw Keycloak access token — only for providers that act as the person. */
  userToken?: string;
}
```

and change the method to `callTool(name: string, args: Record<string, unknown>, context?: McpCallContext): Promise<McpToolResult>;`.

`McpRegistry.ts`:

```ts
  async callTool(
    name: string,
    args: Record<string, unknown>,
    context?: McpCallContext
  ): Promise<McpToolResult> {
    const provider = this.toolIndex.get(name);
    if (!provider) {
      throw new Error(`No provider found for tool: ${name}`);
    }
    return provider.callTool(name, args, context);
  }
```

(import `McpCallContext` from `./McpProvider`). The other providers keep their two-parameter `callTool`; TypeScript accepts a method with fewer parameters.

`EdocsMcpProvider.ts`:

```ts
  async callTool(
    name: string,
    args: Record<string, unknown>,
    context?: McpCallContext
  ): Promise<McpToolResult> {
    this.assertConnected();
    logger.info('Calling eDOCS tool', { tool: name, asPerson: Boolean(context?.userToken) });
    const result = await this.client!.callTool({
      name,
      arguments: args,
      // The caller's token goes in _meta: the eDOCS MCP server reaches /v1/edocs as
      // that person, and the language model — which only produces `arguments` — never sees it.
      ...(context?.userToken && { _meta: { userToken: context.userToken } }),
    });
    return result as McpToolResult;
  }
```

`mcpChat.service.ts`: add a final optional parameter `context?: McpCallContext` to `runChatStream`, and change the tool call to `await mcpRegistry.callTool(toolUse.name, toolUse.input, context)`.

`mcp.routes.ts`: pass `{ userToken: req.auth?.token }` as the new last argument of `runChatStream(...)`.

Run: `npx jest src/services/mcp src/services/mcpChat.service.test.ts src/routes/mcp.routes.test.ts` — PASS.

- [ ] **Step 3: Stage and ask to commit** — the six files; hand off `npm test --workspace=@ronl/backend`. Message: `feat(mcp): pass the caller's token to a tool call, outside the model's arguments`.

---

### Task 10: The eDOCS MCP server calls `/v1/edocs` as the person

**Files:**

- Modify: `packages/backend/src/mcp-servers/edocs/index.ts`
- Modify: `packages/backend/src/mcp-servers/edocs/index.test.ts`

**Interfaces:**

- Consumes: `_meta.userToken` (Task 9); the `/v1/edocs` problem-detail `code` (Task 4).

- [ ] **Step 1: Write the failing tests** — in `index.test.ts`, extend the `Handler` type's `params` with `_meta?: Record<string, unknown>`, add a helper, and add:

```ts
const callAs = (name: string, userToken: string, args: Record<string, unknown> = {}) =>
  callTool({ params: { name, arguments: args, _meta: { userToken } } });

describe('acting as the person', () => {
  beforeEach(() => loadModule());

  it('uses the caller’s token instead of its own client_credentials token', async () => {
    mockBackendClient.get.mockResolvedValue({ data: { data: [] } });
    await callAs('workspace_list', 'kc-a');
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockBackendClient.get).toHaveBeenCalledWith('/workspaces', {
      headers: { Authorization: 'Bearer kc-a' },
    });
  });

  it('does not retry a person’s refusal with its own token', async () => {
    mockBackendClient.get.mockRejectedValue({
      response: { status: 403, data: { code: 'EDOCS_USER_TOKEN_UNAVAILABLE' } },
    });
    const res = await callAs('workspace_list', 'kc-a');
    expect(mockBackendClient.get).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Flevoland-account/);
  });

  it.each([
    ['EDOCS_REAUTH_REQUIRED', 401, /opnieuw in/],
    ['EDOCS_ACCESS_DENIED', 403, /weigert/],
  ])('explains %s in Dutch', async (code, status, pattern) => {
    mockBackendClient.get.mockRejectedValue({ response: { status, data: { code } } });
    const res = await callAs('workspace_list', 'kc-a');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(pattern);
  });

  it('without _meta it keeps its own token, as before', async () => {
    mockAxiosPost.mockResolvedValue(tokenResponse('tok1'));
    mockBackendClient.get.mockResolvedValue({ data: { data: [] } });
    await call('workspace_list');
    expect(mockBackendClient.get).toHaveBeenCalledWith('/workspaces', {
      headers: { Authorization: 'Bearer tok1' },
    });
  });
});
```

Run: `npx jest src/mcp-servers/edocs` — FAIL on the four new person cases.

- [ ] **Step 2: Implement** — in `index.ts`:

Add, after `callBackend`:

```ts
/** Plain-Dutch explanations the assistant can pass on, per /v1/edocs refusal code. */
const PERSON_REFUSALS: Record<string, string> = {
  EDOCS_USER_TOKEN_UNAVAILABLE:
    'Geen eDOCS-toegang via uw account: eDOCS is alleen beschikbaar na inloggen met uw Flevoland-account.',
  EDOCS_REAUTH_REQUIRED: 'Uw Flevoland-sessie is verlopen. Log opnieuw in om eDOCS te gebruiken.',
  EDOCS_ACCESS_DENIED: 'eDOCS weigert de toegang voor uw account.',
};

class PersonRefusedError extends Error {}

/** One call as the person: their token, no retry with another identity. */
async function callBackendAs<T>(path: string, userToken: string): Promise<T> {
  try {
    const response = await backend.get(path, { headers: { Authorization: `Bearer ${userToken}` } });
    return response.data?.data as T;
  } catch (err: unknown) {
    // A refusal is a problem detail: the code is a top-level member.
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code && PERSON_REFUSALS[code]) throw new PersonRefusedError(PERSON_REFUSALS[code]);
    throw err;
  }
}
```

In the `CallToolRequestSchema` handler, after `const { name, arguments: args = {} } = request.params;` add:

```ts
const userToken = (request.params._meta as { userToken?: unknown } | undefined)?.userToken;
const get = <T>(path: string): Promise<T> =>
  typeof userToken === 'string' && userToken
    ? callBackendAs<T>(path, userToken)
    : callBackend<T>(path);
```

replace each `await callBackend(` inside the `switch` with `await get(`, and in the `catch`:

```ts
  } catch (err) {
    if (err instanceof PersonRefusedError) {
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
```

Update the header comment: `// A call that carries _meta.userToken (a caseworker's Keycloak token, passed by the backend) reaches /v1/edocs as that person; without it, as edocs-mcp-client.`

Run: `npx jest src/mcp-servers/edocs` — PASS.

- [ ] **Step 3: The user's live check (PR 2)** — after a backend restart, as the Flevoland-signed-in user in the AI assistant: "Welke eDOCS-werkruimtes zijn er?" lists workspaces, and the backend log shows `Connected to eDOCS as a person` with `edocsUserId: GORTS01`. As `test-caseworker-flevoland`: the assistant answers that eDOCS needs the Flevoland account.

- [ ] **Step 4: Stage and ask to commit** — `index.ts`, `index.test.ts`; hand off `npm test --workspace=@ronl/backend`. Message: `feat(edocs-mcp): the assistant's eDOCS tools act as the caseworker`. Then push and open PR 2 when the user asks.
