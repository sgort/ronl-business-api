# VM Deployment Configuration

This directory contains configuration files for services deployed on the VM (open-regels.nl).

## 📚 Documentation

**For deployment instructions, see:**

- [Keycloak Deployment Guide](../../docs/deployment/keycloak.md) - Complete ACC + PROD setup
- [VM Overview](../../docs/deployment/vm-overview.md) - General VM deployment info
- [Caddy Configuration](../../docs/deployment/caddy.md) - Reverse proxy setup

## 📂 Directory Structure

```
deployment/vm/
├── keycloak/
│   ├── acc/
│   │   ├── docker-compose.yml          # ACC Keycloak configuration
│   │   └── .env.example                # Environment template
│   └── prod/
│       ├── docker-compose.yml          # PROD Keycloak configuration
│       └── .env.example                # Environment template
└── caddy/
    └── Caddyfile                       # Reverse proxy configuration
```

## 🚀 Quick Deployment

```bash
# 1. Copy files to VM
scp deployment/vm/keycloak/acc/docker-compose.yml user@vm:~/keycloak/acc/
scp config/keycloak/ronl-realm.json user@vm:~/keycloak/acc/

# 2. Follow complete guide
# See: docs/deployment/keycloak.md
```

## ⚠️ Important

**Never commit these files:**

- `.env` files (contain secrets)
- `keycloak-passwords*.txt` (contain admin passwords)
- Backup files (`.sql`, `.tar.gz`)

**Configuration is version controlled here, documentation is in `docs/`**

## 📖 Related Documentation

- [Architecture Overview](../../docs/architecture/overview.md) - Understand the Business API Layer
- [Deployment Architecture](../../docs/architecture/deployment.md) - Why VM + Azure split
- [Security Architecture](../../docs/architecture/security.md) - Authentication flow
