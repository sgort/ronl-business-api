# Operaton engine REST API behind credentials — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Close `operaton.open-regels.nl/engine-rest` to anonymous callers, except for reading the rules and
evaluating decisions, without breaking any legitimate caller.

**Architecture:** Two layers. Operaton 1.0.0 switches on REST authentication, authorisation checks and
tenant-check-off. A provisioning script creates one account per caller plus a read-only `public-reader`. Caddy
forwards a fixed allowlist of rule paths as `public-reader` when the caller sends no credentials, and everything
else unchanged. The RBA and LDE backends send basic auth on every engine call, including their external-task
workers.

**Tech stack:** Operaton Run 1.0.0 (VM) and 2.1.5 (local), Caddy 2, POSIX `sh` + `curl`, Node/TypeScript
(Express, axios), Jest (RBA backend, LDE backend), Vitest (RBA frontend), Playwright (RBA e2e).

**Spec:** `docs/superpowers/specs/2026-11-06-operaton-engine-rest-auth-design.md`. Its "Documentation
(iou-architectuur)" section is **out of this plan**: the owner does it separately.

## Global constraints

- The VM engine stays on **Operaton 1.0.0**: pin `operaton/operaton:1.0.0`, no upgrade (that is #423).
- The local stack stays on `operaton/operaton:2.1.5`. Settings are proven on **both**.
- **No secrets and no personal names in the repository.** It is public. Personal Operaton account IDs are
  passed at run time, never written into a file.
- Config keys proven in Operaton 1.0.0's own source (`distro/run/assembly/resources/production.yml` at
  `v1.0.0`): `operaton.bpm.run.auth.enabled`, `operaton.bpm.authorization.enabled`,
  `operaton.bpm.generic-properties.properties.tenant-check-enabled`, `operaton.bpm.run.cors.enabled`.
- Account names: `rba-backend-acc`, `rba-backend-prod`, `lde-backend-acc`, `lde-backend-prod` (VM); `rba-backend`,
  `lde-backend` (local); `public-reader` (both). Service accounts and the four personal accounts join
  `operaton-admin`. `demo` stays.
- `public-reader` gets exactly: `READ` on Process Definition (resource type 6), Deployment (9), Decision
  Definition (10) and Decision Requirements Definition (14), plus `CREATE_INSTANCE` on Decision Definition (10),
  all with resource ID `*`. Nothing else.
- Caddy reads the public-reader header value from `{$OPERATON_PUBLIC_READER_AUTH}` (base64 `user:password`),
  never inline.
- **Process rules (from CLAUDE.md):** ask before every `git commit`; never `--no-verify`; never start, stop or
  restart the owner's dev servers or their local `docker compose` stack. Hand them the command. Throwaway test
  containers this plan starts are named `op415-*`, use ports 8090/8091, and are removed by the same script.
  The owner runs the full `npm test` per batch and gives the green before each commit.
- Prettier covers `ts/tsx/json/md` only. Shell scripts and Caddy files are formatted by hand. Caddy files are
  checked with `caddy fmt --diff` and `caddy validate`.

## Spec corrections found while planning

1. **`GET /engine-rest/deployment/count` stays public.** Deployments are on the allowlist, so the second call
   from the issue keeps answering `200`. The external check uses case-data calls instead:
   `GET /engine-rest/process-instance/count`, `GET /engine-rest/task/count` and `GET /engine-rest/version` must
   answer `401`.
2. **Authorised list queries are filtered, not refused.** As `public-reader`, `GET /process-instance` answers
   `200 []`, not `403`. Tests assert empty results and counts of `0` while instances exist. Requests for a
   single resource answer `403`.
3. **ttl-editor needs no change.** Its e2e probe (`e2e/stack.js`) counts any HTTP status as "up", so a `401` passes.
4. **LDE ACC runs `NODE_ENV=acceptance`.** The LDE start-up check keys on its deployment tier
   (`config.displayEnv` is `ACC` or `PROD`), not on `NODE_ENV=production`.
5. **The RBA App Services already set `OPERATON_USERNAME`/`OPERATON_PASSWORD`** (read 7 November 2026). The
   LDE ones do not. RBA PROD also carries a stray `OPERATON_URL`.
