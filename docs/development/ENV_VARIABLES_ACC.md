# Environment Variables - ACC

## Backend (.env.production)

```bash
# Environment
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# CORS Configuration
CORS_ORIGIN=https://acc.mijn.open-regels.nl

# Keycloak Configuration
KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
KEYCLOAK_REALM=ronl
KEYCLOAK_CLIENT_ID=ronl-business-api
KEYCLOAK_CLIENT_SECRET=<YOUR_CLIENT_SECRET>

# JWT Configuration
JWT_ISSUER=https://acc.keycloak.open-regels.nl/realms/ronl
JWT_AUDIENCE=ronl-business-api
TOKEN_CACHE_TTL=300

# Operaton Configuration
OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest
OPERATON_TIMEOUT=30000

# Database Configuration
DATABASE_URL=postgresql://pgadmin:<PASSWORD>@ronl-postgres-acc.postgres.database.azure.com:5432/audit_logs?sslmode=require
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis Configuration
REDIS_URL=redis://ronl-redis-acc.redis.cache.windows.net:6380?password=<PRIMARY_KEY>&ssl=true
REDIS_TTL=3600

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_PER_TENANT=true

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/home/site/wwwroot/logs
LOG_FILE_MAX_SIZE=10m
LOG_FILE_MAX_FILES=7

# Audit Configuration
AUDIT_LOG_ENABLED=true
AUDIT_LOG_INCLUDE_IP=true
AUDIT_LOG_RETENTION_DAYS=2555

# Security Configuration
HELMET_ENABLED=true
SECURE_COOKIES=true
TRUST_PROXY=true

# Features
ENABLE_SWAGGER=false
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true

# Tenant Configuration
DEFAULT_MAX_PROCESS_INSTANCES=1000
ENABLE_TENANT_ISOLATION=true
```

## Azure Web App Configuration Command

```bash
az webapp config appsettings set \
  --name ronl-business-api-acc \
  --resource-group rg-ronl-acc \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    CORS_ORIGIN="https://acc.mijn.open-regels.nl" \
    KEYCLOAK_URL="https://acc.keycloak.open-regels.nl" \
    KEYCLOAK_REALM="ronl" \
    KEYCLOAK_CLIENT_ID="ronl-business-api" \
    KEYCLOAK_CLIENT_SECRET="<YOUR_CLIENT_SECRET>" \
    JWT_ISSUER="https://acc.keycloak.open-regels.nl/realms/ronl" \
    JWT_AUDIENCE="ronl-business-api" \
    TOKEN_CACHE_TTL="300" \
    OPERATON_BASE_URL="https://operaton.open-regels.nl/engine-rest" \
    OPERATON_TIMEOUT="30000" \
    DATABASE_URL="postgresql://pgadmin:<PASSWORD>@ronl-postgres-acc.postgres.database.azure.com:5432/audit_logs?sslmode=require" \
    DATABASE_POOL_MIN="2" \
    DATABASE_POOL_MAX="10" \
    REDIS_URL="redis://ronl-redis-acc.redis.cache.windows.net:6380?password=<PRIMARY_KEY>&ssl=true" \
    REDIS_TTL="3600" \
    RATE_LIMIT_WINDOW_MS="60000" \
    RATE_LIMIT_MAX_REQUESTS="100" \
    RATE_LIMIT_PER_TENANT="true" \
    LOG_LEVEL="info" \
    LOG_FORMAT="json" \
    LOG_FILE_ENABLED="true" \
    LOG_FILE_PATH="/home/site/wwwroot/logs" \
    LOG_FILE_MAX_SIZE="10m" \
    LOG_FILE_MAX_FILES="7" \
    AUDIT_LOG_ENABLED="true" \
    AUDIT_LOG_INCLUDE_IP="true" \
    AUDIT_LOG_RETENTION_DAYS="2555" \
    HELMET_ENABLED="true" \
    SECURE_COOKIES="true" \
    TRUST_PROXY="true" \
    ENABLE_SWAGGER="false" \
    ENABLE_METRICS="true" \
    ENABLE_HEALTH_CHECKS="true" \
    DEFAULT_MAX_PROCESS_INSTANCES="1000" \
    ENABLE_TENANT_ISOLATION="true"
```

