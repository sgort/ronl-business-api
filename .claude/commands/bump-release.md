# bump-release

Sync all package.json versions to the latest changelog entry and reconcile
the root endpoint's `endpoints` map with the routes actually mounted in
`packages/backend/src/index.ts`.

## Steps

1. **Determine the target version**
   - Read `packages/frontend/src/pages/changelog-data.ts`
   - Find the first entry in the `changelog` array — that is the latest release
   - Extract its `version` field (e.g. `'3.7.0'`)
   - If an explicit version was passed as an argument to this command, use that instead

2. **Bump all package.json files**
   - Read each file before editing (required by the Edit tool)
   - Set `"version"` to the target version in:
     - `package.json` (repo root)
     - `packages/backend/package.json`
     - `packages/frontend/package.json`
   - Run all three edits in parallel

3. **Reconcile the root endpoint map**
   - Read `packages/backend/src/index.ts`
   - Collect every `app.use('/v1/...',` call (the mounted path is the key)
   - Compare against the `endpoints` object in the root `app.get('/')` handler
   - Add any missing routes; remove any stale ones
   - Use camelCase keys that describe the domain, not the path
     (e.g. `curator` for `/v1/pa`, `mediaAggregator` for `/v1/media-aggregator`)
   - Do not list `/v1/health` separately if it is already present — keep it

4. **Report**
   - State the version that was set and list any endpoint keys that were added or removed
   - Ask whether to commit; do not commit unless the user says yes
