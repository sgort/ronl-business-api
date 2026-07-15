# bump-release

Cut a release: flip the current Upcoming changelog entry to Released, version
**only the package(s) the release actually changed**, and reconcile the root
endpoint map.

> Why scope matters: the ACC build workflows are path-filtered
> (`packages/backend/**`, `packages/frontend/**`, `packages/shared/**`). Bumping
> `packages/backend/package.json` on a frontend-only release triggers _Build
> Backend for ACC_ for nothing — and makes the backend's runtime `/health`
> version lie. So bump-release versions per scope, and the package versions are
> allowed to drift apart.

## Steps

### 1. Determine the released version and scope

- Read `packages/frontend/src/pages/changelog-data.ts`
- The first entry in `changelog.versions` is the one being released — extract
  its `version` string (e.g. `'3.7.3'`). If an explicit version was passed as an
  argument, use that instead and find it in the array.
- Read that entry's `scope` field: `'frontend' | 'backend' | 'both'`.
  - `frontend` → bump root + `packages/frontend/package.json`
  - `backend` → bump root + `packages/backend/package.json`
  - `both` → bump all three
  - If `scope` is **absent**, do not guess silently — infer it from the diff in
    step 2, tell the user what you inferred, and ask them to add the `scope`
    field to the entry before continuing.

### 2. Cross-check scope against what actually changed

Guard against a mislabeled release (which would drift the package versions out of
sync with CI). Diff the release's changes against the previous release commit:

```bash
PREV=$(git log --grep='^chore: bump release' -n 1 --format=%H)
git diff --name-only "$PREV"..HEAD -- packages/
```

Map the touched top-level dirs to a scope:

- `packages/shared/**` changed → scope **must** be `both` (shared feeds both builds)
- only `packages/frontend/**` → `frontend`
- only `packages/backend/**` → `backend`
- both frontend and backend → `both`

If the declared `scope` does not cover the changed packages, **stop and warn**
the user with the specifics (declared vs. detected) and ask how to proceed. Do
not bump a package the release didn't touch, and do not skip one it did.

### 3. Flip the released entry to Released

Ensure the released entry carries the Released status and green colours,
whatever its current status (`Upcoming`, `Bug Fix`, etc.):

```ts
status: 'Released',
statusColor: '#2d7a33',
borderColor: '#c3e6cd',
```

### 4. Bump the in-scope package.json files

Read each file before editing (required by the Edit tool). Set `"version"` to
the released version in:

- `package.json` (repo root) — **always** (canonical product version; triggers no CI)
- `packages/frontend/package.json` — only if scope is `frontend` or `both`
- `packages/backend/package.json` — only if scope is `backend` or `both`

Leave an out-of-scope package.json untouched — its version legitimately lags at
the last release that changed it. Run the in-scope edits in parallel.

### 5. Reconcile the root endpoint map

- Read `packages/backend/src/index.ts`
- Collect every `app.use('/v1/...',` call (the mounted path is the key)
- Compare against the `endpoints` object in the root `app.get('/')` handler
- Add any missing routes; remove any stale ones
- Use camelCase keys that describe the domain, not the path
  (e.g. `curator` for `/v1/pa`, `mediaAggregator` for `/v1/media-aggregator`)
- Do not list `/v1/health` separately if it is already present — keep it
- Skip this step if scope is `frontend` (no backend routes could have changed)

### 6. Report and ask to commit

State:

- The version that was released, and its **scope**
- Which package.json files were bumped, and which were deliberately left behind
  (with their lagging version)
- Any endpoint keys that were added or removed
- If scope was inferred or a cross-check mismatch was found, say so

Then ask whether to commit. Do not commit unless the user confirms.
When committing, use the message format:
`chore: bump release to v<released-version>`
and do **not** include a Co-Authored-By line.
