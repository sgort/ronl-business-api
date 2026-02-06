# RONL Business API - Troubleshooting Guide

> **Comprehensive troubleshooting reference for common issues**

---

## 🔍 Quick Diagnosis

### Where's the Error?

1. **Browser Console** (F12) → Frontend JavaScript errors
2. **Network Tab** (F12) → API/CORS errors
3. **Terminal** (`npm run dev`) → Backend errors
4. **Docker Logs** → Keycloak/PostgreSQL/Redis errors

---

## Authentication Issues

### ❌ "JWT audience invalid"

**Error:**

```
Token validation failed: jwt audience invalid. expected: ronl-business-api
```

**Cause:** JWT token missing `aud` (audience) claim.

**Solution:**

1. Open Keycloak Admin Console: http://localhost:8080
2. Login: admin/admin
3. Select realm: **ronl**
4. Navigate: **Clients** → **ronl-business-api** → **Client scopes** → **ronl-business-api-dedicated**
5. Click: **Add mapper** → **By configuration** → **Audience**
6. Configure:
   - Name: `audience`
   - Included Client Audience: `ronl-business-api`
   - Add to access token: **ON**
7. **Save**
8. **Logout and login again** in frontend

**Verify Fix:**

```javascript
// In browser console
const token = localStorage.getItem('kc-token');
// Paste at jwt.io and check for: "aud": "ronl-business-api"
```

---

### ❌ Roles Not Displaying

**Symptoms:**

- All users show "citizen" role
- Caseworkers appear as citizens

**Cause:** Missing realm_roles protocol mapper.

**Solution:**

1. Keycloak Admin → **Clients** → **ronl-business-api** → **Client scopes**
2. Click: **ronl-business-api-dedicated**
3. Look for mapper: **realm_roles**
4. If missing:
   - Add mapper → **By configuration** → **User Realm Role**
   - Configure:
     - Name: `realm_roles`
     - Multivalued: **ON**
     - Token Claim Name: `realm_access.roles`
     - Add to access token: **ON**
5. **Save**
6. **Logout and login again**

**Verify Fix:**

```javascript
// In browser console, check token
// Should have: "realm_access": { "roles": ["citizen"] }
```

---

### ❌ Login Redirects to Blank Page

**Cause:** Invalid redirect URIs in Keycloak client.

**Solution:**

1. Keycloak Admin → **Clients** → **ronl-business-api** → **Settings**
2. **Valid Redirect URIs:** Should be `*`
3. **Valid Post Logout Redirect URIs:** Should be `*`
4. **Web Origins:** Should be `+`
5. **Save**

---

### ❌ Token Expired

**Error:**

```
JWT validation failed: jwt expired
```

**Cause:** Normal - tokens expire after 15 minutes.

**Solution:**

- Just **logout and login again**
- OR: Implement token refresh (production feature)

---

## CORS Issues

### ❌ CORS Policy Blocking Keycloak

**Error:**

```
Access to XMLHttpRequest at 'http://localhost:8080/realms/ronl/protocol/openid-connect/token'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Cause:** Keycloak client not configured for browser CORS.

**Solution:**

1. Keycloak Admin → **Clients** → **ronl-business-api** → **Settings**
2. **Web Origins:** Add `+` (allows all valid redirect URIs)
3. **Save**

**Note:** This is a Keycloak limitation - realm import doesn't fully apply CORS settings.

---

### ❌ CORS Policy Blocking Backend API

**Error:**

```
Access to XMLHttpRequest at 'http://localhost:3002/v1/health'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Cause:** Backend CORS not configured for frontend port.

**Solution:**

**Option 1: Environment Variable**

Create `.env.development` in backend:

```bash
CORS_ORIGIN=http://localhost:5173,http://localhost:3000,http://localhost:3002
```

**Option 2: Code Change**

Edit `packages/backend/src/utils/config.ts` line 96:

```typescript
corsOrigin: parseEnvArray(process.env.CORS_ORIGIN, [
  'http://localhost:3000',
  'http://localhost:5173',  // ← Add this
  'http://localhost:3002'
]),
```

Restart backend:

```bash
# Ctrl+C in terminal where npm run dev is running
npm run dev
```

---

## Theme Issues

