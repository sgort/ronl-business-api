# VM Deployment Guide

This directory contains configuration files for services running on the VM (open-regels.nl).

## Architecture

```
┌────────────────────────────────────────┐
│           AZURE CLOUD                  │
│                                        │
│  ┌─────────────────┐                   │
│  │  Static Web App │  ← Frontend       │
│  │  (ACC + PROD)   │                   │
│  └─────────────────┘                   │
│           ↓                            │
│  ┌─────────────────┐                   │
│  │   App Service   │  ← Backend        │
│  │  (ACC + PROD)   │                   │
│  └─────────────────┘                   │
│           ↓                            │
│  ┌─────────────────┐                   │
│  │   PostgreSQL    │  ← Audit Logs DB  │
│  │   Redis Cache   │                   │
│  └─────────────────┘                   │
└────────────────────────────────────────┘
                ↓ (JWT validation)
┌────────────────────────────────────────┐
│     VM (open-regels.nl)                │
│                                        │
│  ┌─────────────────┐                   │
│  │    Keycloak     │  ← IAM            │
│  │   (ACC + PROD)  │                   │
│  │   + PostgreSQL  │                   │
│  └─────────────────┘                   │
│                                        │
│  ┌─────────────────┐                   │
│  │    Operaton     │  ← Business Rules │
│  └─────────────────┘                   │
│                                        │
│  ┌─────────────────┐                   │
│  │      Caddy      │  ← Reverse Proxy  │
│  └─────────────────┘                   │
└────────────────────────────────────────┘
```

## Directory Structure

```
deployment/vm/
├── README.md                    # This file
├── keycloak/
│   ├── acc/
│   │   ├── docker-compose.yml   # ACC Keycloak config
│   │   ├── .env.example         # Environment template
│   │   └── README.md            # ACC setup guide
│   └── prod/
│       ├── docker-compose.yml   # PROD Keycloak config
│       ├── .env.example         # Environment template
│       └── README.md            # PROD setup guide
└── caddy/
    ├── Caddyfile                # Reverse proxy config (copy from VM)
    └── README.md                # Caddy setup guide
```

## Services on VM

### Keycloak (IAM)

- **ACC:** https://acc.keycloak.open-regels.nl
- **PROD:** https://keycloak.open-regels.nl
- **Purpose:** Authentication and authorization
- **Tech:** Keycloak 23.0 + PostgreSQL 16

### Operaton (Business Rules)

- **URL:** https://operaton.open-regels.nl
- **Purpose:** BPMN/DMN execution engine
- **Tech:** Operaton platform

### Caddy (Reverse Proxy)

- **Purpose:** SSL termination, routing
- **Tech:** Caddy 2

## Prerequisites

- Ubuntu VM with Docker installed
- SSH access to VM
- Domain: open-regels.nl with DNS configured
- Ports 80, 443 open

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/your-org/ronl-business-api.git
cd ronl-business-api
```

### 2. Deploy Keycloak ACC

Follow: [keycloak/acc/README.md](keycloak/acc/README.md)

```bash
# Copy files to VM
scp deployment/vm/keycloak/acc/docker-compose.yml user@vm:~/keycloak/acc/
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/acc/

# On VM: Create .env and start
ssh user@vm
cd ~/keycloak/acc
# ... follow ACC README
```

### 3. Deploy Keycloak PROD

Follow: [keycloak/prod/README.md](keycloak/prod/README.md)

```bash
# Copy files to VM
scp deployment/vm/keycloak/prod/docker-compose.yml user@vm:~/keycloak/prod/
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/prod/

# On VM: Create .env and start
ssh user@vm
cd ~/keycloak/prod
# ... follow PROD README
```

### 4. Configure Caddy

Follow: [caddy/README.md](caddy/README.md)

Ensure Caddy has entries for:

- acc.keycloak.open-regels.nl → keycloak-acc:8080
- keycloak.open-regels.nl → keycloak-prod:8080

## Files to Copy from VM

Some files need to be retrieved from your running VM and added to this repo:

```bash
# Caddyfile
ssh user@vm "docker exec caddy cat /etc/caddy/Caddyfile" > deployment/vm/caddy/Caddyfile
```

**Note:** Never commit sensitive files like `.env` or password files!

## Secrets Management

### .env Files

Each environment needs a `.env` file with secrets:

```bash
# Example: keycloak/acc/.env (on VM only, not in git!)
KEYCLOAK_ADMIN_PASSWORD=<secure-password>
```

Use `.env.example` as template.

### Password Storage

Store passwords securely:

- Use password manager (1Password, Bitwarden, etc.)
- On VM: Store in `~/keycloak-passwords.txt` with restricted permissions (`chmod 600`)
- Never commit passwords to git

## Monitoring

### Health Checks

```bash
# Check all services
curl https://acc.keycloak.open-regels.nl/health/ready
curl https://keycloak.open-regels.nl/health/ready
curl https://operaton.open-regels.nl/
```

### Container Status

```bash
# On VM
docker ps | grep -E "keycloak|operaton|caddy"

