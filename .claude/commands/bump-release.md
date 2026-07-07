# bump-release

Cut a release: flip the current Upcoming changelog entry to Released, sync
all package.json files, and reconcile the root endpoint map.

## Steps

### 1. Determine the released version

- Read `packages/frontend/src/pages/changelog-data.ts`
- The first entry in `changelog.versions` is the one being released — extract
  its `version` string (e.g. `'3.7.3'`)
- If an explicit version was passed as an argument to this command, use that
  instead and find it in the array

### 2. Flip the released entry to Released

Find the block that begins with `version: '<released-version>'` and replace:

```ts
status: 'Upcoming',
statusColor: '#6b7280',
borderColor: '#e5e7eb',
```

with:

```ts
status: 'Released',
statusColor: '#2d7a33',
borderColor: '#c3e6cd',
```

### 3. Bump all package.json files

Read each file before editing (required by the Edit tool). Set `"version"` to
the released version in:

- `package.json` (repo root)
- `packages/backend/package.json`
- `packages/frontend/package.json`

Run all three edits in parallel.

### 4. Reconcile the root endpoint map

- Read `packages/backend/src/index.ts`
- Collect every `app.use('/v1/...',` call (the mounted path is the key)
- Compare against the `endpoints` object in the root `app.get('/')` handler
- Add any missing routes; remove any stale ones
- Use camelCase keys that describe the domain, not the path
  (e.g. `curator` for `/v1/pa`, `mediaAggregator` for `/v1/media-aggregator`)
- Do not list `/v1/health` separately if it is already present — keep it

### 5. Report and ask to commit

State:

- The version that was released
- Any endpoint keys that were added or removed
- The three package.json files that were bumped

Then ask whether to commit. Do not commit unless the user confirms.
When committing, use the message format:
`chore: bump release to v<released-version>`
and do **not** include a Co-Authored-By line.
