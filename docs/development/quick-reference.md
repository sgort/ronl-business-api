# RONL Business API - Quick Reference

> **Essential commands and test user credentials at a glance**

---

## 🔑 Test User Credentials

**All passwords:** `test123`

### Utrecht (Red Theme - #C41E3A)

```
Username: test-citizen-utrecht
Username: test-caseworker-utrecht
```

### Amsterdam (Bright Red Theme - #EC0000)

```
Username: test-citizen-amsterdam
Username: test-caseworker-amsterdam
```

### Rotterdam (Green Theme - #00811F)

```
Username: test-citizen-rotterdam
Username: test-caseworker-rotterdam
```

### Den Haag (Blue Theme - #007BC7)

```
Username: test-citizen-denhaag
Username: test-caseworker-denhaag
```

---

## 🌐 Service URLs

```
Frontend:   http://localhost:5173
Backend:    http://localhost:3002
Keycloak:   http://localhost:8080
Operaton:   https://operaton.open-regels.nl

Keycloak Admin:
  URL:      http://localhost:8080
  Username: admin
  Password: admin
  Realm:    ronl
```

---

## ⚡ Quick Start Commands

```bash
# 🚀 Start Everything
npm run docker:up     # Start Docker services
npm run dev           # Start frontend & backend

# 🛑 Stop Everything
Ctrl+C                # Stop dev servers
npm run docker:down   # Stop Docker services

# 🔄 Restart Services
docker compose restart keycloak
docker compose restart postgres

# 📋 View Logs
docker compose logs -f keycloak
docker compose logs -f postgres
```

---

## 🔨 Development Commands

```bash
# Frontend
npm run dev:frontend          # Start frontend only
npm run build:frontend        # Build for production
npm run type-check            # TypeScript check

# Backend
npm run dev:backend           # Start backend only
npm run build:backend         # Compile TypeScript
npm run lint                  # ESLint check

# Shared Types
npm run build --workspace=@ronl/shared

# All
npm run build                 # Build everything
npm run lint                  # Lint everything
npm run format                # Format code
```

---

## 🧹 Cleanup Commands

```bash
# 💣 Nuclear Reset (Clean Slate)
npm run docker:down:volumes   # Remove all Docker data
rm -rf node_modules           # Remove dependencies
rm -rf packages/*/node_modules
npm install                   # Reinstall everything
npm run build --workspace=@ronl/shared
npm run docker:up
npm run dev

# 🔄 Soft Reset (Keep Data)
docker compose down
docker compose up -d
npm run dev
```

---

## 🐛 Debugging Commands

```bash
# Check Health
curl http://localhost:3002/v1/health | jq
curl http://localhost:8080/health/ready

# Check Ports
# Linux/Mac:
sudo lsof -i :5173    # Frontend
sudo lsof -i :3002    # Backend
sudo lsof -i :8080    # Keycloak

# Windows:
netstat -ano | findstr :5173
netstat -ano | findstr :3002
netstat -ano | findstr :8080

# View Container Status
docker compose ps
docker compose logs keycloak --tail=50
docker compose logs postgres --tail=50
```

---

## 🔍 Testing Checklist

### Test Authentication

- [ ] Login with test-citizen-utrecht
- [ ] Verify header shows "Utrecht"
- [ ] Verify role badge shows "citizen"
- [ ] Verify LoA badge shows "hoog"
- [ ] Verify header is RED

### Test Zorgtoeslag

- [ ] Fill form with test values
- [ ] Click "Berekenen" button
- [ ] Verify API call succeeds (Network tab)
- [ ] Verify result displays
- [ ] Verify no errors in console

### Test All Municipalities

- [ ] Utrecht → RED theme
- [ ] Amsterdam → BRIGHT RED theme
- [ ] Rotterdam → GREEN theme
- [ ] Den Haag → BLUE theme

### Test Both Roles

- [ ] Citizen access
- [ ] Caseworker access

---

## 🚨 Common Issues - Quick Fixes

### JWT Audience Error

```bash
# Fix in Keycloak Admin:
# Clients → ronl-business-api → Client scopes
# → ronl-business-api-dedicated → Add mapper
# → Audience → Save
# Then logout and login again
```

### Roles Not Showing

