#!/usr/bin/env bash
#
# promotion-targets.sh — which of the four production deploys does this
# promotion need?
#
# Reads changed file paths on stdin, one per line, and writes one
# `<target>=true|false` line per target. When GITHUB_OUTPUT is set the same
# lines are appended there, so a workflow step can use this directly as its
# `outputs:` source.
#
# WHY THIS IS A FILE RATHER THAN A `run:` BLOCK
#
# Until #177 each production workflow carried its own `paths:` filter on a
# `push` to main, and the four raced (see that issue). They are now called in
# order by promote-to-production.yml, which means the path filters had to move
# out of the triggers and into one place that decides for all four.
#
# That decision is the only thing standing between a promotion and a deploy
# that does not happen, so it is a file: runnable locally against a real commit
# range, and exercised against a table of cases rather than only in anger. A
# `run:` block can be read but not run.
#
# KEEP THIS IN STEP WITH THE WORKFLOWS. Each pattern below mirrors the `paths:`
# filter that the matching acc workflow still carries on its own push trigger.
# The prod workflows no longer have one — this is it.
#
# Usage:
#   git diff --name-only <before> <after> | bash scripts/promotion-targets.sh
#   bash scripts/promotion-targets.sh --all
#
#   --all  Report every target as needed, without reading stdin. Used by the
#          workflow's fail-safe: if the changed files cannot be determined, a
#          promotion must deploy everything rather than nothing. An answer
#          nobody could compute is not "no change".

set -euo pipefail

# Anchored on purpose. `package.json` here means the ROOT manifest; a
# workspace's own package.json matches through its `packages/<name>/` prefix.
#
# Renames: the caller is expected to feed BOTH names of a renamed file, which
# is what GitHub's own path filters do.
TARGETS=(
  'backend:^(packages/backend/|packages/shared/|\.github/workflows/azure-backend-prod\.yml$|package-lock\.json$|package\.json$|\.nvmrc$)'
  'frontend:^(packages/frontend/|packages/shared/|packages/pa-cockpit/|\.github/workflows/azure-frontend-prod\.yml$|\.nvmrc$)'
  'pa_demo:^(packages/pa-demo/|packages/shared/|packages/pa-cockpit/|\.github/workflows/azure-pa-demo-prod\.yml$|\.nvmrc$)'
  'public_site:^(packages/public-site/|\.github/workflows/azure-publicsite-prod\.yml$|\.nvmrc$)'
)

# promote-to-production.yml is deliberately absent from every pattern above.
# Each deploy workflow lists ITSELF in its paths filter so that a change to it
# gets exercised by running it. The promotion workflow needs no such entry: it
# runs on every promotion already, so listing it would only mean that editing a
# comment in it redeployed all four sites.

emit() {
  local name=$1 value=$2
  printf '%s=%s\n' "$name" "$value"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$name" "$value" >>"$GITHUB_OUTPUT"
  fi
}

if [ "${1:-}" = "--all" ]; then
  for entry in "${TARGETS[@]}"; do
    emit "${entry%%:*}" true
  done
  exit 0
fi

if [ $# -gt 0 ]; then
  echo "promotion-targets: unknown argument '$1' (expected --all or nothing)" >&2
  exit 2
fi

files=$(cat)

for entry in "${TARGETS[@]}"; do
  name="${entry%%:*}"
  pattern="${entry#*:}"
  if printf '%s\n' "$files" | grep -qE "$pattern"; then
    emit "$name" true
  else
    emit "$name" false
  fi
done
