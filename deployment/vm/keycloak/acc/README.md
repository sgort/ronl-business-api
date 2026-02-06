# Keycloak ACC Deployment

Keycloak acceptance environment running on VM.

## Prerequisites

- Docker and Docker Compose installed on VM
- Access to VM via SSH
- `ronl-realm.json` in `config/keycloak/` directory
- Caddy reverse proxy configured with `npm-network`

## Initial Setup

### 1. Copy Files to VM

```bash
# From your local machine
cd ~/Development/ronl-business-api

# Create directory on VM
ssh user@vm "mkdir -p ~/keycloak/acc"

# Copy docker-compose.yml
scp deployment/vm/keycloak/acc/docker-compose.yml user@vm:~/keycloak/acc/

# Copy realm file
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/acc/
```

### 2. Create Environment File

```bash
# On VM
cd ~/keycloak/acc

# Generate secure password
ADMIN_PW=$(openssl rand -base64 32)

# Create .env file
cat > .env << EOF
KEYCLOAK_ADMIN_PASSWORD=$ADMIN_PW
EOF

chmod 600 .env

# Save password securely
echo "ACC Admin: $ADMIN_PW" >> ~/keycloak-passwords.txt
chmod 600 ~/keycloak-passwords.txt
```

### 3. Start Keycloak

```bash
cd ~/keycloak/acc

# Start services
docker compose up -d

# Watch logs
docker compose logs -f keycloak-acc

# Wait for: "Keycloak started" and "Realm 'ronl' imported"
```

### 4. Verify Deployment

```bash
# Check container status
docker ps | grep keycloak-acc
# Should show: (healthy)

# Test health endpoint
curl https://acc.keycloak.open-regels.nl/health/ready
# Should return: {"status":"UP"}

# Access admin console
# https://acc.keycloak.open-regels.nl/
# Username: admin
# Password: (from ~/keycloak-passwords.txt)
```

## Configuration

### Realm Configuration

1. Login to admin console: https://acc.keycloak.open-regels.nl/
2. Switch to 'ronl' realm
3. Configure CORS:
   - Clients → ronl-business-api → Settings
   - Valid Redirect URIs: `https://acc.mijn.open-regels.nl/*`
   - Web Origins: `+`
   - Save
4. Add audience mapper:
   - Clients → ronl-business-api → Client scopes
   - ronl-business-api-dedicated → Add mapper → Audience
   - Name: `aud-mapper`
   - Included Client Audience: `ronl-business-api`
   - Add to access token: ON
   - Save
5. Set user passwords:
   - Users → View all users
   - For each user: Credentials → Set password
   - Password: `Test123!`
   - Temporary: OFF

## Maintenance

### View Logs

```bash
cd ~/keycloak/acc

# All logs
docker compose logs

# Follow logs
docker compose logs -f keycloak-acc

# Last 50 lines
docker compose logs keycloak-acc --tail 50
```

### Restart Services

```bash
cd ~/keycloak/acc

# Restart Keycloak only
docker compose restart keycloak-acc

# Restart all services
docker compose restart

# Stop and start
docker compose down
docker compose up -d
```

### Update Keycloak

```bash
cd ~/keycloak/acc

# Pull new image
docker compose pull

# Recreate containers
docker compose up -d
```

### Backup

```bash
# Backup volumes
docker volume ls | grep keycloak-acc

# Export realm
# Admin Console → Realm settings → Partial export
# Or use Keycloak export command
```

## Troubleshooting

### Container Unhealthy

```bash
# Check logs for errors
docker compose logs keycloak-acc | grep -i error

# Check health endpoint from inside container
docker exec keycloak-acc bash -c 'timeout 1 bash -c "</dev/tcp/127.0.0.1/8080"'

# Restart if needed
docker compose restart keycloak-acc
```

### Realm Not Imported

```bash
# Check if realm file is mounted
docker exec keycloak-acc ls -la /opt/keycloak/data/import/

# If missing, check docker-compose.yml volume mount
# Restart after fixing
docker compose down -v
docker compose up -d
```

### Cannot Access Admin Console

1. Check Caddy is running: `docker ps | grep caddy`
2. Check network: `docker network inspect npm-network | grep keycloak-acc`
3. Test from VM: `curl http://localhost:8080` (should fail - not exposed)
4. Test through Caddy: `curl https://acc.keycloak.open-regels.nl/`

## URLs

- **Admin Console:** https://acc.keycloak.open-regels.nl/
- **Health Check:** https://acc.keycloak.open-regels.nl/health/ready
- **Realm:** https://acc.keycloak.open-regels.nl/realms/ronl
- **OIDC Config:** https://acc.keycloak.open-regels.nl/realms/ronl/.well-known/openid-configuration

## Environment Details

- **Hostname:** acc.keycloak.open-regels.nl
- **Mode:** Development (`start-dev`)
- **Log Level:** info
- **Database:** PostgreSQL 16 (Alpine)
- **Keycloak Version:** 23.0
- **Network:** npm-network (shared with Caddy)
