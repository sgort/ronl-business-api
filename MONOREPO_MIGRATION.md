# RONL Business API - Monorepo Migration Guide

Complete guide to restructure your project into a monorepo.

---

## 📦 New Structure

```
ronl-business-api/                   # Workspace root
├── packages/
│   ├── frontend/                    # Municipality Portal (React)
│   ├── backend/                     # Business API (Node.js/Express)
│   └── shared/                      # Shared TypeScript types
├── config/                          # Shared configuration
│   ├── keycloak/
│   └── postgres/
├── docs/                            # Documentation
├── docker-compose.yml               # Local dev stack
├── package.json                     # Workspace configuration
└── README.md
```

---

## 🚀 Step-by-Step Migration

### Step 1: Create New Monorepo Structure

```bash
# In ~/Development/
cd ~/Development

# Download and extract the monorepo template
tar -xzf ronl-business-api-monorepo.tar.gz

# You now have:
# ronl-business-api/
#   ├── packages/
#   │   ├── backend/          (empty, ready for code)
#   │   ├── frontend/         (populated)
#   │   └── shared/           (populated with types)
#   ├── config/               (empty, ready for config)
#   ├── package.json          (workspace root)
#   └── docs/
```

### Step 2: Move Backend Code

```bash
# From your existing ronl-business-api project
cd ~/Development/ronl-business-api-OLD  # Your current backend

# Copy source code to new monorepo
cp -r src/* ~/Development/ronl-business-api/packages/backend/src/
cp -r config/* ~/Development/ronl-business-api/config/
cp docker-compose.yml ~/Development/ronl-business-api/
cp .env.* ~/Development/ronl-business-api/packages/backend/
cp .gitignore ~/Development/ronl-business-api/
```

### Step 3: Update Backend Imports

In `packages/backend/src/`, update imports that use shared types:

**Before:**
```typescript
import { AssuranceLevel, AuthenticatedUser } from '@types/auth.types';
import { OperatonVariable } from '@services/operaton.service';
```

**After:**
```typescript
import { AssuranceLevel, AuthenticatedUser, OperatonVariable } from '@ronl/shared';
```

**Files to update:**
- `src/auth/jwt.middleware.ts` - Import auth types from `@ronl/shared`
- `src/services/operaton.service.ts` - Import Operaton types from `@ronl/shared`
- `src/routes/*.ts` - Import API response types from `@ronl/shared`

### Step 4: Install Dependencies

```bash
cd ~/Development/ronl-business-api

# Install all packages (root + all workspaces)
npm install

# This installs:
# - Root workspace dependencies
# - packages/backend dependencies
# - packages/frontend dependencies
# - packages/shared dependencies
# - Links @ronl/shared to backend and frontend
```

### Step 5: Build Shared Package

```bash
# Build shared types first
npm run build --workspace=@ronl/shared

# Or from root:
cd packages/shared && npm run build
```

### Step 6: Start Development

```bash
# From root directory
cd ~/Development/ronl-business-api

# Start Docker services (Keycloak, PostgreSQL)
npm run docker:up

# Start both backend and frontend
npm run dev

# Or start individually:
npm run dev:backend   # Backend on port 3002
npm run dev:frontend  # Frontend on port 5173
```

---

## 📝 Key Import Changes

### Backend Files to Update

#### 1. `packages/backend/src/types/auth.types.ts`

**NEW FILE** - Extends shared types:

```typescript
import { AuthenticatedUser, AssuranceLevel, MandateInfo } from '@ronl/shared';

export { AssuranceLevel, MandateInfo, AuthenticatedUser };

// Backend-specific types
export interface JWTPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  municipality: string;
  loa: AssuranceLevel;
  roles: string[];
  mandate?: MandateInfo;
  name?: string;
}

export interface AuthContext extends AuthenticatedUser {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    user?: AuthenticatedUser;
  }
}
```

#### 2. `packages/backend/src/auth/jwt.middleware.ts`

```typescript
// OLD:
// import { JWTPayload, AuthenticatedUser, AssuranceLevel } from '@types/auth.types';

// NEW:
import { JWTPayload, AuthenticatedUser, AssuranceLevel } from '../types/auth.types';
// Or keep path aliases if configured
```

#### 3. `packages/backend/src/services/operaton.service.ts`

```typescript
// OLD:
// export interface OperatonVariable { ... }

// NEW:
import {
  OperatonVariable,
  ProcessStartRequest,
  ProcessInstance,
  Task,
} from '@ronl/shared';

// Remove local definitions, use imported types
```

#### 4. `packages/backend/src/routes/*.ts`

```typescript
// OLD:
// interface ApiResponse { ... }

// NEW:
import { ApiResponse, OperatonVariable } from '@ronl/shared';
```

---

