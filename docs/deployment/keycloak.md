# Keycloak Deployment Guide

## Overview

This guide covers deploying Keycloak to your VM for both ACC and PROD environments. Keycloak provides Identity and Access Management (IAM) for RONL Business API, handling authentication and JWT token issuance.

## Why Keycloak on VM?

- ✅ **Cost Savings**: €100-160/month vs Azure Container Apps
- ✅ **Full Control**: Customize for government compliance
- ✅ **Flexibility**: Easy integration with DigiD/eIDAS
- ✅ **No Vendor Lock-in**: Can migrate anywhere

See [Deployment Architecture](../architecture/deployment.md) for the full story.

## Architecture

```
VM (open-regels.nl)
├── Keycloak ACC
│   ├── Container: keycloak-acc
│   ├── Database: keycloak-postgres-acc
│   └── URL: https://acc.keycloak.open-regels.nl
└── Keycloak PROD
    ├── Container: keycloak-prod
    ├── Database: keycloak-postgres-prod
    └── URL: https://keycloak.open-regels.nl
```

Both environments run in Docker containers on the same VM but are completely isolated.

## Prerequisites

### On VM

- Ubuntu 24.04 LTS
- Docker Engine 24+
- Docker Compose 2.x
- Ports 80, 443 open
- Domain: open-regels.nl configured in DNS

### On Local Machine

- SSH access to VM
- Git repository cloned
- SCP or similar file transfer tool

## Repository Structure

All Keycloak configuration is in the repository:

```
ronl-business-api/
├── deployment/vm/keycloak/
│   ├── acc/
│   │   ├── docker-compose.yml          # ACC configuration
│   │   ├── .env.example                # Environment template
│   │   └── README.md                   # ACC-specific guide
│   └── prod/
│       ├── docker-compose.yml          # PROD configuration
│       ├── .env.example                # Environment template
│       └── README.md                   # PROD-specific guide
└── config/keycloak/
    └── ronl-realm.json                 # Realm configuration
```

**Key Files**:

- [`deployment/vm/keycloak/acc/docker-compose.yml`](../../deployment/vm/keycloak/acc/docker-compose.yml) - ACC Docker Compose
- [`deployment/vm/keycloak/prod/docker-compose.yml`](../../deployment/vm/keycloak/prod/docker-compose.yml) - PROD Docker Compose
- [`config/keycloak/ronl-realm.json`](../../config/keycloak/ronl-realm.json) - Realm with users, clients, roles

## Deployment Steps

### 1. Deploy ACC Keycloak

#### Copy Files to VM

```bash
# From your local machine
cd ~/Development/ronl-business-api

# Create directory on VM
ssh user@vm "mkdir -p ~/keycloak/acc"

# Copy docker-compose.yml
scp deployment/vm/keycloak/acc/docker-compose.yml user@vm:~/keycloak/acc/

# Copy realm configuration
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/acc/
```

#### Create Environment File

```bash
# SSH to VM
ssh user@vm

# Navigate to directory
cd ~/keycloak/acc

# Generate secure admin password
ADMIN_PW=$(openssl rand -base64 32)

# Create .env file
cat > .env << EOF
KEYCLOAK_ADMIN_PASSWORD=$ADMIN_PW
EOF

# Secure the file
chmod 600 .env

# Save password for later use
mkdir -p ~/.secrets
echo "=== ACC Keycloak Admin ===" >> ~/.secrets/keycloak-passwords.txt
echo "URL: https://acc.keycloak.open-regels.nl" >> ~/.secrets/keycloak-passwords.txt
echo "Username: admin" >> ~/.secrets/keycloak-passwords.txt
echo "Password: $ADMIN_PW" >> ~/.secrets/keycloak-passwords.txt
echo "" >> ~/.secrets/keycloak-passwords.txt
chmod 600 ~/.secrets/keycloak-passwords.txt

echo "ACC admin password saved to ~/.secrets/keycloak-passwords.txt"
```