```bash
# Fix in Keycloak Admin:
# Clients → ronl-business-api → Client scopes
# → ronl-business-api-dedicated → Add mapper
# → User Realm Role → Save
# Then logout and login again
```

### CORS Error

```bash
# Fix in Keycloak Admin:
# Clients → ronl-business-api → Settings
# Web Origins: Add "+"
# Save
```

### Theme Not Loading

```bash
# Check file exists:
ls packages/frontend/public/tenants.json

# Restart dev server:
Ctrl+C
npm run dev
```

### White Button

```jsx
// Fix in App.tsx - use inline style:
style={{backgroundColor: 'var(--color-primary)'}}
```

---

## 📂 Important File Locations

```
Config Files:
  config/keycloak/ronl-realm.json      # Keycloak configuration
  config/postgres/init-databases.sql   # Database initialization
  docker-compose.yml                   # Docker services

Frontend:
  packages/frontend/src/App.tsx        # Main application
  packages/frontend/src/services/
    ├── keycloak.ts                    # Auth service
    ├── api.ts                         # API client
    └── tenant.ts                      # Theme service
  packages/frontend/public/tenants.json # Municipality configs

Backend:
  packages/backend/src/
    ├── index.ts                       # Express server
    ├── auth/jwt.middleware.ts         # JWT validation
    ├── middleware/tenant.middleware.ts # Multi-tenancy
    ├── routes/decision.routes.ts      # DMN endpoints
    └── services/operaton.service.ts   # Operaton client

Shared:
  packages/shared/src/types/           # Shared TypeScript types
```

---

## 🎨 Theme Colors Reference

```
Utrecht:
  Primary:      #C41E3A (Red)
  Primary Dark: #9B1830
  Secondary:    #2C5F2D (Green)

Amsterdam:
  Primary:      #EC0000 (Bright Red)
  Primary Dark: #C00000
  Secondary:    #003B5C (Dark Blue)

Rotterdam:
  Primary:      #00811F (Green)
  Primary Dark: #006619
  Secondary:    #0C2340 (Navy)

Den Haag:
  Primary:      #007BC7 (Blue)
  Primary Dark: #005A99
  Secondary:    #E17000 (Orange)
```

---

## 📊 API Endpoints Reference

```bash
# Health Check (No Auth)
GET /v1/health

# DMN Decision Evaluation (Auth Required)
POST /v1/decision/:key/evaluate
Body: { variables: { ... } }

# Process Management (Auth Required)
POST /v1/process/:key/start
GET  /v1/process/:id/status
GET  /v1/process/:id/variables
DELETE /v1/process/:id
```

---

## 🔐 Token Inspection

```javascript
// In browser console:

// Get token from localStorage
const token = localStorage.getItem('kc-token');

// Decode at jwt.io or use:
JSON.parse(atob(token.split('.')[1]));

// Should contain:
// - municipality: "utrecht"
// - loa: "hoog"
// - realm_access.roles: ["citizen"]
// - aud: "ronl-business-api"
```

---

## 📝 Git Workflow

```bash
# Daily workflow
git pull                          # Get latest changes
git checkout -b feature/my-feature # New feature branch
# ... make changes ...
git add .                         # Stage changes
git commit -m "feat: add feature" # Commit (triggers hooks)
git push                          # Push (triggers hooks)

# Hooks run automatically:
# Pre-commit: ESLint, Prettier
# Pre-push: Type check, build shared
```

---

## 🎯 Development Flow

```
1. Start Docker     → npm run docker:up
2. Start Dev        → npm run dev
3. Open Browser     → http://localhost:5173
4. Login            → test-citizen-utrecht / test123
5. Test Feature     → Zorgtoeslag calculation
6. Check Logs       → Terminal & Browser Console
7. Make Changes     → Auto-reload (Vite HMR)
8. Test Again       → Verify changes
9. Commit           → git add . && git commit -m "..."
10. Push            → git push
```

---

## 📖 Documentation Links

- **Setup Guide:** COMPLETE_SETUP_GUIDE.md
- **Troubleshooting:** TROUBLESHOOTING_GUIDE.md
- **Project Status:** PROJECT_STATUS.md
- **This Reference:** QUICK_REFERENCE.md

---

**Keep this handy while developing! 🚀**

**Print this out or keep it on a second monitor for quick reference.**