## Keycloak Environment Variables

```bash
# Container App environment variables
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://ronl-postgres-acc.postgres.database.azure.com:5432/keycloak?sslmode=require
KC_DB_USERNAME=pgadmin
KC_DB_PASSWORD=<YOUR_POSTGRES_PASSWORD>
KC_HOSTNAME=acc.keycloak.open-regels.nl
KC_HOSTNAME_STRICT=false
KC_HTTP_ENABLED=true
KC_PROXY=edge
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<CHANGE_ME_IMMEDIATELY>
```

## Frontend Build-time Variables

These are replaced during the build process in the GitHub Actions workflow:

```bash
# API Configuration
VITE_API_BASE_URL=https://acc.api.open-regels.nl/v1

# Keycloak Configuration
VITE_KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
VITE_KEYCLOAK_REALM=ronl
VITE_KEYCLOAK_CLIENT_ID=ronl-business-api
```

## PostgreSQL Configuration

```bash
# Admin user
POSTGRES_USER=pgadmin
POSTGRES_PASSWORD=<GENERATE_SECURE_PASSWORD>

# Databases
POSTGRES_DB=postgres

# Additional databases created:
# - audit_logs (for Backend API)
# - keycloak (for Keycloak)
```

## Redis Configuration

```bash
# Redis is managed by Azure
# Connection string format:
REDIS_URL=redis://ronl-redis-acc.redis.cache.windows.net:6380?password=<PRIMARY_KEY>&ssl=true
```

## DNS Records

```txt
# CNAME Records for open-regels.nl
acc.api         CNAME   ronl-business-api-acc.azurewebsites.net
acc.mijn        CNAME   <your-static-web-app>.azurestaticapps.net
acc.keycloak    CNAME   <your-keycloak-app>.<region>.azurecontainerapps.io
```

## GitHub Secrets

Required secrets in GitHub repository:

```bash
# Secret: AZURE_WEBAPP_PUBLISH_PROFILE_ACC
# Value: Content of the publish profile XML from Azure Web App

# Secret: AZURE_STATIC_WEB_APPS_API_TOKEN_ACC
# Value: Deployment token from Azure Static Web Apps
```

## Quick Setup Script

Save this as `setup-acc-env.sh`:

```bash
#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Setting up ACC Environment${NC}"

# Generate secure passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
KEYCLOAK_PASSWORD=$(openssl rand -base64 32)
REDIS_KEY=$(openssl rand -base64 32)

echo -e "${YELLOW}📝 Generated Passwords (SAVE THESE SECURELY):${NC}"
echo ""
echo "PostgreSQL Admin Password: $POSTGRES_PASSWORD"
echo "Keycloak Admin Password: $KEYCLOAK_PASSWORD"
echo ""

# Save to secure location
mkdir -p ~/.ronl-secrets
cat > ~/.ronl-secrets/acc-passwords.txt << EOF
# RONL ACC Environment Passwords
# Generated: $(date)

PostgreSQL Admin:
Username: pgadmin
Password: $POSTGRES_PASSWORD

Keycloak Admin:
Username: admin
Password: $KEYCLOAK_PASSWORD

Connection Strings:
PostgreSQL: postgresql://pgadmin:$POSTGRES_PASSWORD@ronl-postgres-acc.postgres.database.azure.com:5432/audit_logs?sslmode=require
EOF

chmod 600 ~/.ronl-secrets/acc-passwords.txt

echo -e "${GREEN}✅ Passwords saved to: ~/.ronl-secrets/acc-passwords.txt${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Backup this file securely!${NC}"
```

## Verification Checklist

After configuration:

```bash
# Backend
curl https://acc.api.open-regels.nl/v1/health | jq

# Frontend
curl -I https://acc.mijn.open-regels.nl

# Keycloak
curl -I https://acc.keycloak.open-regels.nl

# Test authentication flow
# 1. Open https://acc.mijn.open-regels.nl
# 2. Login with test user
# 3. Verify JWT token contains:
#    - municipality claim
#    - loa claim
#    - realm_access.roles
#    - aud: ronl-business-api
```

---

**Last Updated:** 2026-02-01