#### Start Keycloak ACC

```bash
cd ~/keycloak/acc

# Start services
docker compose up -d

# Watch logs
docker compose logs -f keycloak-acc

# Wait for these messages:
# ✅ "Database migrations: 117 changesets"
# ✅ "Realm 'ronl' imported"
# ✅ "Keycloak started in XXXs"
```

**Startup takes 60-90 seconds.** Be patient!

#### Verify ACC Deployment

```bash
# Check container status
docker ps | grep keycloak-acc
# Should show: (healthy)

# Test health endpoint
curl https://acc.keycloak.open-regels.nl/health/ready
# Should return: {"status":"UP"}

# Test admin console
curl -I https://acc.keycloak.open-regels.nl/
# Should return: 200 OK
```

#### Access ACC Admin Console

1. Open browser: https://acc.keycloak.open-regels.nl/
2. Click "Administration Console"
3. Login:
   - Username: `admin`
   - Password: (from `~/.secrets/keycloak-passwords.txt`)

### 2. Deploy PROD Keycloak

**Repeat same steps for PROD**, but use:

- Directory: `~/keycloak/prod`
- Files from: `deployment/vm/keycloak/prod/`
- URL: https://keycloak.open-regels.nl

```bash
# From local machine
scp deployment/vm/keycloak/prod/docker-compose.yml user@vm:~/keycloak/prod/
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/prod/

# On VM
ssh user@vm
cd ~/keycloak/prod

# Generate DIFFERENT password than ACC!
ADMIN_PW=$(openssl rand -base64 32)

# Create .env
cat > .env << EOF
KEYCLOAK_ADMIN_PASSWORD=$ADMIN_PW
EOF

chmod 600 .env

# Save password
echo "=== PROD Keycloak Admin ===" >> ~/.secrets/keycloak-passwords.txt
echo "URL: https://keycloak.open-regels.nl" >> ~/.secrets/keycloak-passwords.txt
echo "Username: admin" >> ~/.secrets/keycloak-passwords.txt
echo "Password: $ADMIN_PW" >> ~/.secrets/keycloak-passwords.txt
chmod 600 ~/.secrets/keycloak-passwords.txt

# Start
docker compose up -d
docker compose logs -f keycloak-prod

# Verify
curl https://keycloak.open-regels.nl/health/ready
```

### 3. Configure Realm for ACC

#### Login to ACC Admin Console

https://acc.keycloak.open-regels.nl/ → Administration Console

#### Switch to RONL Realm

Top-left dropdown: Select "ronl" realm (not "master")

#### Configure Client CORS

1. Navigate: **Clients** → **ronl-business-api** → **Settings**
2. Set:
   - Valid Redirect URIs: `https://acc.mijn.open-regels.nl/*`
   - Web Origins: `+`
3. Click **Save**

#### Add Audience Mapper

1. Navigate: **Clients** → **ronl-business-api** → **Client scopes**
2. Click **ronl-business-api-dedicated**
3. Click **Add mapper** → **By configuration** → **Audience**
4. Configure:
   - Name: `aud-mapper`
   - Included Client Audience: `ronl-business-api`
   - Add to access token: **ON**
5. Click **Save**

#### Set User Passwords

1. Navigate: **Users** → **View all users**
2. For each user:
   - Click username
   - Go to **Credentials** tab
   - Click **Set password**
   - Enter: `Test123!`
   - Temporary: **OFF**
   - Click **Save**

**Test Users** (8 total):

- `test-citizen-utrecht`
- `test-citizen-amsterdam`
- `test-citizen-rotterdam`
- `test-citizen-denhaag`
- `test-caseworker-utrecht`
- `test-caseworker-amsterdam`
- `test-caseworker-rotterdam`
- `test-caseworker-denhaag`

### 4. Configure Realm for PROD

**Repeat same steps for PROD**, but use:

