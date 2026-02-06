# Keycloak PROD Deployment

Keycloak production environment running on VM.

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
ssh user@vm "mkdir -p ~/keycloak/prod"

# Copy docker-compose.yml
scp deployment/vm/keycloak/prod/docker-compose.yml user@vm:~/keycloak/prod/

# Copy realm file
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/prod/
```

### 2. Create Environment File

```bash
# On VM
cd ~/keycloak/prod

# Generate secure password (DIFFERENT from ACC!)
ADMIN_PW=$(openssl rand -base64 32)

# Create .env file
cat > .env << EOF
KEYCLOAK_ADMIN_PASSWORD=$ADMIN_PW
EOF

chmod 600 .env

# Save password securely
echo "PROD Admin: $ADMIN_PW" >> ~/keycloak-passwords.txt
chmod 600 ~/keycloak-passwords.txt
```

### 3. Start Keycloak

```bash
cd ~/keycloak/prod

# Start services
docker compose up -d

# Watch logs
docker compose logs -f keycloak-prod

# Wait for: "Keycloak started" and "Realm 'ronl' imported"
# Note: May take 2-3 minutes on first start
```

### 4. Verify Deployment

```bash
# Check container status
docker ps | grep keycloak-prod
# Should show: (healthy)

# Test health endpoint
curl https://keycloak.open-regels.nl/health/ready
# Should return: {"status":"UP"}

# Access admin console
# https://keycloak.open-regels.nl/
# Username: admin
# Password: (from ~/keycloak-passwords.txt)
```

## Configuration

### Realm Configuration

1. Login to admin console: https://keycloak.open-regels.nl/
2. Switch to 'ronl' realm
3. Configure CORS:
   - Clients → ronl-business-api → Settings
   - Valid Redirect URIs: `https://mijn.open-regels.nl/*`
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
   - Password: Use secure production passwords!
   - Temporary: OFF

## Production Considerations

### Security

- ✅ Use strong, unique passwords
- ✅ Enable MFA for admin account
- ✅ Regularly update Keycloak
- ✅ Monitor logs for suspicious activity
- ✅ Backup regularly
- ⚠️ Currently using `start-dev` - consider switching to `start` for production optimization

### Monitoring

```bash
# Watch logs for errors
docker compose logs -f keycloak-prod | grep -i error

# Monitor resource usage
docker stats keycloak-prod keycloak-postgres-prod

# Check health regularly
curl https://keycloak.open-regels.nl/health/ready
```

### Backups

```bash
# Backup database
docker exec keycloak-postgres-prod pg_dump -U keycloak keycloak > keycloak-prod-backup-$(date +%Y%m%d).sql

# Backup realm configuration
# Admin Console → Realm settings → Partial export

# Backup volumes
docker run --rm -v keycloak-prod-db-data:/data -v $(pwd):/backup alpine tar czf /backup/keycloak-prod-db-backup-$(date +%Y%m%d).tar.gz /data
docker run --rm -v keycloak-prod-data:/data -v $(pwd):/backup alpine tar czf /backup/keycloak-prod-data-backup-$(date +%Y%m%d).tar.gz /data
```

## Maintenance

### View Logs

```bash
cd ~/keycloak/prod

# All logs
docker compose logs

# Follow logs
docker compose logs -f keycloak-prod

# Last 100 lines
docker compose logs keycloak-prod --tail 100
```

### Restart Services

```bash
cd ~/keycloak/prod

# Restart Keycloak only
docker compose restart keycloak-prod

# Restart all services
docker compose restart

# Stop and start
docker compose down
docker compose up -d
```

### Update Keycloak

```bash
cd ~/keycloak/prod

# Backup first!
docker exec keycloak-postgres-prod pg_dump -U keycloak keycloak > keycloak-backup-$(date +%Y%m%d).sql

# Pull new image
docker compose pull

# Recreate containers
docker compose up -d

# Watch logs for issues
docker compose logs -f keycloak-prod
```

### Switch to Production Mode

To use optimized `start` command instead of `start-dev`:

```bash
cd ~/keycloak/prod

# Edit docker-compose.yml
# Change: - start-dev
# To:     - start

# Restart
docker compose down
docker compose up -d

# Note: First start will take 3-5 minutes for optimization
```

## Troubleshooting

### Container Unhealthy

```bash
# Check logs for errors
docker compose logs keycloak-prod | grep -i error

# Check health endpoint from inside container
docker exec keycloak-prod bash -c 'timeout 1 bash -c "</dev/tcp/127.0.0.1/8080"'

# Restart if needed
docker compose restart keycloak-prod
```

### Startup Takes Too Long

If using `start` command (production mode):

- First startup: 3-5 minutes (normal)
- Subsequent startups: 60-90 seconds

If startup hangs:

1. Check database connectivity
2. Verify realm file is mounted
3. Check disk space: `df -h`
4. Consider switching to `start-dev` temporarily

### Cannot Access Admin Console

1. Check Caddy is running: `docker ps | grep caddy`
2. Check network: `docker network inspect npm-network | grep keycloak-prod`
3. Test through Caddy: `curl https://keycloak.open-regels.nl/`
4. Check Caddyfile has `keycloak.open-regels.nl` configuration

## URLs

- **Admin Console:** https://keycloak.open-regels.nl/
- **Health Check:** https://keycloak.open-regels.nl/health/ready
- **Realm:** https://keycloak.open-regels.nl/realms/ronl
- **OIDC Config:** https://keycloak.open-regels.nl/realms/ronl/.well-known/openid-configuration

## Environment Details

- **Hostname:** keycloak.open-regels.nl
- **Mode:** Development (`start-dev`) - can switch to `start` for production
- **Log Level:** warn
- **Database:** PostgreSQL 16 (Alpine)
- **Keycloak Version:** 23.0
- **Network:** npm-network (shared with Caddy)

## Production Checklist

Before going live:

- [ ] Strong admin password set
- [ ] MFA enabled for admin
- [ ] All test users have strong passwords
- [ ] Backups configured
- [ ] Monitoring in place
- [ ] Firewall rules configured
- [ ] SSL certificates valid
- [ ] Consider switching to `start` command