# All should show (healthy) or Up status
```

### View Logs

```bash
# On VM
cd ~/keycloak/acc
docker compose logs -f

cd ~/keycloak/prod
docker compose logs -f

docker logs -f caddy
docker logs -f operaton
```

## Backup Strategy

### Keycloak Data

```bash
# Database backup
docker exec keycloak-postgres-acc pg_dump -U keycloak keycloak > keycloak-acc-$(date +%Y%m%d).sql
docker exec keycloak-postgres-prod pg_dump -U keycloak keycloak > keycloak-prod-$(date +%Y%m%d).sql

# Volume backup
docker run --rm -v keycloak-acc-db-data:/data -v /backup:/backup alpine tar czf /backup/keycloak-acc-$(date +%Y%m%d).tar.gz /data
```

### Configuration Files

This git repository serves as backup for:

- docker-compose.yml files
- Caddyfile
- Realm configuration (ronl-realm.json)

### Backup Frequency

- **Daily:** Database dumps
- **Weekly:** Volume backups
- **On change:** Configuration files (via git)

## Disaster Recovery

### Restore Keycloak

```bash
# 1. Deploy fresh Keycloak (follow setup guides)
# 2. Stop Keycloak
docker compose stop keycloak-acc

# 3. Restore database
cat keycloak-acc-YYYYMMDD.sql | docker exec -i keycloak-postgres-acc psql -U keycloak keycloak

# 4. Start Keycloak
docker compose start keycloak-acc
```

### Full VM Recovery

If VM is lost:

1. Provision new VM
2. Install Docker
3. Clone this repository
4. Deploy services following README guides
5. Restore databases from backups
6. Update DNS if IP changed

## Maintenance

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

### Update Caddy

```bash
docker pull caddy:2-alpine
docker restart caddy
```

### Security Updates

```bash
# On VM
sudo apt update
sudo apt upgrade

# Reboot if kernel updated
sudo reboot
```

## Troubleshooting

### Service Not Accessible

1. Check container is running: `docker ps`
2. Check health: `curl http://localhost:8080` (from VM)
3. Check Caddy: `docker logs caddy | grep <service>`
4. Check DNS: `dig acc.keycloak.open-regels.nl`
5. Check firewall: `sudo ufw status`

### Container Unhealthy

```bash
# View logs
docker compose logs <service>

# Check resource usage
docker stats <service>

# Restart
docker compose restart <service>
```

### Database Connection Issues

```bash
# Check PostgreSQL
docker exec keycloak-postgres-acc pg_isready -U keycloak

# Check connectivity from Keycloak
docker exec keycloak-acc bash -c 'timeout 2 bash -c "</dev/tcp/keycloak-postgres-acc/5432"'
```

## Support

For issues specific to:

- **Keycloak ACC:** See [keycloak/acc/README.md](keycloak/acc/README.md)
- **Keycloak PROD:** See [keycloak/prod/README.md](keycloak/prod/README.md)
- **Caddy:** See [caddy/README.md](caddy/README.md)
- **Operaton:** Check Operaton documentation

## Security Considerations

- ✅ All services behind Caddy with SSL
- ✅ No services exposed directly to internet
- ✅ Strong passwords for all admin accounts
- ✅ Regular security updates
- ✅ Firewall configured (ufw)
- ⚠️ Consider enabling MFA for Keycloak admin
- ⚠️ Consider using production mode (`start`) for PROD Keycloak
- ⚠️ Monitor access logs regularly

## Cost Savings

By hosting Keycloak on VM instead of Azure:

- **Savings:** ~€150-280/month
- **Benefits:** Full control, no vendor lock-in, easier customization

## Documentation

- Main README: `/README.md`
- Architecture: `/docs/ARCHITECTURE.md`
- API Documentation: `/docs/API.md`
- Keycloak Setup: `/docs/KEYCLOAK.md`