- URL: https://keycloak.open-regels.nl/
- Valid Redirect URIs: `https://mijn.open-regels.nl/*`
- **Use strong production passwords!** (not Test123!)

## Configuration Details

### Docker Compose Overview

Both ACC and PROD use the same structure:

```yaml
services:
  keycloak-postgres-xxx:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
      POSTGRES_DB: keycloak
    volumes:
      - keycloak-xxx-db-data:/var/lib/postgresql/data
    networks:
      - keycloak-xxx-network

  keycloak-xxx:
    image: quay.io/keycloak/keycloak:23.0
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-postgres-xxx:5432/keycloak
      KC_HOSTNAME: keycloak.open-regels.nl # or acc.keycloak...
      KC_PROXY: edge
      KC_LOG_LEVEL: info # warn for PROD
    command:
      - start-dev
      - --import-realm
    volumes:
      - ./ronl-realm.json:/opt/keycloak/data/import/ronl-realm.json:ro
    networks:
      - keycloak-xxx-network
      - npm-network # Connects to Caddy
```

**Key Settings**:

- `KC_PROXY: edge` - Keycloak behind reverse proxy
- `--import-realm` - Automatically imports ronl-realm.json
- `npm-network` - Shared network with Caddy for routing

### Realm Configuration

The `ronl-realm.json` file contains:

**Realm Settings**:

- Name: `ronl`
- Display: "RONL - Regels Overheid Nederland"
- SSL Required: External
- Login: Username only (no email)
- Brute Force Protection: Enabled

**Client Configuration**:

- Client ID: `ronl-business-api`
- Protocol: `openid-connect`
- Access Type: `public`
- Valid Redirect URIs: Set during configuration
- Web Origins: Configured per environment

**Users** (per municipality):

- Citizens: `test-citizen-{municipality}`
- Caseworkers: `test-caseworker-{municipality}`

**Roles**:

- `citizen`: Can start processes
- `caseworker`: Can process applications
- `admin`: Full access (not created by default)

**Custom Attributes**:

- `municipality`: `utrecht`, `amsterdam`, `rotterdam`, `denhaag`
- `loa`: `substantial` (Level of Assurance)

## Verification

### Health Check

```bash
# ACC
curl https://acc.keycloak.open-regels.nl/health/ready
# Expected: {"status":"UP","checks":[]}

# PROD
curl https://keycloak.open-regels.nl/health/ready
# Expected: {"status":"UP","checks":[]}
```

### OIDC Discovery

```bash
# ACC
curl https://acc.keycloak.open-regels.nl/realms/ronl/.well-known/openid-configuration | jq

# PROD
curl https://keycloak.open-regels.nl/realms/ronl/.well-known/openid-configuration | jq
```

### JWKS Endpoint

```bash
# ACC
curl https://acc.keycloak.open-regels.nl/realms/ronl/protocol/openid-connect/certs | jq

# PROD
curl https://keycloak.open-regels.nl/realms/ronl/protocol/openid-connect/certs | jq
```

### Test Login Flow

1. Open ACC frontend: https://acc.mijn.open-regels.nl
2. Click "Inloggen"
3. Should redirect to ACC Keycloak
4. Login: `test-citizen-utrecht` / `Test123!`
5. Should redirect back to frontend
6. Frontend should show: "Ingelogd als citizen"

## Maintenance

### View Logs

```bash
# ACC
cd ~/keycloak/acc
docker compose logs -f keycloak-acc

# PROD
cd ~/keycloak/prod
docker compose logs -f keycloak-prod
```

### Restart Services

```bash
# ACC
cd ~/keycloak/acc
docker compose restart keycloak-acc

# PROD
cd ~/keycloak/prod
docker compose restart keycloak-prod
```

### Update Keycloak

```bash
# ACC
cd ~/keycloak/acc
docker compose pull
docker compose up -d

# PROD (during maintenance window)
cd ~/keycloak/prod
docker compose pull
docker compose up -d
```

### Backup

