#!/usr/bin/env bash
#
# check-previews.sh — does every preview environment still belong to an open
# pull request?
#
# Each Static Web Apps deploy workflow can build a preview environment for a
# pull request, and a close job deletes it when the pull request closes. That
# job cannot catch everything: GitHub does not run pull_request workflows while
# a pull request has a merge conflict, closing included, so a pull request that
# closes that way leaves its preview running.
#
# On 12 September 2026 three Renovate security pull requests left EIGHT
# previews behind across three apps. Nothing reported them. They were found by
# listing environments from Azure by hand on 15 September, and again on 20
# September when they were still there — eight public URLs serving old code,
# each holding a slot on a Standard plan (#154).
#
# So this checks from the other end: list the environments Azure actually has,
# compare them with the pull requests GitHub has open, and name every orphan.
#
# Ported from ttl-editor's script of the same name. Two things differ here, and
# both are why it could not be copied byte for byte:
#
#   1. FINDING THE APPS. ttl-editor derives each app from its workflow's file
#      name, azure-static-web-apps-<hostname>.yml. The workflows here are named
#      azure-<name>-acc.yml, so that does not work. The apps are found by their
#      repositoryUrl instead, which names no app, resource group or
#      subscription — and means an app added later is checked without editing
#      this file.
#
#   2. MORE THAN ONE SUBSCRIPTION. The frontend is in one subscription; the PA
#      demo and public site are in another. ttl-editor's script queries only the
#      logged-in subscription, which here would silently check one app of the
#      three that make previews. This reads every subscription `az account list`
#      returns.
#
# WHAT IT DOES NOT DO: delete. Removing an Azure resource is a human's
# decision, as in check-mirror.sh. This prints the exact command and stops.
#
# Exit 0 when every preview belongs to an open pull request. Exit 1 on any
# orphan, and whenever something could not be checked — a missing tool, an
# expired login, a subscription that cannot be read, or no apps found at all.
# Modelled on check-mirror.sh, including its rule that anything unchecked is
# reported rather than passed over in silence.
#
# That rule earned its place while this script was being written. An expired
# Azure refresh token made `az staticwebapp list` fail, and with stderr
# discarded it returned an empty list — indistinguishable from a subscription
# holding no apps. A check that reads "I could not ask" as "there is nothing
# there" reports success on a stack it never examined.
#
# Usage:
#   bash scripts/check-previews.sh
#   npm run check-previews
#
#   REPO_URL=https://github.com/sgort/other bash scripts/check-previews.sh
#       Check another repository's apps. Only for exercising this script.
#
#   OPEN_PRS="148 149" bash scripts/check-previews.sh
#       Treat only these pull requests as open instead of asking GitHub. For
#       exercising the orphan path without closing a real pull request.

set -euo pipefail

# Overridable so the orphan path can be exercised against another repository's
# apps: this repository has no previews left to make orphans of, and creating one
# to test with would be worse than borrowing a real one.
REPO_URL="${REPO_URL:-https://github.com/sgort/ronl-business-api}"

for tool in az gh; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "check-previews: '$tool' is not installed. Nothing was compared." >&2
    exit 1
  fi
done

# Deliberately NOT `az account show`: it reads cached local state and succeeds
# against a refresh token that expired days ago. Only a real ARM call proves the
# session works, and the subscription list is the first one this needs anyway.
if ! subscriptions=$(az account list --query "[].id" -o tsv 2>/dev/null) || [ -z "$subscriptions" ]; then
  echo "check-previews: cannot list Azure subscriptions. Nothing was compared." >&2
  echo "  Most often an expired session — note that 'az account show' may still look fine:" >&2
  echo "    az logout && az login" >&2
  exit 1
fi

if [ -n "${OPEN_PRS+x}" ]; then
  open_prs=" ${OPEN_PRS} "
  echo "check-previews: OPEN_PRS is set — treating only these as open:${open_prs}"