### ❌ Theme Not Loading

**Symptoms:**

- Header stays blue (default)
- No color change between municipalities
- Console: "No tenant config found"

**Diagnose:**

```javascript
// In browser console
fetch('/tenants.json')
  .then((r) => r.json())
  .then(console.log);
// Should show 4 municipalities
```

**Common Causes:**

#### 1. File Missing

**Check:**

```bash
ls packages/frontend/public/tenants.json
```

**Fix:** Copy `tenants.json` to `packages/frontend/public/`

#### 2. Dev Server Not Reloaded

**Fix:**

```bash
# Restart dev server
Ctrl+C
npm run dev
```

#### 3. Initialization Not Called

**Check `App.tsx`:**

```typescript
// Should have this in Keycloak init:
if (currentUser?.municipality) {
  initializeTenantTheme(currentUser.municipality);
}
```

---

### ❌ Button Invisible (White on White)

**Symptoms:**

- "Berekenen" button area is there but invisible
- Button still works when clicked

**Cause:** Button using Tailwind class instead of CSS variable.

**Fix:**

Find button in `App.tsx`:

```tsx
// ❌ WRONG
className="w-full bg-dutch-blue text-white py-3..."

// ✅ CORRECT
style={{backgroundColor: 'var(--color-primary)'}}
className="w-full py-3 px-6 rounded-lg text-white hover:opacity-90..."
```

**Apply to all themed elements:**

- Header: `style={{backgroundColor: 'var(--color-primary)'}}`
- Badges: `style={{backgroundColor: 'var(--color-primary-dark)'}}`
- Buttons: `style={{backgroundColor: 'var(--color-primary)'}}`

---

### ❌ Header Still Blue

**Cause:** Header using Tailwind class `bg-dutch-blue`.

**Fix:**

Find header in `App.tsx`:

```tsx
// ❌ WRONG
<header className="bg-dutch-blue text-white shadow-lg">

// ✅ CORRECT
<header style={{backgroundColor: 'var(--color-primary)'}} className="text-white shadow-lg">
```

---

## Docker Issues

### ❌ "Cannot connect to Docker daemon"

**Error:**

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solution:**

```bash
# Start Docker Desktop (Windows/Mac)
# OR start Docker service (Linux)
sudo systemctl start docker

# Verify
docker ps
```

---

### ❌ Keycloak Not Starting

**Symptoms:**

```
Connection refused: http://localhost:8080
```

**Diagnose:**

```bash
# Check if container is running
docker compose ps

# Check logs
docker compose logs keycloak

# Look for errors like:
# - Database connection failed
# - Port already in use
```

**Solutions:**

**1. Wait Longer**

```bash
# Keycloak takes 30-60 seconds to start
docker compose logs -f keycloak
# Wait for: "Keycloak 23.0.0 started"
```

**2. Restart Keycloak**

```bash
docker compose restart keycloak
```

**3. Full Reset**

```bash
docker compose down -v
docker compose up -d
```

---

### ❌ PostgreSQL Not Starting

**Check logs:**

```bash
docker compose logs postgres
```

**Common causes:**

- Port 5432 already in use
- Data corruption
- Insufficient disk space

**Solution:**

```bash
# Stop and remove volumes
docker compose down -v

# Start fresh
docker compose up -d
```

---

### ❌ Port Already in Use

**Error:**

```
Bind for 0.0.0.0:8080 failed: port is already allocated
```

**Find what's using the port:**

**Linux/Mac:**

```bash
sudo lsof -i :8080
```

**Windows:**

```powershell
netstat -ano | findstr :8080
```

**Solutions:**

1. **Kill the process** using the port
2. **Change port** in `docker-compose.yml`:
   ```yaml
   ports:
     - '8081:8080' # Change external port
   ```

---

## Frontend Build Issues

### ❌ TypeScript Errors

**Error:**

```
Type 'TenantConfig' is not assignable to type 'TenantConfig'
```

**Cause:** Duplicate type definitions (shared package vs frontend).

**Solution:**

1. Remove imports from `@ronl/shared` if duplicated locally
2. Use types from one location consistently
3. Rebuild shared package:
   ```bash
   npm run build --workspace=@ronl/shared
   ```

---

### ❌ Module Not Found