```bash
# Backup database
docker exec keycloak-postgres-acc pg_dump -U keycloak keycloak \
  > /backup/keycloak-acc-$(date +%Y%m%d).sql

docker exec keycloak-postgres-prod pg_dump -U keycloak keycloak \
  > /backup/keycloak-prod-$(date +%Y%m%d).sql

# Backup volumes
docker run --rm -v keycloak-acc-db-data:/data -v /backup:/backup alpine \
  tar czf /backup/keycloak-acc-db-$(date +%Y%m%d).tar.gz /data
```

## Troubleshooting

### Container Not Starting

```bash
# Check logs
docker compose logs keycloak-acc

# Common issues:
# 1. Database not ready → Wait 30 seconds
# 2. Port conflict → Check port 8080
# 3. Network issue → Check npm-network exists
```

### Cannot Access Admin Console

```bash
# Check Caddy is running
docker ps | grep caddy

# Check Caddy configuration
docker exec caddy cat /etc/caddy/Caddyfile | grep keycloak

# Test from VM
curl http://localhost:8080  # Should fail (not exposed)
curl https://acc.keycloak.open-regels.nl/  # Should work
```

### Realm Not Imported

```bash
# Check realm file is mounted
docker exec keycloak-acc ls -la /opt/keycloak/data/import/

# If missing, copy again
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/acc/

# Restart
docker compose restart keycloak-acc
```

### Users Can't Login

1. Verify user exists: Admin Console → Users
2. Check password is set: User → Credentials tab
3. Verify user has roles: User → Role mappings tab
4. Check client CORS: Clients → ronl-business-api → Settings

## Security Considerations

### Production Checklist

- [ ] Strong admin password (not Test123!)
- [ ] MFA enabled for admin account
- [ ] Test users have strong passwords
- [ ] Brute force protection enabled
- [ ] Session timeout configured
- [ ] Audit logging enabled
- [ ] Regular backups scheduled
- [ ] SSL/TLS certificates valid
- [ ] Firewall rules configured

### Recommended Settings for PROD

**Realm Settings**:

- Session timeout: 30 minutes
- Access token lifespan: 15 minutes
- Refresh token lifespan: 30 minutes
- Max failed attempts: 5
- Wait increment: 60 seconds

**Client Settings**:

- Proof Key for Code Exchange (PKCE): Enabled
- Consent Required: Optional (for transparency)

## Integration with Backend

Once Keycloak is deployed, update backend environment variables:

```bash
# ACC Backend
KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
KEYCLOAK_REALM=ronl
KEYCLOAK_CLIENT_ID=ronl-business-api

# PROD Backend
KEYCLOAK_URL=https://keycloak.open-regels.nl
KEYCLOAK_REALM=ronl
KEYCLOAK_CLIENT_ID=ronl-business-api
```

See [Backend Deployment](backend.md) for full backend setup.

## Cost Summary

### Monthly Costs

**VM Infrastructure**: ~€30/month (entire VM)

- Keycloak ACC: Included
- Keycloak PROD: Included
- PostgreSQL databases: Included
- Caddy: Included

**Azure Alternative**: €100-160/month

- Container App ACC: €50-80/month
- Container App PROD: €50-80/month

**Savings**: €70-130/month per environment = €140-260/month total 💰

## Next Steps

- [Backend Deployment](backend.md) - Connect backend to Keycloak
- [Frontend Deployment](frontend.md) - Configure OIDC client
- [Security Architecture](../architecture/security.md) - Understand authentication flow

## Additional Resources

- **ACC Setup**: [`deployment/vm/keycloak/acc/README.md`](../../deployment/vm/keycloak/acc/README.md)
- **PROD Setup**: [`deployment/vm/keycloak/prod/README.md`](../../deployment/vm/keycloak/prod/README.md)
- **VM Deployment**: [`deployment/vm/README.md`](../../deployment/vm/README.md)

---

**Keycloak deployment complete! Your IAM is now running on the VM.** 🔐