6. **Operaton's own CORS is on in the stock image** (`operaton.bpm.run.cors.enabled: true`, origins `*`, in
   `default.yml`). The VM's `-Doperaton.cors.enabled=false` is not a real key. Caddy alone does not remove the
   engine's own `Access-Control-Allow-Origin`.

## Review focus

1. **Path tricks on an allowlisted prefix** (`/engine-rest/deployment/../process-instance`, `%2e%2e`, `//`,
   `%2F`, a trailing slash, `/Engine-Rest/`) must never return case data to an anonymous caller. Tested in
   Task 4's allowlist check.
2. **A caller that sends credentials on a public path keeps its own identity.** Wrong credentials answer
   `401`, not public access. Tested in Task 4.
3. **A tenant-scoped decision** (`flevoland`) is readable and evaluable anonymously (tenant check off), through
   both `/key/{k}/evaluate` and `/key/{k}/tenant-id/flevoland/evaluate`. Tested in Tasks 2 and 4.
4. **A deploy without credentials refuses to start** on ACC and PROD for both backends, and starts normally
   in local development. Tested in Tasks 6 and 9.
5. **A browser on another origin** can preflight and call a public `evaluate`, and gets no CORS header on
   anything else, including from the engine itself. Tested in Task 4.

---

## Pull requests and order

| PR  | Repository / branch                               | Tasks | Rollout step it serves        |
| --- | ------------------------------------------------- | ----- | ----------------------------- |
| A   | RBA `fix/operaton-engine-rest-log` (from `acc`)   | 1     | 1: find every caller (7 days) |
| B   | RBA `fix/operaton-engine-rest-auth` (this branch) | 2–8   | 2–7                           |
| C   | LDE `fix/operaton-basic-auth` (from LDE `acc`)    | 9     | 4                             |

PR A is small and merges first, so the owner can start the 7-day log while B and C are built.

---

### Task 1: Access log for `engine-rest` (PR A)

**Files:**

- Modify: `deployment/vm/caddy/Caddyfile` (the `operaton.open-regels.nl` block)

**Interfaces:**

- Produces: log file `/data/logs/operaton-engine-rest.log` inside the `caddy` container (volume `caddy_data`).