## 🎯 Frontend Already Configured

The frontend package (`packages/frontend/`) is already set up to use shared types:

```typescript
// packages/frontend/src/services/api.ts
import {
  OperatonVariable,
  DecisionRequest,
  ApiResponse,
  HealthResponse,
} from '@ronl/shared';
```

---

## 🔧 Configuration Updates

### Update TypeScript Paths (Optional)

If you want to keep `@` path aliases in backend:

**`packages/backend/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@ronl/shared": ["../shared/src"]
    }
  }
}
```

### Update CORS Origins

**`packages/backend/.env.development`:**
```bash
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

Frontend runs on port 5173 now.

---

## 🧪 Testing the Setup

### 1. Check Workspace Linking

```bash
cd ~/Development/ronl-business-api

# List workspaces
npm ls --workspaces

# Should show:
# @ronl/backend
# @ronl/frontend
# @ronl/shared
```

### 2. Test Backend

```bash
# Start backend only
npm run dev:backend

# Should start on port 3002
# Check: http://localhost:3002/v1/health
```

### 3. Test Frontend

```bash
# Start frontend only
npm run dev:frontend

# Should start on port 5173
# Opens: http://localhost:5173
```

### 4. Test Full Stack

```bash
# Start everything
npm run dev

# Backend: http://localhost:3002
# Frontend: http://localhost:5173
# Keycloak: http://localhost:8080
```

---

## 📂 File Checklist

After migration, verify these files exist:

### Root
- [ ] `package.json` (workspace config)
- [ ] `docker-compose.yml`
- [ ] `.gitignore`
- [ ] `README.md`

### Backend (`packages/backend/`)
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `src/index.ts`
- [ ] `src/types/auth.types.ts` (NEW - extends shared)
- [ ] `src/routes/*.ts`
- [ ] `src/services/*.ts`
- [ ] `src/middleware/*.ts`
- [ ] `.env.development`

### Frontend (`packages/frontend/`)
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `src/App.tsx`
- [ ] `src/services/api.ts`
- [ ] `src/services/keycloak.ts`

### Shared (`packages/shared/`)
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `src/index.ts`
- [ ] `src/types/api.types.ts`
- [ ] `src/types/auth.types.ts`
- [ ] `src/types/operaton.types.ts`

### Config (`config/`)
- [ ] `keycloak/ronl-realm.json`
- [ ] `postgres/init-databases.sql`

---

## 🚨 Common Issues

### Issue: "Cannot find module '@ronl/shared'"

**Solution:**
```bash
# Build shared package first
cd packages/shared
npm run build

# Then link from root
cd ../..
npm install
```

### Issue: Import errors in backend

**Solution:** Update imports to use `@ronl/shared` for shared types

### Issue: Port conflicts

**Solution:**
- Backend: Change `PORT` in `.env.development`
- Frontend: Change in `vite.config.ts`

### Issue: Keycloak connection failed

**Solution:**
```bash
# Ensure Docker is running
npm run docker:up

# Wait 60 seconds for Keycloak
docker-compose logs -f keycloak
```

---

## 🎨 Benefits of Monorepo

✅ **Type Safety** - Frontend knows exact backend types  
✅ **Single Source** - One repo, one clone  
✅ **Coordinated Deploys** - Deploy together or separately  
✅ **Shared Code** - Reuse types, utilities, constants  
✅ **Consistent Tooling** - One ESLint, one Prettier config  
✅ **Easier Onboarding** - New developers clone once  

---

## 📊 Workspace Commands

```bash
# Run command in specific package
npm run dev --workspace=@ronl/backend
npm run build --workspace=@ronl/frontend

# Run command in all packages
npm run build --workspaces
npm run lint --workspaces

# Add dependency to specific package
npm install axios --workspace=@ronl/backend
npm install react-router-dom --workspace=@ronl/frontend

# From root
npm run dev              # Start both
npm run build            # Build all
npm run lint             # Lint all
npm run test             # Test all
npm run docker:up        # Start services
```

---

## 🔄 Git Workflow

```bash
# After migration, create new branch
git checkout -b feat/monorepo-structure

# Add everything
git add .

# Commit
git commit -m "refactor: restructure into monorepo

- Move backend to packages/backend
- Add frontend in packages/frontend
- Extract shared types to packages/shared
- Update workspace configuration
- Maintain all functionality"

# Push
git push origin feat/monorepo-structure
```

---

## 📚 Next Steps

1. ✅ Complete migration following this guide
2. ✅ Test all endpoints
3. ✅ Verify authentication flow
4. ✅ Test DMN evaluation
5. ✅ Update documentation
6. ✅ Update CI/CD pipelines
7. ✅ Deploy to acceptance environment

---

**🎉 Your monorepo is ready for active development!**
