# RONL Business API - Complete Setup Guide

> **Complete reference for setting up the RONL Business API with Keycloak, multi-tenant theming, and all services**

**Last Updated:** 2026-02-01  
**Version:** 1.0.0

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Keycloak Configuration (Manual Steps Required)](#keycloak-configuration)
4. [Multi-Tenant Theming](#multi-tenant-theming)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Cross-Platform Notes](#cross-platform-notes)

---

## Prerequisites

### Required Software

- **Node.js** 20.0.0 or higher
- **npm** 10.0.0 or higher
- **Docker** & **Docker Compose**
- **Git**

### Verify Installations

```bash
node --version    # Should be v20.x.x or higher
npm --version     # Should be 10.x.x or higher
docker --version  # Should be 20.x.x or higher
git --version     # Any recent version
```

---

## Initial Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd ronl-business-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build Shared Package

```bash
npm run build --workspace=@ronl/shared
```

### 4. Start Docker Services

```bash
# Start Keycloak, PostgreSQL, and Redis
npm run docker:up

# Wait 60 seconds for Keycloak to fully start
# Monitor logs:
docker compose logs -f keycloak

# Keycloak is ready when you see:
# "Keycloak 23.0.0 started"
```

**Services will be available at:**

- Keycloak: http://localhost:8080
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### 5. Start Development Servers

```bash
# In one terminal (starts both frontend and backend)
npm run dev

# Backend: http://localhost:3002
# Frontend: http://localhost:5173
```

---

## Keycloak Configuration

⚠️ **CRITICAL:** The realm import does NOT fully configure all settings. Manual configuration in the Keycloak Admin Console is **REQUIRED**.

### Manual Configuration Steps

#### 1. Login to Keycloak Admin Console

1. Open: http://localhost:8080
2. Click: **Administration Console**
3. Login:
   - Username: `admin`
   - Password: `admin`
4. Select realm: **ronl** (top-left dropdown)

#### 2. Configure CORS Settings

**Problem:** Realm import doesn't properly set webOrigins for browser-based SPAs.

**Solution:**

1. Left menu: **Clients**
2. Click: **ronl-business-api**
3. Tab: **Settings**
4. Scroll to **Access settings** section
5. **Web Origins:** Add `+` (plus symbol)
   - This allows all valid redirect URIs as CORS origins
6. **Valid Redirect URIs:** Should show `*`
7. Click: **Save**

#### 3. Add Audience Protocol Mapper

**Problem:** Public clients don't automatically include audience claim in JWT tokens.

**Solution:**

1. Still in **ronl-business-api** client
2. Tab: **Client scopes**
3. Click: **ronl-business-api-dedicated**
4. Click: **Add mapper** → **By configuration**
5. Select: **Audience**
6. Configure:
   ```
   Name: audience
   Mapper type: Audience
   Included Client Audience: ronl-business-api
   Add to ID token: OFF
   Add to access token: ON
   Add to userinfo: OFF
   ```
7. Click: **Save**

#### 4. Verify Realm Roles Mapper

**Check if it exists:**

1. Still in **ronl-business-api** client
2. Tab: **Client scopes**
3. Click: **ronl-business-api-dedicated**
4. Look for mapper named: **realm_roles**

**If missing, add it:**

1. Click: **Add mapper** → **By configuration**
2. Select: **User Realm Role**
3. Configure:
   ```
   Name: realm_roles
   Mapper type: User Realm Role
   Multivalued: ON
   Token Claim Name: realm_access.roles
   Claim JSON Type: String
   Add to ID token: ON
   Add to access token: ON
   Add to userinfo: ON
   ```
4. Click: **Save**

#### 5. Verify Test Users

1. Left menu: **Users**
2. Should see 8 users:
   - test-citizen-utrecht
   - test-caseworker-utrecht
   - test-citizen-amsterdam
   - test-caseworker-amsterdam
   - test-citizen-rotterdam
   - test-caseworker-rotterdam
   - test-citizen-denhaag
   - test-caseworker-denhaag

**All passwords:** `test123`

---

## Multi-Tenant Theming

### Architecture

The system supports **4 municipalities**, each with its own color scheme:

| Municipality | Primary Color          | Theme                          |
| ------------ | ---------------------- | ------------------------------ |
| Utrecht      | `#C41E3A` (Red)        | Red with green secondary       |
| Amsterdam    | `#EC0000` (Bright Red) | Red with blue secondary        |
| Rotterdam    | `#00811F` (Green)      | Green with dark blue secondary |
| Den Haag     | `#007BC7` (Blue)       | Blue with orange secondary     |

### How It Works

1. **Tenant Configuration:** `/packages/frontend/public/tenants.json`
   - Contains all municipality configs with themes, features, contact info

2. **Tenant Service:** `/packages/frontend/src/services/tenant.ts`
   - Loads configurations
   - Applies CSS custom properties to document root

3. **CSS Variables Applied:**

   ```css
   --color-primary: #c41e3a (changes per municipality) --color-primary-dark: #9b1830
     --color-primary-light: #e85770 --color-secondary: #2c5f2d --color-accent: #ff6b00;
   ```

4. **Components Use Variables:**
   ```tsx
   <header style={{backgroundColor: 'var(--color-primary)'}}>
   ```

### Files Structure

```
packages/frontend/
├── public/
│   └── tenants.json           # Municipality configurations
├── src/
│   ├── services/
│   │   └── tenant.ts          # Tenant management service
│   └── App.tsx                # Calls initializeTenantTheme()
```

---

## Testing

### Test Users Reference

| Username                  | Password | Municipality | Role       | Purpose                   |
| ------------------------- | -------- | ------------ | ---------- | ------------------------- |
| test-citizen-utrecht      | test123  | utrecht      | citizen    | Test red theme            |
| test-caseworker-utrecht   | test123  | utrecht      | caseworker | Test caseworker access    |
| test-citizen-amsterdam    | test123  | amsterdam    | citizen    | Test bright red theme     |
| test-caseworker-amsterdam | test123  | amsterdam    | caseworker | Test Amsterdam caseworker |
| test-citizen-rotterdam    | test123  | rotterdam    | citizen    | Test green theme          |
| test-caseworker-rotterdam | test123  | rotterdam    | caseworker | Test Rotterdam caseworker |
| test-citizen-denhaag      | test123  | denhaag      | citizen    | Test blue theme           |
| test-caseworker-denhaag   | test123  | denhaag      | caseworker | Test Den Haag caseworker  |

### Testing Sequence

#### 1. Test Utrecht (Red Theme)

```bash
# Login as: test-citizen-utrecht / test123
```

**Expected:**

- ✅ Header is red (`#C41E3A`)
- ✅ LoA badge is dark red
- ✅ Role badge shows "citizen"
- ✅ "Berekenen" button is red
- ✅ Municipality shows "Gemeente Utrecht"

#### 2. Test Amsterdam (Bright Red Theme)

```bash
# Logout, then login as: test-citizen-amsterdam / test123
```

**Expected:**

- ✅ Header is bright red (`#EC0000`)
- ✅ Municipality shows "Gemeente Amsterdam"
- ✅ Theme visibly different from Utrecht

#### 3. Test Rotterdam (Green Theme)

```bash
# Logout, then login as: test-citizen-rotterdam / test123
```

**Expected:**

- ✅ Header is green (`#00811F`)
- ✅ Municipality shows "Gemeente Rotterdam"
- ✅ Complete color scheme change

#### 4. Test Den Haag (Blue Theme)

```bash
# Logout, then login as: test-citizen-denhaag / test123
```

**Expected:**

- ✅ Header is blue (`#007BC7`)
- ✅ Municipality shows "Gemeente Denhaag"

#### 5. Test Zorgtoeslag Calculation

**For each municipality:**

1. Login
2. Verify theme loads
3. Adjust form values
4. Click "Berekenen"
5. Verify:
   - ✅ API call succeeds (check Network tab)
   - ✅ Result displays
   - ✅ No CORS errors
   - ✅ No JWT errors

---

## Troubleshooting

### Issue: "JWT audience invalid"

**Symptoms:**

```
Token validation failed: jwt audience invalid. expected: ronl-business-api
```

**Solution:**
Add audience protocol mapper manually (see [Keycloak Configuration](#keycloak-configuration) step 3).

---

### Issue: "Roles not displaying"

**Symptoms:**

- Header shows "citizen" for all users
- Caseworker accounts show "citizen" role

**Solution:**
Add realm_roles protocol mapper (see [Keycloak Configuration](#keycloak-configuration) step 4).

---

### Issue: CORS Errors in Browser

**Symptoms:**

```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:**

1. Configure webOrigins in Keycloak (see step 2)
2. Verify backend CORS config includes frontend port:
   ```typescript
   // packages/backend/src/utils/config.ts
   corsOrigin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3002'];
   ```

---

### Issue: Theme Not Loading

**Symptoms:**

- Header stays blue (default color)
- Console shows "No tenant config found"

**Check:**

1. **File exists:** `packages/frontend/public/tenants.json`
2. **Network tab:** Request to `/tenants.json` returns 200
3. **Console logs:**
   ```
   📋 Loaded tenant configurations: (4) ['utrecht', 'amsterdam', 'rotterdam', 'denhaag']
   🎨 Applied tenant theme: {primary: '#C41E3A', ...}
   🏛️ Loaded tenant config: Gemeente Utrecht
   ```

**Solution:**

- Ensure `tenants.json` is in `public/` folder
- Restart dev server (`npm run dev`)

---

### Issue: White "Berekenen" Button

**Symptoms:**

- Button exists but is invisible (white on white)

**Solution:**
Button must use inline styles with CSS variables:

```tsx
<button
  style={{ backgroundColor: 'var(--color-primary)' }}
  className="w-full py-3 px-6 rounded-lg text-white hover:opacity-90"
>
  Berekenen
</button>
```

---

### Issue: Keycloak Not Starting

**Symptoms:**

```
Connection refused on localhost:8080
```

**Solution:**

```bash
# Check if Keycloak is running
docker compose ps

# View logs
docker compose logs keycloak

# Restart if needed
docker compose restart keycloak

# Full reset (nuclear option)
docker compose down -v
docker compose up -d
```

---

## Cross-Platform Notes

### Windows Considerations

**Docker Networking:**

- Windows Docker Desktop uses a VM
- May require explicit CORS configuration in Keycloak
- localhost resolution can differ from Linux

**Common Windows Issues:**

1. **Browser Cache:** Regular Chrome may cache old CORS errors
   - **Solution:** Use Incognito mode or clear cache completely

2. **Line Endings:** Git may convert LF to CRLF
   - **Solution:** Configure Git:
     ```bash
     git config --global core.autocrlf false
     ```

3. **File Paths:** Windows uses backslashes
   - Project uses forward slashes (Unix-style) throughout

### Linux (Ubuntu) Considerations

- ✅ Native Docker (no VM overhead)
- ✅ Better performance
- ✅ Fewer CORS issues
- ✅ Recommended for primary development

### macOS Considerations

- Similar to Windows (Docker Desktop uses VM)
- Generally works well but slower than Linux native

---

## Quick Reference Commands

```bash
# Start everything
npm run docker:up
npm run dev

# Stop everything
Ctrl+C (in dev terminal)
npm run docker:down

# Full reset (clean slate)
npm run docker:down:volumes
npm run docker:up
npm run build --workspace=@ronl/shared
npm run dev

# View logs
docker compose logs -f keycloak
docker compose logs -f postgres
docker compose logs backend  # from npm run dev output

# Check health
curl http://localhost:3002/v1/health | jq
curl http://localhost:8080/health/ready

# Test API with token
# (Get token from browser localStorage or Keycloak)
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3002/v1/health | jq
```

---

## Development Workflow

### Daily Workflow

```bash
# 1. Start services (if not already running)
npm run docker:up

# 2. Start dev servers
npm run dev

# 3. Open browser
http://localhost:5173

# 4. Login and test
# Use any test user (password: test123)
```

### Making Changes

**Frontend Changes:**

- Files auto-reload (Vite HMR)
- No restart needed

**Backend Changes:**

- Files auto-reload (tsx watch)
- No restart needed

**Shared Types Changes:**

```bash
npm run build --workspace=@ronl/shared
# Frontend and backend auto-reload after build
```

### Git Workflow

```bash
# Husky hooks run automatically
git add .
git commit -m "feat: add something"
git push
```

---

## Next Steps

After completing setup and testing:

1. ✅ **Verify all 4 municipality themes work**
2. ✅ **Test both citizen and caseworker roles**
3. ✅ **Confirm zorgtoeslag calculations work**
4. 🚀 **Deploy to Azure with GitHub Actions**
5. 🔒 **Configure production Keycloak**
6. 📊 **Add LoA demonstration features**
7. 🔗 **Integrate TriplyDB for regulations**

---

## Support & Resources

- **Architecture Docs:** `/docs/`
- **API Documentation:** http://localhost:3002 (when running)
- **Keycloak Docs:** https://www.keycloak.org/docs/23.0/
- **React Docs:** https://react.dev
- **Express Docs:** https://expressjs.com

---

**Version:** 1.0.0  
**Last Updated:** 2026-02-01  
**Status:** ✅ Production Ready for Development Environment
