# RONL Business API - Setup Guide

**Quick start guide for local development and testing**

---

## 📋 Prerequisites

Before starting, ensure you have:

- **Node.js** 20.0.0 or higher ([Download](https://nodejs.org/))
- **Docker** & **Docker Compose** ([Download](https://www.docker.com/))
- **Git** ([Download](https://git-scm.com/))
- **curl** or **Postman** (for testing API)

---

## 🚀 Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/ronl-business-api.git
cd ronl-business-api

# Install dependencies
npm install
```

---

## 🐳 Step 2: Start Docker Services

This will start Keycloak, PostgreSQL, Redis, and Operaton:

```bash
# Start all services
docker-compose up -d

# Wait 30-60 seconds for Keycloak to fully start
# You can check status with:
docker-compose logs -f keycloak

# Keycloak is ready when you see:
# "Keycloak 23.0.0 started"
```

**Services will be available at:**

- Keycloak: http://localhost:8080 (admin/admin)
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Operaton: http://localhost:8081

---

## ⚙️ Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env.development

# Edit .env.development (optional - defaults should work)
nano .env.development
```

**Default configuration works out of the box!** No changes needed for local development.

---

## 🏃 Step 4: Start the API

```bash
# Development mode (with hot reload)
npm run dev

# You should see:
# [info] Server started { host: '0.0.0.0', port: 3002 }
# [info] API available at: http://0.0.0.0:3002/v1
```

The API is now running at http://localhost:3002

---

## 🔑 Step 5: Get a Token from Keycloak

### Option A: Using curl

```bash
# Get access token
TOKEN=$(curl -s -X POST http://localhost:8080/realms/ronl/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=ronl-business-api" \
  -d "client_secret=**GENERATED**" \
  -d "username=test-citizen-utrecht" \
  -d "password=test123" \
  -d "grant_type=password" \
  | jq -r '.access_token')

echo "Token: $TOKEN"
```

**Note:** You need to get the client secret from Keycloak admin console first:

1. Open http://localhost:8080
2. Login with admin/admin
3. Go to "Clients" → "ronl-business-api" → "Credentials" tab
4. Copy the "Client secret"
5. Replace `**GENERATED**` in the command above

### Option B: Using Keycloak Admin Console

1. Open http://localhost:8080
2. Login: **admin** / **admin**
3. Select realm: **ronl** (top-left dropdown)
4. Go to: **Clients** → **ronl-business-api**
5. Click: **Credentials** tab
6. Copy the **Client secret**

---

## 🧪 Step 6: Test the API

### Health Check (No authentication)

```bash
curl http://localhost:3002/v1/health | jq
```

Expected response:

```json
{
  "success": true,
  "data": {
    "name": "RONL Business API",
    "version": "1.0.0",
    "status": "healthy",
    "dependencies": {
      "keycloak": { "status": "up" },
      "operaton": { "status": "up" }
    }
  }
}
```

### Start a Process (Requires authentication)

```bash
# Replace $TOKEN with your actual token from Step 5
curl -X POST http://localhost:3002/v1/process/vergunning/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "aanvrager": "Test Burger",
      "adres": "Teststraat 123"
    }
  }' | jq
```

Expected response:

```json
{
  "success": true,
  "data": {
    "processInstanceId": "abc-123-def",
    "businessKey": "utrecht-1706400000000",
    "status": "active",
    "startTime": "2026-01-28T10:30:00.000Z"
  }
}
```

---

## 🎯 Step 7: Explore Keycloak

### Login to Keycloak Admin

1. Open: http://localhost:8080
2. Username: **admin**
3. Password: **admin**
4. Select realm: **ronl** (dropdown at top-left)

### Test Users

The realm comes pre-configured with test users:

**Citizen (Utrecht)**

- Username: `test-citizen-utrecht`
- Password: `test123`
- Municipality: Utrecht
- Assurance Level: Hoog (High)
- Role: citizen

**Caseworker (Utrecht)**

- Username: `test-caseworker-utrecht`
- Password: `test123`
- Municipality: Utrecht
- Role: caseworker

### View Token Claims

After getting a token, decode it at https://jwt.io to see:

- `sub`: User ID (opaque)
- `municipality`: utrecht
- `loa`: hoog
- `roles`: ["citizen"]

---

## 🛠️ Development Workflow

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests (requires Docker services)
npm run test:integration

# Watch mode
npm run test:watch
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run type-check
```

### Viewing Logs

```bash
# Application logs (in terminal where you ran npm run dev)
# Ctrl+C to stop

# Docker service logs
docker-compose logs -f keycloak
docker-compose logs -f postgres
docker-compose logs -f operaton

# All logs
docker-compose logs -f
```

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it ronl-postgres psql -U postgres

# Switch to audit_logs database
\c audit_logs

# View audit logs
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;

# View tenants
SELECT * FROM tenants;
```

---

## 🔧 Common Issues

### Issue: "Keycloak not responding"

**Solution:**

```bash
# Restart Keycloak
docker-compose restart keycloak

# Wait 30 seconds, then test
curl http://localhost:8080/health/ready
```

### Issue: "Port 3002 already in use"

**Solution:**

```bash
# Find process using port
lsof -i :3002

# Kill the process
kill -9 <PID>

# Or change port in .env.development
PORT=3003
```

### Issue: "Database connection failed"

**Solution:**

```bash
# Restart PostgreSQL
docker-compose restart postgres

# Wait 10 seconds, then restart API
npm run dev
```

### Issue: "Token validation failed"

**Solution:**

1. Check that Keycloak is running: http://localhost:8080
2. Verify realm is "ronl"
3. Check client secret matches .env.development
4. Ensure token hasn't expired (15 minute lifetime)
5. Get a fresh token

---

## 🧹 Cleanup

### Stop Services

```bash
# Stop all Docker services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Remove Node Modules

```bash
# Remove dependencies
rm -rf node_modules

# Remove build artifacts
rm -rf dist
rm -rf logs
```

---

## 📚 Next Steps

1. **Read the API Documentation:** `/docs/API.md`
2. **Review Security Guide:** `/docs/SECURITY.md`
3. **Explore Keycloak Setup:** `/docs/KEYCLOAK.md`
4. **Deploy to Azure:** `/docs/DEPLOYMENT.md`

---

## 💡 Tips

- **API Documentation:** http://localhost:3002 (root endpoint)
- **Health Checks:** http://localhost:3002/v1/health
- **Keycloak Console:** http://localhost:8080
- **Operaton Cockpit:** http://localhost:8081/operaton/app/cockpit/default/

---

## 🤝 Need Help?

- **Issues:** GitHub Issues
- **Questions:** Team Slack / Email
- **Security:** security@ronl.nl

---

**Happy coding! 🚀**