**Error:**

```
Cannot find module './services/tenant'
```

**Solution:**

```bash
# 1. Check file exists
ls packages/frontend/src/services/tenant.ts

# 2. Check import path
# In App.tsx, should be:
import { initializeTenantTheme } from './services/tenant';

# 3. Restart dev server
Ctrl+C
npm run dev
```

---

## Backend API Issues

### ❌ API Returns 500 Internal Server Error

**Check backend logs:**

```bash
# In terminal where npm run dev is running
# Look for error stack traces
```

**Common causes:**

- Operaton service unreachable
- Invalid request body
- Missing environment variables

---

### ❌ Health Check Fails

**Test:**

```bash
curl http://localhost:3002/v1/health
```

**Expected:**

```json
{
  "success": true,
  "data": {
    "name": "RONL Business API",
    "status": "healthy",
    "dependencies": {
      "keycloak": { "status": "up" },
      "operaton": { "status": "up" }
    }
  }
}
```

**If dependencies are "down":**

- Keycloak: Check if running on port 8080
- Operaton: Check https://operaton.open-regels.nl

---

## Browser Cache Issues

### ❌ Old Code/Styles Loading

**Symptoms:**

- Changes not visible after save
- Old theme colors persist
- Console shows old component code

**Solution:**

**1. Hard Reload:**

```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

**2. Clear Cache:**

```
F12 → Application tab → Clear storage → Clear site data
```

**3. Incognito Mode:**

```
Ctrl+Shift+N (Chrome)
```

**4. Nuclear Option:**

```
F12 → Right-click refresh button → Empty Cache and Hard Reload
```

---

## Testing Issues

### ❌ Can't Login with Test Users

**Verify users exist:**

1. Keycloak Admin → **Users**
2. Search for: `test-citizen-utrecht`
3. Should find 8 users total

**If missing:**

```bash
# Reimport realm
docker compose down
docker volume rm ronl-business-api_keycloak-data
docker compose up -d
```

---

### ❌ Zorgtoeslag Calculation Fails

**Check:**

1. **Network tab:** Request to `/v1/decision/berekenrechtenhoogtezorg/evaluate`
2. **Response status:** Should be 200
3. **Backend logs:** Look for errors

**Common causes:**

- Invalid token (audience missing)
- Operaton service unreachable
- Invalid input variables

---

## Windows-Specific Issues

### ❌ Regular Chrome Not Working, Incognito Works

**Cause:** Browser cache holding old CORS errors.

**Solution:**

1. **Close all Chrome windows**
2. **Reopen Chrome**
3. **Try again**

**If still not working:**

- Use Incognito mode for development
- This is a browser cache issue, not a code issue

---

### ❌ Line Ending Issues (Git)

**Symptoms:**

```bash
warning: LF will be replaced by CRLF
```

**Solution:**

```bash
git config --global core.autocrlf false
```

---

## Emergency Reset

**When everything is broken:**

```bash
# 1. Stop everything
Ctrl+C  # Stop npm run dev

# 2. Clean Docker
docker compose down -v
docker system prune -f

# 3. Clean Node modules
rm -rf node_modules
rm -rf packages/*/node_modules

# 4. Fresh start
npm install
npm run build --workspace=@ronl/shared
npm run docker:up
# Wait 60 seconds
npm run dev
```

---

## Getting Help

### Information to Provide

When asking for help, include:

1. **Error message** (full text)
2. **Browser console** screenshot/logs
3. **Backend logs** (from terminal)
4. **Steps to reproduce**
5. **Operating system** (Windows/Linux/Mac)
6. **What you've already tried**

### Useful Commands for Diagnostics

```bash
# Check versions
node --version
npm --version
docker --version

# Check running services
docker compose ps
docker compose logs keycloak --tail=50

# Check ports in use
# Linux/Mac:
sudo lsof -i :5173
sudo lsof -i :3002
sudo lsof -i :8080

# Windows:
netstat -ano | findstr :5173
netstat -ano | findstr :3002
netstat -ano | findstr :8080

# Check API health
curl http://localhost:3002/v1/health | jq

# Check Keycloak health
curl http://localhost:8080/health/ready
```

---

**Keep this guide handy - it covers 95% of common issues!** 🚀