- [ ] **Step 1:** Branch `fix/operaton-engine-rest-log` from `acc`.
- [ ] **Step 2:** In the `operaton.open-regels.nl` block, add a `log` directive writing JSON to
      `/data/logs/operaton-engine-rest.log` with `roll_keep 7`, and `log_skip` for every path not matching
      `/engine-rest/*`. Caddy redacts `Authorization` in access logs by default (`log_credentials` is off), so no
      credentials are logged. Add a comment that this block is temporary (#415, rollout step 1, removed in step 8).
- [ ] **Step 3: Verify.** Run
      `docker run --rm -v "$PWD/deployment/vm/caddy:/etc/caddy:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`.
      Expected: `Valid configuration`. Then run `caddy fmt --diff` the same way. Expected: no diff.
- [ ] **Step 4:** Stage, report, **ask before committing**. Push, and open PR A against `acc`. The body says
      this is rollout step 1 of #415, that the owner applies it by hand on the VM, and how to read the log
      (`docker exec caddy cat /data/logs/operaton-engine-rest.log`).

---

### Task 2: Account provisioning script, proven on Operaton 1.0.0

**Files:**

- Create: `deployment/vm/operaton/provision-accounts.sh` (POSIX `sh`, `curl` only, no `jq`)
- Create: `deployment/vm/operaton/test/docker-compose.yml` (project `op415`, `operaton/operaton:1.0.0` as
  `op415-operaton` on host port 8091)
- Create: `deployment/vm/operaton/test/fixtures/` (a minimal untenanted DMN `op415_public`, the same DMN
  deployed again with tenant ID `flevoland`, and a minimal BPMN `op415_case` with one user task)
- Create: `deployment/vm/operaton/test/check-engine.sh`

**Interfaces:**

- Produces: `provision-accounts.sh`. Inputs, all from the environment:
  - `OPERATON_URL`, the engine-rest base;
  - `OPERATON_ADMIN_USER` and `OPERATON_ADMIN_PASSWORD`, an existing admin (`demo`);
  - `SERVICE_ACCOUNTS`, space-separated IDs to create in `operaton-admin`, each with its password in
    `PW_<ID upper-cased, dashes to underscores>`;
  - `EXISTING_ADMIN_MEMBERS`, space-separated IDs of existing users to add to `operaton-admin`;
  - `PUBLIC_READER_PASSWORD`.

  It is idempotent: it creates a missing user, adds a missing membership, and creates a missing
  authorization. It exits non-zero on any unexpected HTTP status and prints which call failed.

- Produces: the settings mechanism every later task copies. **Try `JAVA_OPTS` `-D` flags first**, because
  map keys under `generic-properties` lose their dashes under environment-variable binding. Record the one
  that works in a comment at the top of the test compose file.

- [ ] **Step 1: Write `check-engine.sh`.** It takes the engine-rest base URL (default
      `http://localhost:8091/engine-rest`) and the admin credentials, seeds the fixtures (deploys them and starts
      one `op415_case` instance as admin), and asserts this matrix, printing one PASS/FAIL line each and exiting
      non-zero on any FAIL:

  | As              | Call                                                                      | Expected                                    |
  | --------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
  | none            | `GET /version`                                                            | 401                                         |
  | public-reader   | `GET /decision-definition?key=op415_public`                               | 200, 2 results (untenanted and `flevoland`) |
  | public-reader   | `GET /deployment` and `…/resources/{rid}/data` of the fixture             | 200, body contains `op415_public`           |
  | public-reader   | `POST /decision-definition/key/op415_public/evaluate`                     | 200                                         |
  | public-reader   | `POST /decision-definition/key/op415_public/tenant-id/flevoland/evaluate` | 200                                         |
  | public-reader   | `GET /process-instance/count` and `GET /task/count`                       | 200, `{"count":0}`                          |
  | public-reader   | `GET /history/process-instance/count`                                     | 200, `{"count":0}`                          |
  | public-reader   | `GET /process-instance/{id}/variables`                                    | 403                                         |
  | public-reader   | `POST /deployment/create` (fixture DMN)                                   | 403                                         |
  | public-reader   | `POST /process-definition/key/op415_case/start`                           | 403                                         |
  | service account | `GET /process-instance/count`                                             | 200, count ≥ 1                              |
  | service account | `GET /decision-definition?tenantIdIn=flevoland`                           | 200, 1 result                               |

- [ ] **Step 2: Run the check against the bare 1.0.0 container** (no auth settings). Bring it up with
      `docker compose -p op415 -f deployment/vm/operaton/test/docker-compose.yml up -d`.
      Expected: FAIL on the first row (`200`, not `401`). This proves the check can fail.
- [ ] **Step 3:** Add the four settings from Global constraints to the test compose file
      (`run.auth.enabled=true`, `authorization.enabled=true`, `tenant-check-enabled=false`,
      `run.cors.enabled=false`). Implement `provision-accounts.sh` and wire it in as a one-shot `op415-accounts`
      service using `curlimages/curl`, pinned as `<current tag>@sha256:<digest>`. It runs after the engine
      answers (`401` counts as up, retried for up to 120 s) with `SERVICE_ACCOUNTS="rba-backend lde-backend"`,
      `EXISTING_ADMIN_MEMBERS=""` and fixed local passwords.
- [ ] **Step 4: Recreate and run the check.** Expected: every row PASS. If a row fails because of the setting
      mechanism (for example tenant-scoped rows), switch that key to the other mechanism and record why in the
      compose comment.
- [ ] **Step 5: Idempotence.** Run the provisioning service a second time. Expected: exit 0, no new
      authorizations (`GET /authorization/count?userIdIn=public-reader` unchanged from the first run).
- [ ] **Step 6:** Tear down with `docker compose -p op415 … down -v`. Stage, report, **ask before committing**.

---

### Task 3: VM Operaton compose — pin 1.0.0 and the settings

**Files:**

- Modify: `deployment/vm/operaton/prod/docker-compose.yml`

**Interfaces:**

- Consumes: the setting mechanism recorded in Task 2.

- [ ] **Step 1:** Replace `image: operaton/operaton:${OPERATON_TAG}` with `image: operaton/operaton:1.0.0`.
      Add a comment: the running digest `sha256:74659f07…` is Docker Hub's 1.0.0, the upgrade is #423, and digest
      pinning is #196. `OPERATON_NAME` and `OPERATON_DATA` stay in the VM's `.env`. The runbook (Task 8) tells the
      owner to remove `OPERATON_TAG` there.
- [ ] **Step 2:** Add the four settings, the same way as Task 2's compose file. Replace the non-existent
      `-Doperaton.cors.enabled=false` with the real `run.cors.enabled=false`. Keep `-XX:MaxRAMPercentage=70.0`,
      the H2 `DB_URL`, the network and `ipv4_address: 172.18.0.10` unchanged.
- [ ] **Step 3: Verify.** Run `docker compose -f deployment/vm/operaton/prod/docker-compose.yml config` with
      `OPERATON_NAME=x OPERATON_DATA=/tmp/x` exported. Expected: it renders, with image `operaton/operaton:1.0.0`
      and the settings present.
- [ ] **Step 4:** Stage, report, **ask before committing**.

---

### Task 4: Caddy public allowlist

**Files:**

- Create: `deployment/vm/caddy/operaton-engine-rest.caddy` (the `engine-rest` handling, imported)
- Modify: `deployment/vm/caddy/Caddyfile` (the `operaton.open-regels.nl` block: remove the old OPTIONS and
  `@api` handles, `import operaton-engine-rest.caddy`)
- Modify: `deployment/vm/caddy/docker-compose.yml` (`env_file: ./caddy.env`, and mount
  `./operaton-engine-rest.caddy:/etc/caddy/operaton-engine-rest.caddy:ro`)
- Modify: `.gitignore` (`deployment/vm/caddy/caddy.env`)
- Modify: `deployment/vm/operaton/test/docker-compose.yml` (add `op415-caddy` on host port 8090, importing the
  same file, with `OPERATON_UPSTREAM=op415-operaton:8080`)
- Create: `deployment/vm/operaton/test/check-allowlist.sh`

**Interfaces:**

- Consumes: Task 2's harness and accounts.
- Produces: the imported file uses `{$OPERATON_UPSTREAM:172.18.0.10:8080}` as upstream and
  `{$OPERATON_PUBLIC_READER_AUTH}` for the injected header.

- [ ] **Step 1: Write `check-allowlist.sh`** against `http://localhost:8090`, with no credentials unless a row
      says so. It asserts:
  - **200 anonymous:** `GET /engine-rest/process-definition`, `…/process-definition/count`,
    `…/process-definition/key/op415_case`, `…/process-definition/key/op415_case/xml`,
    `…/decision-definition/key/op415_public/xml`, `…/decision-definition/{id}`,
    `…/decision-requirements-definition`, `…/deployment`, `…/deployment/count`,
    `…/deployment/{id}/resources`, `…/deployment/{id}/resources/{rid}/data`;
    `POST …/decision-definition/key/op415_public/evaluate` and
    `…/key/op415_public/tenant-id/flevoland/evaluate`.
  - **401 anonymous:** `GET /engine-rest/version`, `…/process-instance`, `…/process-instance/count`,
    `…/task`, `…/task/count`, `…/history/process-instance`, `…/variable-instance`, `…/incident`, `…/user`,
    `…/authorization`, `…/process-definition/statistics`, `…/process-definition/{id}/statistics`,
    `…/process-definition/{id}/form-variables`, `…/process-definition/key/op415_case/form-variables`;
    `POST …/deployment/create`, `…/process-definition/key/op415_case/start`;
    `PUT …/decision-definition/{id}/history-time-to-live`.
  - **Path tricks never leak case data** (Review focus 1): `GET /engine-rest/deployment/../process-instance`,
    `…/deployment/%2e%2e/process-instance`, `…//process-instance`, `…/deployment%2F..%2Fprocess-instance`,
    `/Engine-Rest/process-instance`, `…/process-instance/`. Each must be 401 or 404, or, if Caddy
    forwards it as `public-reader`, a body with no instance ID.
  - **Identity kept** (Review focus 2): `POST …/decision-definition/key/op415_public/evaluate` with
    `Authorization: Basic` of a wrong password → 401. `GET …/process-instance/count` with the
    `rba-backend` credentials → 200, count ≥ 1.
  - **CORS** (Review focus 5): a public `GET` has `Access-Control-Allow-Origin: *` and no
    `Access-Control-Allow-Credentials`. `OPTIONS …/decision-definition/key/op415_public/evaluate` with
    `Origin` and `Access-Control-Request-Method: POST` → 204 with `Access-Control-Allow-Origin: *`.
    `GET …/version` with an `Origin` header, and `OPTIONS …/process-instance`, carry **no**
    `Access-Control-Allow-Origin`.
- [ ] **Step 2: Run it against the current `@api` block** (copy the old handles into a temporary test
      import). Expected: FAIL on the 401 rows. Then delete the temporary copy.
- [ ] **Step 3: Write `operaton-engine-rest.caddy`.** Public `GET` and public `POST` (evaluate) are
      separate named matchers. Each combines `method`, a `path_regexp` that enumerates the allowed shapes from
      Step 1 (anchored `^…$`, with `statistics` and `form-variables` excluded), and `not header Authorization *`.
      Matched requests are proxied with `header_up Authorization "Basic {$OPERATON_PUBLIC_READER_AUTH}"` and get
      `header_down` CORS (`Access-Control-Allow-Origin "*"`, `Access-Control-Allow-Methods "GET, POST, OPTIONS"`,
      `Access-Control-Allow-Headers "Content-Type"`). OPTIONS answers 204 with those headers only for public
      paths. Every other `/engine-rest/*` request is proxied unchanged, with
      `header_down -Access-Control-Allow-Origin`. One comment line per allowlist entry says why it is public.
- [ ] **Step 4:** Recreate the harness and run `check-engine.sh` and `check-allowlist.sh`. Expected: all
      PASS. Run `caddy validate` and `caddy fmt --diff` on the VM Caddyfile, with the import resolvable.
      Expected: valid, no diff.
- [ ] **Step 5:** Tear down. Stage, report, **ask before committing**.

---

### Task 5: Local stack — same settings, accounts provisioned

**Files:**

- Modify: `docker-compose.yml` (`operaton` service on 2.1.5: the four settings; new one-shot
  `operaton-accounts` reusing `deployment/vm/operaton/provision-accounts.sh`, after `operaton`)
- Modify: `packages/backend/.env.example` (`OPERATON_USERNAME=rba-backend`, `OPERATON_PASSWORD=rba-backend`,
  with a comment that the local engine now requires them)

**Interfaces:**

- Consumes: Task 2's script and setting mechanism.
- Produces: local accounts `rba-backend`/`rba-backend`, `lde-backend`/`lde-backend` and
  `public-reader`/`public-reader`. These are local-only, non-secret passwords.

- [ ] **Step 1:** Make the changes. Run `docker compose config`. Expected: it renders.
- [ ] **Step 2: Hand off** to the owner: they put the local credentials in their own `packages/backend/.env`
      and in LDE's, then restart the local stack themselves (`docker compose up -d operaton operaton-accounts`).
      Do not run it yourself.
- [ ] **Step 3:** After the owner confirms the restart, run
      `deployment/vm/operaton/test/check-engine.sh http://localhost:8081/engine-rest demo demo`.
      Expected: all PASS, proving the settings on 2.1.5 as well.
- [ ] **Step 4:** Stage, report, **ask before committing**.

---

### Task 6: RBA backend — worker credentials and the start-up check

**Files:**

- Create: `packages/backend/src/utils/operaton-auth.ts`
- Modify: `packages/backend/src/services/externalTaskWorker.service.ts` (`fetchAndLock`, `complete`,
  `failure`)
- Modify: `packages/backend/src/utils/config.ts` (`validateConfig`, next to the `OPERATON_BASE_URL` check)
- Test: `packages/backend/src/utils/operaton-auth.test.ts`,
  `packages/backend/src/services/externalTaskWorker.service.test.ts`,
  `packages/backend/src/utils/config.test.ts` (`describe('validateConfig')`)

**Interfaces:**

- Produces:
  `operatonBasicAuth(username?: string, password?: string): AxiosBasicCredentials | undefined`. It defaults
  to `config.operaton.username`/`password`, and returns `undefined` unless both are non-empty.

- [ ] **Step 1: Write failing tests.**
  - `operaton-auth.test.ts`: it returns `{ username: 'u', password: 'p' }` for `('u','p')`, and
    `undefined` for `('u', '')` and `('', 'p')`.
  - Worker test: with config username `svc` and password `pw`, each of the three `axios.post` calls receives
    `expect.objectContaining({ auth: { username: 'svc', password: 'pw' } })`. With no credentials, the third
    argument has no `auth` key.
  - `validateConfig`: with `NODE_ENV=production`, it reports `'OPERATON_USERNAME is required in production'`
    when that is unset, and `'OPERATON_PASSWORD is required in production'` when that is unset, and neither
    when both are set. With `NODE_ENV=development`, it reports neither when both are unset.
- [ ] **Step 2: Run them.** `npx jest src/utils/operaton-auth.test.ts src/services/externalTaskWorker.service.test.ts src/utils/config.test.ts --coverage=false`
      in `packages/backend`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. The worker passes `auth: operatonBasicAuth()` when it is defined. The
      `validateConfig` check reads `process.env`, like the `OPERATON_BASE_URL` check beside it.
- [ ] **Step 4:** Run the same command again. Expected: PASS. Then run `npm run type-check` and `npm run lint`
      at the root. Expected: clean.
- [ ] **Step 5:** Hand the owner `npm test --workspace=@ronl/backend` and wait for their green. Stage,
      report, **ask before committing**.

---

### Task 7: RBA e2e helpers and RIP scripts send credentials

**Files:**

- Modify: `packages/frontend/e2e/helpers/target.ts` (new `OPERATON_USERNAME`/`OPERATON_PASSWORD`, default
  `demo`/`demo`, and `operatonFetch`)
- Modify: `packages/frontend/e2e/helpers/operaton-cleanup.ts`, `helpers/tasks.ts`,
  `helpers/required-processes.ts` (every `fetch` to an Operaton URL goes through `operatonFetch`)
- Modify: `scripts/rip-phase-walkthrough.sh`, `scripts/rip-r21-to-approval.sh`, `docs/RIP-WALKTHROUGH-SCRIPTS.md`
- Test: the local e2e suite itself. Vitest excludes `e2e/**` (`packages/frontend/vite.config.ts`), so the
  helpers are proven by the run they serve.

**Interfaces:**

- Produces: `operatonFetch(url: string, init?: RequestInit): Promise<Response>` in `target.ts`. It adds
  `Authorization: Basic base64(OPERATON_USERNAME:OPERATON_PASSWORD)` and keeps any headers the caller passes.
- Produces (both scripts): `ocurl()`, a shell function wrapping `curl` with
  `-u "$OPERATON_USERNAME:$OPERATON_PASSWORD"` when both are set.

- [ ] **Step 1: Show the failure first.** With the local stack authenticated (Task 5), the owner runs one
      spec that uses the helpers, such as `e2e/rip-r21-journey.spec.ts`, with their usual e2e command. Expected:
      it fails on an Operaton `401` in `tasks.ts`, `required-processes.ts` or the cleanup.
- [ ] **Step 2:** Run `bash -n scripts/rip-phase-walkthrough.sh scripts/rip-r21-to-approval.sh`. Expected: no
      output. This is the syntax baseline before editing.
- [ ] **Step 3:** Implement. Replace the Operaton `fetch` calls. In both scripts, replace every `curl` aimed
      at `${OPERATON_URL}` with `ocurl`. Document the two variables in each script's header and in
      `docs/RIP-WALKTHROUGH-SCRIPTS.md`.
- [ ] **Step 4:** Run `bash -n` on both scripts again. Expected: no output. Run `grep -n 'curl ' scripts/rip-*.sh`.
      Expected: no remaining bare `curl` to `${OPERATON_URL}`. Run `npm run type-check` and `npm run lint`.
      Expected: clean.
- [ ] **Step 5:** Hand the owner the local e2e run against the authenticated local stack. Their usual
      command; expected all green, as before this change. Wait for the green. Stage, report, **ask before
      committing**.

---

### Task 8: Runbook, then PR B

**Files:**

- Create: `deployment/vm/operaton/README.md`

- [ ] **Step 1:** Write the runbook as the design's rollout steps 2–8, made concrete with the commands from
      Tasks 2–4:
  - **2:** run `provision-accounts.sh` against the VM as `demo`, with
    `SERVICE_ACCOUNTS="rba-backend-acc rba-backend-prod lde-backend-acc lde-backend-prod"` and the four
    personal IDs in `EXISTING_ADMIN_MEMBERS`, typed at run time.
  - **3:** read first, then hand the owner a script for the App Service settings: RBA ACC/PROD in
    `rg-ronl-acc`/`rg-ronl-prod`, LDE ACC/PROD in `RONL-Preproduction`. Restart, then check `/v1/health`. RBA
    PROD's stray `OPERATON_URL` is removed in the same pass.
  - **4:** merge PR B and PR C, and promote both.
  - **5:** apply the Task 3 compose, remove `OPERATON_TAG` from the VM's `.env`, then
    `docker compose up -d`.
  - **6:** create `caddy.env` with `OPERATON_PUBLIC_READER_AUTH`, copy in the Caddyfile and the import, then
    `docker compose up -d` (env_file changes need a recreate, not a reload).
  - **7:** the external check: Spec correction 1's three calls answer `401`; a public DMN source fetch and a
    public `evaluate` answer `200`; `demo` with a wrong password answers `401`; the four `/v1/health`
    endpoints are green; one RIP run and the ACC e2e suite pass.
  - **8:** remove Task 1's log block and delete the log.
  - **Rollback:** as in the design.
- [ ] **Step 2:** Run `npx prettier --check deployment/vm/operaton/README.md`. Expected: clean. Stage,
      report, **ask before committing**.
- [ ] **Step 3:** **Ask before pushing and opening PR B** against `acc`. The body lists the rollout order and
      says that merging changes nothing on the VM.
- [ ] **Step 4:** **Ask before posting** a comment on #196 saying that `deployment/vm/operaton/` now exists
      (pinned to `1.0.0`, applied by hand), as the design promised.

---

### Task 9: LDE basic auth (PR C, linked-data-explorer)

**Files (in `linked-data-explorer`, branch `fix/operaton-basic-auth` from `acc`):**

- Modify: `packages/backend/src/utils/config.ts` (`operaton.username`/`password` from
  `OPERATON_USERNAME`/`OPERATON_PASSWORD`; remove `apiKey`; extend `validateConfig`)
- Modify: `packages/backend/src/services/operaton.service.ts` (axios `auth` instead of the `Bearer` header)
- Modify: `packages/backend/src/services/externalTaskWorker.service.ts` (three calls)
- Modify: `packages/backend/src/routes/health.routes.ts` (`/version` probe)
- Modify: `packages/backend/.env.example` (replace the `OPERATON_API_KEY` line with
  `OPERATON_USERNAME=lde-backend` / `OPERATON_PASSWORD=lde-backend`)
- Test: `operaton.service.test.ts`, `externalTaskWorker.service.test.ts`, `health.routes.test.ts`,
  `config.test.ts` (`describe('validateConfig')`)

**Interfaces:**

- Produces: `config.operaton.username?: string`, `config.operaton.password?: string`. The same
  `operatonBasicAuth()` contract as Task 6, in `packages/backend/src/utils/operaton-auth.ts`.

- [ ] **Step 1: Write failing tests.**
  - The service's axios instance is created with `auth: { username: 'svc', password: 'pw' }`, and with no
    `Authorization` header.
  - The worker's three calls and the health probe each pass `auth`.
  - `validateConfig` throws `Missing required configuration: operaton.username, operaton.password` when
    `DEPLOYMENT_ENV=acc` (and again with `prod`) and both are unset. It does not throw for
    `DEPLOYMENT_ENV=development`, nor under `NODE_ENV=test`.
- [ ] **Step 2: Run them.** `npx jest src/services/operaton.service.test.ts src/services/externalTaskWorker.service.test.ts src/routes/health.routes.test.ts src/utils/config.test.ts --coverage=false`
      in `packages/backend`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. The tier test is `['ACC', 'PROD'].includes(config.displayEnv)`. Remove
      `OPERATON_API_KEY` everywhere: `grep -rn OPERATON_API_KEY` returns nothing outside the changelog.
- [ ] **Step 4:** Run the same command again. Expected: PASS. Run LDE's type-check and lint. Expected: clean.
- [ ] **Step 5:** Hand the owner LDE's `npm test` and a local check: the LDE backend against the
      authenticated local engine deploys and evaluates a DMN from ttl-editor, and its worker completes a task.
      Wait for the green. Stage, report, **ask before committing**. Then **ask before pushing and opening PR C**,
      whose body links #415 and says the LDE App Service settings must be set before it deploys (rollout step 3).
