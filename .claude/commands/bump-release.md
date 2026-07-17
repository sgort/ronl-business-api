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
- **If the first entry's `status` is already `Released`, there is no pending
  entry** — do not treat 3.8.2-already-released as "the release." Stop and ask
  whether to author a new entry now (version, scope, and what changed) before
  continuing. Do not fabricate changelog content without confirming it.
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

This has caught a real case in practice, not just a hypothetical: an earlier
commit had already landed an unrelated frontend change (a small UI feature)
with no changelog entry or version bump of its own, sitting silently on top
of the branch a later backend-scoped release was cut from. Two resolutions
are valid — pick based on how related the extra change is to the one being
released:

- **Unrelated leftover work** (the common case) → add a **second, separate
  changelog entry** for it with its own accurate scope (backdate its `date`
  to when that commit actually landed, not today), and release both entries
  in the same pass. Keeps each entry's scope honest and each package's
  version tied to what it actually contains.
- **Genuinely part of the same change** → widen the current entry's `scope`
  to `both` and fold a description of the extra change into it instead of
  splitting.

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

**Releasing more than one entry in the same pass** (see the split-entry case in
step 2): process each entry's scope independently against root + its package,
but set root to the **highest** of the versions released, regardless of which
entry you processed first — root always tracks the latest overall release,
not "whichever ran last."

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
and do **not** include a Co-Authored-By line. If more than one entry was
released in the same pass, use the highest version as the headline (matching
root's version) and summarize the other entry/entries in the commit body.
