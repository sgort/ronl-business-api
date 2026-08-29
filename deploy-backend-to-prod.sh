#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && pwd)"

BACKEND_DIR="$PROJECT_ROOT/packages/backend"
SHARED_DIR="$PROJECT_ROOT/packages/shared"
DEPLOY_DIR="$BACKEND_DIR/deploy"
ZIP_FILE="$BACKEND_DIR/deployment-prod.zip"

APP_NAME="ronl-business-api-prod"
RESOURCE_GROUP="rg-ronl-prod"

# ── Archiver ──────────────────────────────────────────────────────────────────
# Info-ZIP's `zip` isn't installable on a managed Windows laptop, but Windows
# bundles bsdtar (libarchive) at System32\tar.exe, which writes zip natively.
# Git Bash also puts a `tar` on PATH — that one is GNU tar, which cannot write
# zip at all, so a candidate is only accepted once it identifies itself as
# bsdtar. Resolved up front so a missing archiver fails before the builds, not
# after them.
ARCHIVER=""
BSDTAR=""

resolve_archiver() {
  if command -v zip >/dev/null 2>&1; then
    ARCHIVER="zip"
    return
  fi

  local candidates=() candidate
  if command -v cygpath >/dev/null 2>&1 && [[ -n "${SYSTEMROOT:-}" ]]; then
    candidates+=("$(cygpath -u "$SYSTEMROOT")/System32/tar.exe")
  fi
  candidates+=("/c/Windows/System32/tar.exe")
  if command -v tar >/dev/null 2>&1; then
    candidates+=("$(command -v tar)") # macOS ships bsdtar as plain `tar`
  fi

  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]] && "$candidate" --version 2>/dev/null | grep -qi bsdtar; then
      ARCHIVER="bsdtar"
      BSDTAR="$candidate"
      return
    fi
  done

  ARCHIVER="none"
}

# Archives the CURRENT directory into $1 (an absolute path).
make_zip() {
  local out="$1"

  case "$ARCHIVER" in
    zip)
      zip -r "$out" .
      ;;
    bsdtar)
      # Archiving '.' would write every entry with a './' prefix, and this
      # Windows build has bsdtar's -s substitution compiled out, so name the
      # top-level entries instead — that yields the same listing `zip -r .`
      # does. The globs cover dotfiles too, which .deployment depends on.
      local entries=() f
      for f in * .[!.]* ..?*; do
        if [[ -e "$f" ]]; then entries+=("$f"); fi
      done
      if [[ ${#entries[@]} -eq 0 ]]; then
        echo "❌ Nothing to archive in $PWD — aborting"
        exit 1
      fi
      # bsdtar is a native Windows binary and cannot read an MSYS-style path.
      local win_out="$out"
      if command -v cygpath >/dev/null 2>&1; then win_out="$(cygpath -w "$out")"; fi
      # -v so the run scrolls file-by-file the way `zip -r` does. Without it
      # bsdtar is completely silent, and a 126MB / ~17k-file deploy directory
      # looks indistinguishable from a hang for a minute or more.
      "$BSDTAR" --format zip -cvf "$win_out" "${entries[@]}"
      ;;
    *)
      echo "❌ No archiver available — install Info-ZIP ('zip'), or run from a"
      echo "   shell where Windows' System32\\tar.exe (bsdtar) is reachable."
      exit 1
      ;;
  esac
}

# ── Safety: PROD deploy must come from a clean main ──────────────────────────
CURRENT_BRANCH="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ PROD deploy must run from 'main' (currently on '$CURRENT_BRANCH') — aborting"
  exit 1
fi
if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
  echo "❌ Working tree is dirty — commit or stash before a PROD deploy"
  exit 1
fi
echo "✅ On 'main', clean working tree"

resolve_archiver
if [[ "$ARCHIVER" == "none" ]]; then
  echo "❌ No archiver available — install Info-ZIP ('zip'), or run from a shell"
  echo "   where Windows' System32\tar.exe (bsdtar) is reachable."
  exit 1
fi
echo "✅ Archiver: ${ARCHIVER}${BSDTAR:+ ($BSDTAR)}"

# ── Preflight: a *working* Azure session ────────────────────────────────
# `az account show` is NOT sufficient, however natural a check it looks. It
# reads cached local state and succeeds happily against a refresh token that
# expired days ago: on 2026-08-29 it reported a valid login whose token had in
# fact expired on the 25th, and the deploy still died with AADSTS70043 after
# both builds, the production install and the zip had run.
#
# Only a real ARM call proves the session works, so this asks for the target
# app itself -- one request that covers three separate failures: an expired
# session, the wrong subscription selected, and the app not existing in the
# resource group this script names.
#
# Resolved up front for the same reason the archiver is: a one-command fix
# should not cost several minutes of builds to discover.
if ! az webapp show -n "$APP_NAME" -g "$RESOURCE_GROUP" -o none 2>/dev/null; then
  echo "❌ Cannot reach $APP_NAME in $RESOURCE_GROUP."
  echo "   Most often an expired session -- note that 'az account show' will"
  echo "   still look perfectly fine. Re-authenticate:"
  echo "     az logout && az login"
  echo "   If the session is current, check the right subscription is selected:"
  echo "     az account list -o table && az account set --subscription <name>"
  exit 1
fi
echo "✅ Azure: $(az account show --query "join(' -- ', [user.name, name])" -o tsv 2>/dev/null)"

echo "▶ Building shared package..."
cd "$SHARED_DIR"
npm run build

echo "▶ Building backend..."
cd "$BACKEND_DIR"
npm run build

test -f dist/index.js || { echo "❌ dist/index.js not found — aborting"; exit 1; }
echo "✅ dist/index.js found"

echo "▶ Preparing deployment package..."
rm -rf "$DEPLOY_DIR" "$ZIP_FILE"
mkdir -p "$DEPLOY_DIR"

cp -r dist "$DEPLOY_DIR/"
cp package.json "$DEPLOY_DIR/"

cd "$DEPLOY_DIR"
# Remove the unresolvable workspace dep before install so npm doesn't try to
# fetch it from the registry (it's not published there).
npm pkg delete dependencies.@ronl/shared
npm install --production --omit=dev

# Copy the shared package in AFTER npm install — doing this before install
# means npm sees it as extraneous (undeclared in package.json) and prunes it,
# which crashes the app at runtime with "Cannot find module '@ronl/shared'".
mkdir -p "$DEPLOY_DIR/node_modules/@ronl/shared"
cp -r "$SHARED_DIR/dist" "$DEPLOY_DIR/node_modules/@ronl/shared/"
cp "$SHARED_DIR/package.json" "$DEPLOY_DIR/node_modules/@ronl/shared/"

{
  echo "[config]"
  echo "SCM_DO_BUILD_DURING_DEPLOYMENT = false"
} > .deployment

echo "▶ Creating zip..."
cd "$DEPLOY_DIR"
make_zip "$ZIP_FILE"
echo "✅ $(du -sh "$ZIP_FILE" | cut -f1) — deployment-prod.zip"

echo "▶ Deploying to Azure..."
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$ZIP_FILE" \
  --type zip

echo "▶ Cleaning up..."
rm -rf "$DEPLOY_DIR" "$ZIP_FILE"

echo "✅ Done — $APP_NAME deployed successfully"