else
  if ! prs=$(gh pr list --state open --limit 500 --json number --jq '.[].number' 2>/dev/null); then
    echo "check-previews: cannot list open pull requests (check gh auth status). Nothing was compared." >&2
    exit 1
  fi
  open_prs=" $(printf '%s' "$prs" | tr '\n' ' ') "
fi

echo "check-previews: preview environments against open pull requests"
echo

orphans=0
unchecked=0
apps_found=0

while IFS= read -r sub; do
  [ -n "$sub" ] || continue
  sub_name=$(az account show --subscription "$sub" --query name -o tsv 2>/dev/null || echo "$sub")

  # Failure and emptiness must be told apart, which is the whole reason stderr
  # is captured rather than discarded.
  if ! apps=$(az staticwebapp list --subscription "$sub" \
    --query "[?repositoryUrl=='${REPO_URL}'].[name, resourceGroup]" -o tsv 2>/dev/null); then
    printf '  %s: cannot list Static Web Apps — NOT CHECKED\n' "$sub_name"
    unchecked=$((unchecked + 1))
    continue
  fi

  if [ -z "$apps" ]; then
    continue
  fi

  while IFS=$'\t' read -r name rg; do
    [ -n "$name" ] || continue
    apps_found=$((apps_found + 1))

    if ! envs=$(az staticwebapp environment list -n "$name" -g "$rg" --subscription "$sub" \
      --query "[?name!='default'].[name, sourceBranch]" -o tsv 2>/dev/null); then
      printf '  %s (%s, %s): cannot list environments — NOT CHECKED\n' "$name" "$rg" "$sub_name"
      unchecked=$((unchecked + 1))
      continue
    fi

    printf '  %s — %s (%s)\n' "$sub_name" "$name" "$rg"
    if [ -z "$envs" ]; then
      printf '    no preview environments\n'
      continue
    fi

    while IFS=$'\t' read -r env branch; do
      [ -n "$env" ] || continue
      if ! [[ "$env" =~ ^[0-9]+$ ]]; then
        # Named after a branch rather than a pull request number. Nothing here
        # creates one, so it is reported and left alone.
        printf '    %-6s branch environment (%s) — not a pull request, left alone\n' "$env" "$branch"
      elif [[ "$open_prs" == *" $env "* ]]; then
        printf '    #%-5s open     %s\n' "$env" "$branch"
      else
        printf '    #%-5s ORPHAN   %s — pull request #%s is not open\n' "$env" "$branch" "$env"
        # --subscription is not optional here: the apps span two of them, and
        # the command is meant to be pasted as printed.
        printf '           az staticwebapp environment delete -n %s -g %s --subscription %s --environment-name %s --yes\n' \
          "$name" "$rg" "$sub" "$env"
        orphans=$((orphans + 1))
      fi
    done <<<"$envs"
  done <<<"$apps"
done <<<"$subscriptions"

echo
if [ "$apps_found" -eq 0 ] && [ "$unchecked" -eq 0 ]; then
  # Every subscription answered and none held an app for this repository. That
  # is not "no orphans" — it means the repositoryUrl this searches for matches
  # nothing, so the check examined nothing and must not report success.
  echo "check-previews: no Static Web App in any subscription has repositoryUrl" >&2
  echo "  ${REPO_URL}. Nothing was compared — check the value on the apps, or" >&2
  echo "  update REPO_URL in this script." >&2
  exit 1
fi

if [ "$unchecked" -gt 0 ]; then
  echo "check-previews: $unchecked item(s) could not be checked — see above." >&2
fi

if [ "$orphans" -gt 0 ]; then
  echo "$orphans orphaned preview environment(s): each still serves a public URL and"
  echo "holds a slot. Run the command(s) above, then run this check again."
  exit 1
fi

if [ "$unchecked" -gt 0 ]; then
  exit 1
fi

echo "OK — every preview environment belongs to an open pull request ($apps_found app(s) checked)."
