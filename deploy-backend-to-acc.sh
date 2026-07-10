#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && pwd)"

BACKEND_DIR="$PROJECT_ROOT/packages/backend"
SHARED_DIR="$PROJECT_ROOT/packages/shared"
DEPLOY_DIR="$BACKEND_DIR/deploy"
ZIP_FILE="$BACKEND_DIR/deployment-acc.zip"

APP_NAME="ronl-business-api-acc"
RESOURCE_GROUP="rg-ronl-acc"

# ── Safety: ACC deploy must come from a clean acc ─────────────────────────────
CURRENT_BRANCH="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "acc" ]]; then
  echo "❌ ACC deploy must run from 'acc' (currently on '$CURRENT_BRANCH') — aborting"
  exit 1
fi
if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
  echo "❌ Working tree is dirty — commit or stash before an ACC deploy"
  exit 1
fi
echo "✅ On 'acc', clean working tree"

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
zip -r "$ZIP_FILE" .
echo "✅ $(du -sh "$ZIP_FILE" | cut -f1) — deployment-acc.zip"

echo "▶ Deploying to Azure..."
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$ZIP_FILE" \
  --type zip

echo "▶ Cleaning up..."
rm -rf "$DEPLOY_DIR" "$ZIP_FILE"

echo "✅ Done — $APP_NAME deployed successfully"
