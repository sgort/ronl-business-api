#!/bin/bash
set -e

echo "🏗️  Building Clean RONL Business API Monorepo..."

# Create directory structure
mkdir -p packages/frontend/src/{services,components,types,utils}
mkdir -p packages/backend/src/{auth,middleware,routes,services,types,utils}
mkdir -p packages/shared/src/types
mkdir -p config/{keycloak,postgres}
mkdir -p docs

echo "✅ Directory structure created"
