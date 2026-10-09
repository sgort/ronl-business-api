# eDOCS background attribution ("namens …") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the service account `testuser001` archives a document because an employee acted on a process, the document records that employee as "namens <naam> (<e-mail>)".

**Architecture:** The backend stamps two reserved process variables, `edocsAuthor` (e-mail, or `preferred_username` as a fallback) and `edocsAuthorName`, when a member of staff starts a process or completes a user task. The Operaton worker and ValidSign completion read them and pass an `author` to `EdocsService.uploadDocument`. One function in `edocs.service.ts`, `attributedDocName`, appends "namens …" to the document title (Onderwerp); it is the only place that knows how attribution is expressed in eDOCS.

**Tech Stack:** Node/Express backend (TypeScript), Jest + supertest, Operaton REST, OpenText eDOCS DM REST.

**Spec:** `docs/superpowers/specs/2026-10-01-edocs-per-user-entra-design.md`, §6 "Background archiving with attribution". PR 3 of three; PR 1 (#324) and PR 2 (#332, #334) are merged.

## Global Constraints

- `AUTHOR_ID` and `TYPIST_ID` stay `config.edocs.userId` (`testuser001`) on every service write. The service account cannot set `AUTHOR_ID` to another user (probe and Flevoland IT, 6 October 2026).
- The text is exactly `namens <naam> (<e-mail>)`; without a name it is `namens <e-mail>`.
- The text goes at the end of the document title (DOCNAME, "Onderwerp" in InfoCenter): `<title> — namens <naam> (<e-mail>)`. Decided 8 October 2026: InfoCenter shows neither `ABSTRACT` nor `DESCRIPTION` on the `D_INTERN_NIEUW` form, and the title is visible in the profile, the lists and search. A later move to another field changes only `attributedDocName`.
- Workspaces carry no attribution: a workspace is the project's, shared by everyone who acts on it. (Spec §6 passes `author` to `ensureWorkspace` too; that is dropped with the move to the title.)
- No `edocsAuthor` (a process started outside RBA, by a citizen, or by an M2M client) → today's behaviour: `testuser001`, no "namens" text.
- Citizens are never stamped: they are not employees, and a citizen's `preferred_username` may be a BSN.
- `edocsAuthor` and `edocsAuthorName` join `RESERVED_PROCESS_VARIABLES`: a completion that sends them gets `400 RESERVED_VARIABLE` (both `/v1/task` and `/v1/m2m/task`). The M2M start refuses them too. The user start route overwrites or strips them, as it does `municipality`.
- No new configuration setting.
- Never log the author's e-mail or name: log `attributed: true|false`.
- Errors stay RFC 9457 problem details via `sendProblem`; no new codes.
- Tests first everywhere. The user runs `npm test --workspace=@ronl/backend` per task and approves each commit; no `Co-Authored-By` or other attribution lines in commits.

## Review Focus

1. **A very long title or name** — the attributed title stays within 254 characters, shortening the title rather than the attribution, so eDOCS never rejects the archive upload for it (pinned in Task 1).
2. **A client that sends `edocsAuthor` itself** at start or completion — it must never reach Operaton as sent: overwritten or stripped at user start, 400 on completion and M2M start (pinned in Task 2).
3. **A citizen starting a process** — no `edocsAuthor`, even if the body carries one (pinned in Task 2).
4. **A staff token with neither `email` nor `preferred_username`** — nothing is stamped and the previous author is kept; no empty "namens" text (pinned in Task 2, and `attributedDocName` leaves the title alone for an empty e-mail in Task 1).
5. **Several employees act on one process** — the last one who started it or completed a task is recorded; a completion overwrites the author of the start (pinned in Task 2 by the completion test, which expects both variables in the completion).

---

## File Structure

| File                                                           | Responsibility                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/services/edocs.service.ts`               | `EdocsAuthor`, `attributedDocName()`; `uploadDocument` metadata gains `author`                                       |
| `packages/backend/src/services/edocs-author.ts` (new)          | Who acted: `EDOCS_AUTHOR_VARIABLES`, `edocsAuthorVariables(user)` (stamping), `edocsAuthorFrom(variables)` (reading) |
| `packages/backend/src/auth/tenant-access.ts`                   | `RESERVED_PROCESS_VARIABLES` gains the two names                                                                     |
| `packages/backend/src/routes/process.routes.ts`                | Stamp at start; strip client-sent values                                                                             |
| `packages/backend/src/routes/task.routes.ts`                   | Stamp at completion                                                                                                  |
| `packages/backend/src/routes/m2m.routes.ts`                    | `RESERVED_AT_START` gains the two names                                                                              |
| `packages/backend/src/services/externalTaskWorker.service.ts`  | Fetch the two variables; pass `author`                                                                               |
| `packages/backend/src/services/operaton.service.ts`            | `findInstanceByValidsignPackage` returns `author`                                                                    |
| `packages/backend/src/services/validsignCompletion.service.ts` | Pass `author` to both uploads                                                                                        |
| `docs/EDOCS-GO-LIVE.md`                                        | How attribution works and how to check it                                                                            |

---

### Task 1: The attribution function in the eDOCS service

**Files:**

- Modify: `packages/backend/src/services/edocs.service.ts` (types near line 25; `uploadDocument` ~line 470)
- Test: `packages/backend/src/services/edocs.service.test.ts`

**Interfaces:**

- Produces:
  - `export interface EdocsAuthor { email: string; name?: string }`
  - `export function attributedDocName(docName: string, author?: EdocsAuthor): string`
  - `EdocsDocumentMetadata.author?: EdocsAuthor`

- [ ] **Step 1: Write the failing tests**

Add `attributedDocName` to the imports of `edocs.service.test.ts` (next to `EdocsService`). Add a new top-level `describe`:

```ts
describe('attributedDocName', () => {
  it('appends "namens <naam> (<e-mail>)" to the title', () => {
    expect(
      attributedDocName('RIP-1 — Intake Report', {
        email: 'steven.gort@flevoland.nl',
        name: 'Steven Gort',
      })
    ).toBe('RIP-1 — Intake Report — namens Steven Gort (steven.gort@flevoland.nl)');
  });

  it('appends only the e-mail when there is no name', () => {
    expect(attributedDocName('Doc', { email: 'a@flevoland.nl' })).toBe(
      'Doc — namens a@flevoland.nl'
    );
  });

  it('leaves the title alone without an author, or with an empty e-mail', () => {
    expect(attributedDocName('Doc', undefined)).toBe('Doc');
    expect(attributedDocName('Doc', { email: '  ' })).toBe('Doc');
  });

  it('shortens the title, never the attribution, to stay within 254 characters', () => {
    const result = attributedDocName('t'.repeat(300), { email: 'a@b.nl', name: 'An Example' });
    expect(result).toHaveLength(254);
    expect(result.endsWith(' — namens An Example (a@b.nl)')).toBe(true);
  });

  it('cuts an attribution that alone is longer than 254 characters', () => {
    expect(attributedDocName('Doc', { email: 'a@b.nl', name: 'x'.repeat(400) })).toHaveLength(254);
  });
});
```

Inside `describe('uploadDocument()')` (live mode), add:

```ts
it('records the author in the title and keeps the service account as AUTHOR_ID', async () => {
  mockClient.post
    .mockResolvedValueOnce(connectResponse)
    .mockResolvedValueOnce({ data: { data: { list: [{ id: 'doc-a', DOCNUM: '1' }] } } });

  await svc.uploadDocument(null, 'a.pdf', 'YmFzZTY0', {
    docName: 'Signed',
    department: 'IVR',
    author: { email: 'a@flevoland.nl', name: 'An Example' },
  });

  expect(lastProfileData()).toMatchObject({
    DOCNAME: 'Signed — namens An Example (a@flevoland.nl)',
    AUTHOR_ID: 'svc-user',
    TYPIST_ID: 'svc-user',
  });
});

it('keeps the title as given without an author', async () => {
  mockClient.post
    .mockResolvedValueOnce(connectResponse)
    .mockResolvedValueOnce({ data: { data: { list: [{ id: 'doc-c', DOCNUM: '3' }] } } });

  await svc.uploadDocument(null, 'c.pdf', 'YmFzZTY0', { docName: 'Plain', department: 'IVR' });

  expect(lastProfileData().DOCNAME).toBe('Plain');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd packages/backend && npx jest src/services/edocs.service.test.ts`
Expected: FAIL — `attributedDocName` is not exported, and TypeScript rejects `author` on the metadata.

- [ ] **Step 3: Implement**

In `edocs.service.ts`, add `author` to `EdocsDocumentMetadata` and the new exports right after it:

```ts
  extra?: Record<string, string>;
  /** The employee a service write is done for — recorded as "namens …", never as AUTHOR_ID. */
  author?: EdocsAuthor;
}

/** The employee who caused a background write (spec §6). */
export interface EdocsAuthor {
  email: string;
  name?: string;
}

/** eDOCS' title (DOCNAME) limit, kept below so a long name never makes eDOCS reject the upload. */
const MAX_DOCNAME_LENGTH = 254;

/**
 * The title with "namens <naam> (<e-mail>)" appended. The service account may only
 * record itself as AUTHOR_ID (probe and Flevoland IT, 6 October 2026), and the title
 * ("Onderwerp") is the one free-text field InfoCenter shows on the D_INTERN_NIEUW
 * form, so the employee goes there. The only place that knows how attribution is
 * written: a later move to another field, or to AUTHOR_ID (spec §6), changes this
 * function and nothing else.
 */
export function attributedDocName(docName: string, author?: EdocsAuthor): string {
  const email = author?.email.trim();
  if (!email) return docName;
  const name = author?.name?.trim();
  const suffix = ` — namens ${name ? `${name} (${email})` : email}`;
  const room = Math.max(0, MAX_DOCNAME_LENGTH - suffix.length);
  return (docName.slice(0, room) + suffix).slice(0, MAX_DOCNAME_LENGTH);
}
```

In `uploadDocument`, set the title through it, and add `attributed: Boolean(metadata.author)` to both the `[stub] uploadDocument()` and the `Uploading document to eDOCS` log objects:

```ts
      const profileData = {
        DOCNAME: attributedDocName(metadata.docName, metadata.author),
```

`ensureWorkspace` is **not** changed: a workspace is the project's, shared by everyone who acts on it, so its title names no employee.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd packages/backend && npx jest src/services/edocs.service.test.ts && npx tsc --noEmit -p . && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Hand off and commit**

Ask the user to run `npm test --workspace=@ronl/backend`. After their green and explicit approval:

```bash
git add packages/backend/src/services/edocs.service.ts packages/backend/src/services/edocs.service.test.ts
git commit -m "feat(edocs): record the employee a service upload is done for as \"namens …\" in its title"
```

---

### Task 2: Stamp `edocsAuthor` when staff start a process or complete a task

**Files:**

- Create: `packages/backend/src/services/edocs-author.ts`
- Create: `packages/backend/src/services/edocs-author.test.ts`
- Modify: `packages/backend/src/auth/tenant-access.ts:75-86` (`RESERVED_PROCESS_VARIABLES` and its comment)
- Modify: `packages/backend/src/auth/tenant-access.test.ts:167-169`
- Modify: `packages/backend/src/routes/process.routes.ts` (start handler, after the `municipality`/`originTenantId` lines ~line 117)
- Modify: `packages/backend/src/routes/task.routes.ts` (complete handler, after building `operatonVariables` ~line 336)
- Modify: `packages/backend/src/routes/m2m.routes.ts:138` (`RESERVED_AT_START`)
- Test: `process.routes.test.ts`, `task.routes.test.ts`, `m2m.routes.test.ts`

**Interfaces:**

- Consumes: `EdocsAuthor` from Task 1.
- Produces:
  - `export const EDOCS_AUTHOR_VARIABLES = ['edocsAuthor', 'edocsAuthorName'] as const`
  - `export function edocsAuthorVariables(user: Pick<AuthenticatedUser, 'roles' | 'email' | 'preferredUsername' | 'displayName'>): Record<string, OperatonVariable>`
  - `export function edocsAuthorFrom(variables: Record<string, { value?: unknown } | undefined>): EdocsAuthor | undefined`

- [ ] **Step 1: Write the failing unit tests**

Create `packages/backend/src/services/edocs-author.test.ts`:

```ts
import { EDOCS_AUTHOR_VARIABLES, edocsAuthorFrom, edocsAuthorVariables } from './edocs-author';

const staff = { roles: ['caseworker'] };

describe('edocsAuthorVariables', () => {
  it('stamps the e-mail and the display name of a member of staff', () => {
    expect(
      edocsAuthorVariables({ ...staff, email: 'a@flevoland.nl', displayName: 'An Example' })
    ).toEqual({
      edocsAuthor: { value: 'a@flevoland.nl', type: 'String' },
      edocsAuthorName: { value: 'An Example', type: 'String' },
    });
  });

  it('falls back to preferred_username, and leaves the name out when there is none', () => {
    expect(edocsAuthorVariables({ ...staff, preferredUsername: 'test-caseworker' })).toEqual({
      edocsAuthor: { value: 'test-caseworker', type: 'String' },
    });
  });

  it('stamps nothing for a citizen', () => {
    expect(
      edocsAuthorVariables({
        roles: ['citizen'],
        email: 'c@example.nl',
        preferredUsername: '999993653',
      })
    ).toEqual({});
  });

  it('stamps nothing when the token names nobody', () => {
    expect(edocsAuthorVariables({ ...staff, email: '', preferredUsername: undefined })).toEqual({});
  });
});

describe('edocsAuthorFrom', () => {
  it('reads the author from Operaton variables', () => {
    expect(
      edocsAuthorFrom({
        edocsAuthor: { value: 'a@flevoland.nl' },
        edocsAuthorName: { value: 'An Example' },
      })
    ).toEqual({ email: 'a@flevoland.nl', name: 'An Example' });
  });

  it('is undefined without edocsAuthor, or when it is not a non-empty string', () => {
    expect(edocsAuthorFrom({})).toBeUndefined();
    expect(edocsAuthorFrom({ edocsAuthor: { value: '' } })).toBeUndefined();
    expect(edocsAuthorFrom({ edocsAuthor: { value: 42 } })).toBeUndefined();
  });

  it('ignores a name that is not a string', () => {
    expect(
      edocsAuthorFrom({ edocsAuthor: { value: 'a@b.nl' }, edocsAuthorName: { value: null } })
    ).toEqual({ email: 'a@b.nl' });
  });

  it('names exactly the two variables', () => {
    expect(EDOCS_AUTHOR_VARIABLES).toEqual(['edocsAuthor', 'edocsAuthorName']);
  });
});
```

In `tenant-access.test.ts`, replace the exact-list test:

```ts
it('RESERVED_PROCESS_VARIABLES is the tenant-decision keys plus the eDOCS author', () => {
  expect(RESERVED_PROCESS_VARIABLES).toEqual([
    'municipality',
    'originTenantId',
    'applicantId',
    'edocsAuthor',
    'edocsAuthorName',
  ]);
});
```

- [ ] **Step 2: Write the failing route tests**

`process.routes.test.ts`: the jwt mock builds `req.user` from headers. Extend it so a test can give the user an identity — add inside the `req.user = { … }` object:

```ts
      ...(req.headers['x-test-email'] ? { email: req.headers['x-test-email'] } : {}),
      ...(req.headers['x-test-name'] ? { displayName: req.headers['x-test-name'] } : {}),
```

Then add inside `describe('POST /:key/start')`:

```ts
it('stamps the member of staff who started it as edocsAuthor', async () => {
  svc.startProcess.mockResolvedValue({ id: 'pi-a' });
  await auth(request(app).post('/v1/process/P/start'))
    .set('x-test-email', 'a@flevoland.nl')
    .set('x-test-name', 'An Example')
    .send({ variables: {} });
  const vars = svc.startProcess.mock.calls[0][1].variables;
  expect(vars.edocsAuthor).toEqual({ value: 'a@flevoland.nl', type: 'String' });
  expect(vars.edocsAuthorName).toEqual({ value: 'An Example', type: 'String' });
});

it('overwrites an edocsAuthor the caller sent', async () => {
  svc.startProcess.mockResolvedValue({ id: 'pi-b' });
  await auth(request(app).post('/v1/process/P/start'))
    .set('x-test-email', 'a@flevoland.nl')
    .send({ variables: { edocsAuthor: 'someone-else@x.nl', edocsAuthorName: 'Someone Else' } });
  const vars = svc.startProcess.mock.calls[0][1].variables;
  expect(vars.edocsAuthor).toEqual({ value: 'a@flevoland.nl', type: 'String' });
  expect(vars.edocsAuthorName).toBeUndefined();
});

it('strips edocsAuthor from a citizen start', async () => {
  svc.startProcess.mockResolvedValue({ id: 'pi-c' });
  await auth(request(app).post('/v1/process/P/start'))
    .set('x-test-roles', 'citizen')
    .set('x-test-email', 'c@example.nl')
    .send({ variables: { edocsAuthor: 'a@flevoland.nl' } });
  const vars = svc.startProcess.mock.calls[0][1].variables;
  expect(vars.edocsAuthor).toBeUndefined();
  expect(vars.edocsAuthorName).toBeUndefined();
});
```

`task.routes.test.ts`: extend its jwt mock the same way (`x-test-email`, `x-test-name` spread into `req.user`). Add inside `describe('POST /v1/task/:id/complete')`:

```ts
it.each(['edocsAuthor', 'edocsAuthorName'])(
  '400 RESERVED_VARIABLE when the body variables include %s',
  async (key) => {
    svc.getTask.mockResolvedValue(task());
    const res = await auth(request(app).post('/v1/task/t1/complete')).send({
      variables: { [key]: 'x' },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESERVED_VARIABLE');
    expect(svc.completeTask).not.toHaveBeenCalled();
  }
);

it('stamps the member of staff who completed it as edocsAuthor', async () => {
  svc.getTask.mockResolvedValue(task());
  svc.completeTask.mockResolvedValue(undefined);
  const res = await auth(request(app).post('/v1/task/t1/complete'))
    .set('x-test-email', 'a@flevoland.nl')
    .set('x-test-name', 'An Example')
    .send({ variables: { decision: 'granted' } });
  expect(res.status).toBe(200);
  expect(svc.completeTask).toHaveBeenCalledWith('t1', {
    variables: {
      decision: { value: 'granted', type: 'String' },
      edocsAuthor: { value: 'a@flevoland.nl', type: 'String' },
      edocsAuthorName: { value: 'An Example', type: 'String' },
    },
  });
});

it('keeps the previous author when the token names nobody', async () => {
  svc.getTask.mockResolvedValue(task());
  svc.completeTask.mockResolvedValue(undefined);
  await auth(request(app).post('/v1/task/t1/complete')).send({ variables: { decision: 'x' } });
  expect(svc.completeTask.mock.calls[0][1].variables).not.toHaveProperty('edocsAuthor');
});
```

`m2m.routes.test.ts`, in `describe('reserved process variables (#261)')`: widen the two `it.each` lists to include the author variables:

```ts
  it.each(['municipality', 'originTenantId', 'applicantId', 'edocsAuthor', 'edocsAuthorName'])(
    'POST /task/:id/complete refuses %s with 400 RESERVED_VARIABLE, before any engine call',
```

```ts
  it.each(['municipality', 'originTenantId', 'edocsAuthor', 'edocsAuthorName'])(
    'POST /process/:key/start refuses %s with 400 RESERVED_VARIABLE, before any engine call',
```

and add a comment above the second: `// A machine names no employee; edocsAuthor is set only by a person acting through /v1 (spec §6).`

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd packages/backend && npx jest src/services/edocs-author.test.ts src/auth/tenant-access.test.ts src/routes/process.routes.test.ts src/routes/task.routes.test.ts src/routes/m2m.routes.test.ts`
Expected: FAIL — `./edocs-author` does not exist; the reserved-list and route assertions fail.

- [ ] **Step 4: Implement**

Create `packages/backend/src/services/edocs-author.ts`:

```ts
import type { AuthenticatedUser, OperatonVariable } from '@ronl/shared';
import { isCitizen } from '@auth/tenant-access';
import type { EdocsAuthor } from '@services/edocs.service';

/**
 * Who last acted on a process through RBA (spec §6). Background archiving runs
 * as the service account and records this employee as "namens …". Set only by
 * the backend, from the caller's token: reserved against client writes.
 */
export const EDOCS_AUTHOR_VARIABLES = ['edocsAuthor', 'edocsAuthorName'] as const;

/**
 * The variables to stamp when a person starts a process or completes a task.
 * Empty for a citizen (not an employee; their username may be a BSN) and for a
 * token that names nobody — the previous author then stays.
 */
export function edocsAuthorVariables(
  user: Pick<AuthenticatedUser, 'roles' | 'email' | 'preferredUsername' | 'displayName'>
): Record<string, OperatonVariable> {
  if (isCitizen(user)) return {};
  const author = user.email?.trim() || user.preferredUsername?.trim();
  if (!author) return {};
  const name = user.displayName?.trim();
  return {
    edocsAuthor: { value: author, type: 'String' },
    ...(name && { edocsAuthorName: { value: name, type: 'String' } }),
  };
}

/** The author recorded on a process, from its Operaton variables. */
export function edocsAuthorFrom(
  variables: Record<string, { value?: unknown } | undefined>
): EdocsAuthor | undefined {
  const email = variables.edocsAuthor?.value;
  if (typeof email !== 'string' || !email) return undefined;
  const name = variables.edocsAuthorName?.value;
  return typeof name === 'string' && name ? { email, name } : { email };
}
```

`tenant-access.ts` imports only utilities, so importing `isCitizen` from it is safe. It must **not** import `edocs-author.ts` in turn: the reserved names stay literal there, and the unit tests of Step 1 pin both lists.

In `tenant-access.ts`, widen the list and its comment:

```ts
/**
 * Process variables that decide access, set only at process start
 * (resolveStartTenant, addTenantToProcessVariables), plus the eDOCS author the
 * backend stamps from the caller's token (services/edocs-author.ts). A user may
 * not write them -- a task completion that carried `municipality` would
 * relabel the whole instance, and one that carried `edocsAuthor` would archive
 * documents in another employee's name.
 */
export const RESERVED_PROCESS_VARIABLES: readonly string[] = [
  'municipality',
  'originTenantId',
  'applicantId',
  'edocsAuthor',
  'edocsAuthorName',
];
```

In `process.routes.ts`, import `{ EDOCS_AUTHOR_VARIABLES, edocsAuthorVariables } from '@services/edocs-author'` and add right after the `originTenantId` line:

```ts
// Who acted, for background eDOCS archiving (spec §6): from the token only,
// never from the body -- a sent value is dropped, as municipality is.
for (const name of EDOCS_AUTHOR_VARIABLES) delete operatonVariables[name];
Object.assign(operatonVariables, edocsAuthorVariables(req.user));
```

In `task.routes.ts`, import `{ edocsAuthorVariables } from '@services/edocs-author'` and add right after the loop that builds `operatonVariables`:

```ts
// The member of staff who completed it is the employee later archiving is
// done for (spec §6). The reserved check above has already refused a sent value.
Object.assign(operatonVariables, edocsAuthorVariables(req.user));
```

In `m2m.routes.ts`, widen `RESERVED_AT_START` and its comment:

```ts
const RESERVED_AT_START = [
  'municipality',
  'originTenantId',
  'edocsAuthor',
  'edocsAuthorName',
] as const;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd packages/backend && npx jest src/services/edocs-author.test.ts src/auth/tenant-access.test.ts src/routes/process.routes.test.ts src/routes/task.routes.test.ts src/routes/m2m.routes.test.ts && npx tsc --noEmit -p . && npm run lint`
Expected: PASS. Existing tests stay green: their mock users carry no `email` or `preferredUsername`, so nothing is stamped where they assert exact variables.

- [ ] **Step 6: Hand off and commit**

Ask the user to run `npm test --workspace=@ronl/backend`. After their green and explicit approval:

```bash
git add packages/backend/src/services/edocs-author.ts packages/backend/src/services/edocs-author.test.ts packages/backend/src/auth/tenant-access.ts packages/backend/src/auth/tenant-access.test.ts packages/backend/src/routes/process.routes.ts packages/backend/src/routes/process.routes.test.ts packages/backend/src/routes/task.routes.ts packages/backend/src/routes/task.routes.test.ts packages/backend/src/routes/m2m.routes.ts packages/backend/src/routes/m2m.routes.test.ts
git commit -m "feat(process): stamp the employee who acted as edocsAuthor, reserved against client writes"
```

---

### Task 3: Archiving passes the author

**Files:**

- Modify: `packages/backend/src/services/externalTaskWorker.service.ts` (fetchAndLock topics ~line 150; `handleUploadDocument`)
- Modify: `packages/backend/src/services/operaton.service.ts:880-926` (`findInstanceByValidsignPackage`)
- Modify: `packages/backend/src/services/validsignCompletion.service.ts` (both `uploadDocument` calls)
- Test: `externalTaskWorker.service.test.ts`, `operaton.service.test.ts`, `validsignCompletion.service.test.ts`

**Interfaces:**

- Consumes: `edocsAuthorFrom` (Task 2), `EdocsAuthor` and `EdocsDocumentMetadata.author` (Task 1).
- Produces: `findInstanceByValidsignPackage(...)` result gains `author?: EdocsAuthor`.

- [ ] **Step 1: Write the failing tests**

`externalTaskWorker.service.test.ts` — add to `describe('handleUploadDocument')`:

```ts
it('passes the employee who acted as the author', async () => {
  mockUpload.mockResolvedValue({ documentId: 'd1', documentNumber: '555', workspaceId: 'ws-1' });
  await internals(new ExternalTaskWorker()).handleUploadDocument(
    task('rip-edocs-document', { ...validVars, edocsAuthor: 'a@flevoland.nl' })
  );
  expect(mockUpload.mock.calls[0][3].author).toEqual({ email: 'a@flevoland.nl' });
});

it('passes no author when the process has none', async () => {
  mockUpload.mockResolvedValue({ documentId: 'd1', documentNumber: '555', workspaceId: 'ws-1' });
  await internals(new ExternalTaskWorker()).handleUploadDocument(
    task('rip-edocs-document', validVars)
  );
  expect(mockUpload.mock.calls[0][3]).not.toHaveProperty('author');
});
```

and to `describe('fetchAndLock')`:

```ts
it('fetches the author variables for the document topic only', async () => {
  mockPost.mockResolvedValue({ data: [] });
  await internals(new ExternalTaskWorker()).fetchAndLock();
  const topics: Array<{ topicName: string; variables: string[] }> =
    mockPost.mock.calls[0][1].topics;
  const byName = (name: string) => topics.find((t) => t.topicName === name)!.variables;
  expect(byName('rip-edocs-document')).toEqual(
    expect.arrayContaining(['edocsAuthor', 'edocsAuthorName'])
  );
  // A workspace is the project's: its title names no employee.
  expect(byName('rip-edocs-workspace')).not.toContain('edocsAuthor');
});
```

`operaton.service.test.ts` — next to the existing `describe('findInstanceByValidsignPackage')` (line 1490), add a case in the same style, with process variables `edocsAuthor` / `edocsAuthorName` in the mocked `/process-instance/{id}/variables` response, asserting:

```ts
expect(result?.author).toEqual({ email: 'a@flevoland.nl', name: 'An Example' });
```

and a case without them asserting `expect(result?.author).toBeUndefined();`.

`validsignCompletion.service.test.ts`, inside `describe('completeSignature')`:

```ts
it('archives both documents for the employee who acted', async () => {
  mockFindInstance.mockResolvedValue({
    processInstanceId: 'pi-1',
    taskId: 'task-1',
    status: 'sent',
    author: { email: 'a@flevoland.nl', name: 'An Example' },
  });
  mockGetPackageStatus.mockResolvedValue('COMPLETED');

  expect(await completeSignature('pkg-1')).toBe('completed');
  for (const call of mockUploadDocument.mock.calls) {
    expect(call[3].author).toEqual({ email: 'a@flevoland.nl', name: 'An Example' });
  }
});

it('archives without an author when the instance has none', async () => {
  mockFindInstance.mockResolvedValue({
    processInstanceId: 'pi-1',
    taskId: 'task-1',
    status: 'sent',
  });
  mockGetPackageStatus.mockResolvedValue('COMPLETED');

  await completeSignature('pkg-1');
  for (const call of mockUploadDocument.mock.calls) {
    expect(call[3]).not.toHaveProperty('author');
  }
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd packages/backend && npx jest src/services/externalTaskWorker.service.test.ts src/services/operaton.service.test.ts src/services/validsignCompletion.service.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

`externalTaskWorker.service.ts`: import `{ edocsAuthorFrom } from '@services/edocs-author'`. Add `'edocsAuthor', 'edocsAuthorName'` to the `variables` array of the `rip-edocs-document` topic (not `rip-edocs-workspace`).

In `handleUploadDocument`:

```ts
const author = edocsAuthorFrom(task.variables);
const result = await edocsService.uploadDocument(workspaceId, filename, contentBase64, {
  docName,
  department,
  ...(author && { author }),
});
```

`operaton.service.ts`: import `{ edocsAuthorFrom } from '@services/edocs-author'` and `type { EdocsAuthor } from '@services/edocs.service'`; add to the return type `/** The employee who last acted through RBA, for "namens …" (spec §6). */ author?: EdocsAuthor;` and to the returned object `author: edocsAuthorFrom(variables),`. The existing `findInstanceByValidsignPackage` test (`operaton.service.test.ts:1490`) asserts with `toEqual`, which ignores an `author: undefined`, so it stays green.

`validsignCompletion.service.ts`: add `...(found.author && { author: found.author })` to the metadata object of **both** `uploadDocument` calls:

```ts
          { docName: names.signedTitle, department, ...(found.author && { author: found.author }) }
```

```ts
await edocsService.uploadDocument(null, names.evidenceFile, evidence.toString('base64'), {
  docName: names.evidenceTitle,
  department,
  ...(found.author && { author: found.author }),
});
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd packages/backend && npx jest src/services && npx tsc --noEmit -p . && npm run lint`
Expected: PASS.

- [ ] **Step 5: Hand off and commit**

Ask the user to run `npm test --workspace=@ronl/backend`. After their green and explicit approval:

```bash
git add packages/backend/src/services/externalTaskWorker.service.ts packages/backend/src/services/externalTaskWorker.service.test.ts packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts packages/backend/src/services/validsignCompletion.service.ts packages/backend/src/services/validsignCompletion.service.test.ts
git commit -m "feat(edocs): the worker and ValidSign archive \"namens\" the employee who acted"
```

---

### Task 4: Documentation and the live check

**Files:**

- Modify: `docs/EDOCS-GO-LIVE.md`

- [ ] **Step 1: Document**

Add a section "Background archiving: namens …" to `docs/EDOCS-GO-LIVE.md`, after the section on the service account:

```markdown
## Background archiving: "namens …"

The Operaton worker (`rip-edocs-workspace`, `rip-edocs-document`) and ValidSign
completion archive as the service account `testuser001`. eDOCS lets the service
account record only itself as `AUTHOR_ID`, so the employee who caused the write is
recorded at the end of the document title (Onderwerp) as **"<title> — namens <naam> (<e-mail>)"**. InfoCenter shows no free-text summary field on the standalone-upload form (`D_INTERN_NIEUW`), so the title is where a colleague sees it. Workspaces carry no attribution: they belong to the project.

- The backend stamps `edocsAuthor` (e-mail, or the username) and `edocsAuthorName`
  when a member of staff starts a process or completes a user task. Citizens and
  M2M clients are never stamped.
- Both variables are reserved: a client that sends them gets `400 RESERVED_VARIABLE`
  (on start through `/v1/process` they are overwritten instead).
- A process without `edocsAuthor` archives as before, without "namens".
- `attributedDocName()` in `edocs.service.ts` is the only place that knows how
  attribution is written; a later switch to `AUTHOR_ID` changes only that function.

**Check it:** run a RIP phase that reaches `rip-edocs-document` locally with
`EDOCS_STUB_MODE=false`, signed in with the Flevoland account, and open the document
in InfoCenter: the Onderwerp ends with "namens <your name> (<your e-mail>)". In stub mode
the backend log shows `attributed: true` on `[stub] uploadDocument()`.
```

- [ ] **Step 2: Live check, by the user**

The user restarts the backend (the worker reads the new variables only after a restart) and runs a RIP phase that reaches `rip-edocs-document`, signed in with the Flevoland account, with `EDOCS_STUB_MODE=false` and `VALIDSIGN_STUB_MODE=true` (never sign for real in a test). Expected: in InfoCenter the archived document's Onderwerp ends with "— namens <naam> (<e-mail>)" and the Auteur is `TESTUSER001`. Started as `test-caseworker-flevoland`, the text reads "namens test-caseworker-flevoland" or that account's e-mail.

- [ ] **Step 3: Commit**

After the user's approval:

```bash
git add docs/EDOCS-GO-LIVE.md
git commit -m "docs(edocs): background archiving records \"namens\" the employee"
```
