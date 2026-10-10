#!/usr/bin/env bash
# Verifies the registry signatures, and the provenance attestations where a
# package has them, of the INSTALLED tree (#249; ICTU recommendation R5,
# "verify where packages come from"). Needs `npm ci` first: unlike the
# lockfile-only audit, `npm audit signatures` reads node_modules.
#
# Run by the required `audit` job in .github/workflows/zizmor.yml on every
# pull request, and locally with `npm run audit:signatures`. The same script
# is in linked-data-explorer, ttl-editor and ronl-business-api; keep the three
# copies identical.
#
# What fails, and what does not:
# - An invalid or missing registry signature fails. npmjs.org signs every
#   package it serves, so either means a package may not be what the registry
#   published.
# - A package without a provenance attestation passes. Most of the tree has
#   none, and npm only verifies the attestations that exist.
# - A registry gap fails, with its own message: the registry metadata
#   advertises an attestation, and the attestation URL returns 404. npm then
#   aborts the whole check, so nothing after that package is verified either.
#   Seen for whatwg-url@17.1.1 (ttl-editor, October 2026); 17.1.0 and 17.1.2
#   are fine. The fix is moving that package to another version, which the
#   lockfile review then shows.
set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

out=$(npm audit signatures 2>&1)
rc=$?
printf '%s\n' "$out"

if [ "$rc" -eq 0 ]; then
  {
    echo '### Registry signatures'
    echo
    echo '```'
    printf '%s\n' "$out"
    echo '```'
  } >> "$summary"
  exit 0
fi

gap=$(printf '%s\n' "$out" | grep -oE '/-/npm/v1/attestations/[^ ]+' | head -n 1 | sed 's#.*/attestations/##')
if [ -n "$gap" ]; then
  msg="npm audit signatures stopped at $gap: the registry advertises a provenance attestation for it but returns 404. That is a registry gap, not a failed signature, but npm verifies nothing after it. Move $gap to a version whose attestation the registry serves, and run the check again."
else
  msg="npm audit signatures failed. An invalid or missing registry signature means a package may not be what the registry published. Do not merge until it is explained."
fi

echo "::error title=Registry signatures::$msg"
{
  echo '### Registry signatures: failed'
  echo
  echo "$msg"
  echo
  echo '```'
  printf '%s\n' "$out"
  echo '```'
} >> "$summary"
exit 1
