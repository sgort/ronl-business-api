#!/usr/bin/env bash
# set-secret.sh — set a GitHub Actions secret from stdin, without the whitespace
#
# ── Why this exists ───────────────────────────────────────────────────────────
#
# Piping a credential straight from the Azure CLI into `gh secret set` stores a
# TRAILING NEWLINE in the secret:
#
#   az staticwebapp secrets list … --query properties.apiKey -o tsv | gh secret set NAME
#
# 120 bytes where the key is 119. Both halves are the documented way to do their
# job; the composition is what goes wrong. The failure it produces names nothing
# (#97) -- the public site's first production deploy passed install, lint,
# type-check, unit tests, prerender and the bundle gate, then:
#
#   DeploymentId: 61da559c-1017-42cc-8ad9-24951f2932ce
#   An unknown exception has occurred
#
# No mention of authentication, of the token, or of the target app, and the
# DeploymentId printing first makes it look as though the upload began and Azure
# failed. Re-setting the same secret with the newline stripped fixed it with no
# other change. The value cannot be read back afterwards, so nothing about the
# stored secret can confirm or deny the theory -- which is why this script
# reports the byte count it stored.
#
# ── Usage ─────────────────────────────────────────────────────────────────────
#
#   az staticwebapp secrets list … -o tsv | bash scripts/set-secret.sh MY_SECRET
#   bash scripts/set-secret.sh MY_SECRET --repo sgort/other-repo < key.txt
#   bash scripts/set-secret.sh MY_SECRET --dry-run          # reports, sets nothing
#
# The value is read from stdin and never echoed, never passed as an argument,
# and never written to a file. Only its length is printed.

set -euo pipefail

NAME="${1:-}"
shift || true

DRY_RUN=false
GH_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      GH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "Usage: <command producing the value> | bash scripts/set-secret.sh <SECRET_NAME> [--dry-run] [gh args…]" >&2
  exit 1
fi

if [[ -t 0 ]]; then
  echo "❌ No value on stdin. Pipe the value in, or redirect a file:" >&2
  echo "     az … -o tsv | bash scripts/set-secret.sh $NAME" >&2
  exit 1
fi

# Read everything, faithfully. A plain raw="$(cat)" would strip trailing
# newlines itself -- storing the right value, but reporting "read 6, storing 6"
# for the exact case this script exists to catch, so the byte count could never
# show the newline it removed. Appending a sentinel and dropping it preserves
# what actually arrived, and the counts below then name the trap.
raw="$(cat; printf x)"
raw="${raw%x}"
value="${raw#"${raw%%[![:space:]]*}"}"
value="${value%"${value##*[![:space:]]}"}"

raw_bytes=$(printf '%s' "$raw" | wc -c | tr -d ' ')
value_bytes=$(printf '%s' "$value" | wc -c | tr -d ' ')

if [[ -z "$value" ]]; then
  echo "❌ The value is empty after stripping whitespace ($raw_bytes byte(s) in)." >&2
  echo "   Nothing was set. Check the command that produced it." >&2
  exit 1
fi

echo "Secret:  $NAME"
echo "Read:    $raw_bytes byte(s) from stdin"
echo "Storing: $value_bytes byte(s)"
if [[ "$raw_bytes" -ne "$value_bytes" ]]; then
  echo "         ↳ stripped $((raw_bytes - value_bytes)) byte(s) of whitespace — the trap in #97"
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "✅ Dry run — nothing was set."
  exit 0
fi

# Piped rather than passed as --body, so the value never appears in the process
# list or the shell history.
printf '%s' "$value" | gh secret set "$NAME" ${GH_ARGS[@]+"${GH_ARGS[@]}"}
echo "✅ $NAME set to $value_bytes byte(s)."
