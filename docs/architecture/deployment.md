# Deployment Architecture

## Overview

RONL Business API uses a **hybrid architecture** splitting services between a dedicated VM and Azure cloud services. This design balances cost, control, and managed services.

## Architecture Decision: VM + Azure

### The Split

```
┌─────────────────────────────────────────┐
│  VM (open-regels.nl) - Full Control     │
│  ├── Keycloak (IAM)                     │
│  ├── Operaton (BPMN Engine)             │
│  ├── Caddy (Reverse Proxy)              │
│  └── PostgreSQL (Keycloak DB)           │
│  Cost: ~€30/month                       │
└─────────────────────────────────────────┘
                 ↕ HTTPS/JWT
┌─────────────────────────────────────────┐
│  Azure Cloud - Managed Services         │
│  ├── Static Web Apps (Frontend)         │
│  ├── App Service (Backend API)          │
│  ├── PostgreSQL (Audit Logs)            │
│  └── Redis (Cache)                      │
│  Cost: ~€100-200/month                  │
└─────────────────────────────────────────┘
```

### Why This Split?

#### VM-Hosted Components (Full Control)

**Keycloak**

- ✅ **Deep Customization**: Government-specific auth flows
- ✅ **Cost**: Free software, only infrastructure cost (~€15/month)
- ✅ **Compliance**: Full audit control
- ✅ **Flexibility**: Can integrate with real DigiD/eIDAS
- ✅ **No Vendor Lock-in**: Can move anywhere
- ❌ **Maintenance**: We manage updates

**Operaton**

- ✅ **Direct Control**: BPMN/DMN engine management
- ✅ **Cost**: Free software (~€15/month infrastructure)
- ✅ **Versioning**: Control update schedule
- ✅ **Debugging**: Direct access to engine logs
- ❌ **Scaling**: Manual clustering if needed

**Why not Azure for these?**

- Azure Container Apps for Keycloak: **€50-100/month per environment**
- Azure Container Apps for Operaton: **€50-100/month per environment**
- **Total Azure cost**: €200-400/month
- **VM cost**: €30/month
- **Savings**: €170-370/month 💰

#### Azure-Hosted Components (Managed Services)

**Frontend (Static Web Apps)**

- ✅ **CDN**: Global content delivery
- ✅ **Auto-scaling**: Handles traffic spikes
- ✅ **CI/CD**: GitHub Actions integration
- ✅ **SSL**: Automatic certificate management
- ✅ **Custom Domains**: Per municipality

**Backend (App Service)**

- ✅ **Auto-scaling**: Based on load
- ✅ **Monitoring**: Azure Monitor integration
- ✅ **Deployment Slots**: Zero-downtime deploys
- ✅ **Managed Updates**: Automatic OS patching
- ✅ **Backup**: Automated backups

**PostgreSQL (Flexible Server)**

- ✅ **Backups**: Automated daily backups
- ✅ **HA**: High availability options
- ✅ **Scaling**: Vertical and horizontal
- ✅ **Monitoring**: Built-in metrics
- ✅ **Security**: Managed TLS, firewall

**Redis (Cache for Redis)**

- ✅ **Performance**: In-memory cache
- ✅ **HA**: Redis cluster
- ✅ **Persistence**: Automatic snapshots
- ✅ **Scaling**: Seamless tier upgrades

**Why Azure for these?**

- Managed services reduce operational overhead
- Better for application layer (frontend/backend)
- Azure excels at auto-scaling web apps
- Cost-effective for variable load

## Cost Analysis

### Before Migration (All Azure)

| Service                       | Cost/Month         |
| ----------------------------- | ------------------ |
| Keycloak ACC (Container App)  | €50-80             |
| Keycloak PROD (Container App) | €50-80             |
| Operaton (Container App)      | €50-80             |
| Frontend (Static Web App)     | €10-20             |
| Backend (App Service)         | €50-100            |
| PostgreSQL                    | €30-50             |
| Redis                         | €20-30             |
| **Total**                     | **€260-440/month** |

### After Migration (VM + Azure)

| Service                      | Cost/Month         |
| ---------------------------- | ------------------ |
| **VM (Keycloak + Operaton)** | **€30**            |
| Frontend (Static Web App)    | €10-20             |
| Backend (App Service)        | €50-100            |
| PostgreSQL                   | €30-50             |
| Redis                        | €20-30             |
| **Total**                    | **€140-230/month** |

**Monthly Savings: €120-210** 💰

## Network Architecture

### Domain Structure

```
open-regels.nl (VM)
├── keycloak.open-regels.nl          # PROD Keycloak
├── acc.keycloak.open-regels.nl      # ACC Keycloak
└── operaton.open-regels.nl          # Operaton Cockpit

mijn.open-regels.nl (Azure)
├── mijn.open-regels.nl              # PROD Frontend
├── acc.mijn.open-regels.nl          # ACC Frontend
├── api.open-regels.nl               # PROD Backend
└── acc.api.open-regels.nl           # ACC Backend
```

### Traffic Flow

```
User (Browser)
    ↓ HTTPS
Azure Static Web App (Frontend)
    ↓ OIDC Redirect
VM Keycloak (IAM)
    ↓ JWT Token
Azure Static Web App (stores token)
    ↓ API Call + Bearer Token
Azure App Service (Backend)
    ↓ Validates JWT
    ↓ Calls Operaton API
VM Operaton (BPMN Engine)
```

### SSL/TLS

**VM (Caddy)**

- Automatic Let's Encrypt certificates
- Wildcard cert for \*.open-regels.nl
- Auto-renewal every 60 days
- HTTPS-only, redirect HTTP → HTTPS

**Azure**

- Managed certificates for Static Web Apps
- Managed certificates for App Service
- Azure handles renewal

## Environments

### ACC (Acceptance)

| Component | URL                                 | Location             |
| --------- | ----------------------------------- | -------------------- |
| Frontend  | https://acc.mijn.open-regels.nl     | Azure Static Web App |
| Backend   | https://acc.api.open-regels.nl      | Azure App Service    |
| Keycloak  | https://acc.keycloak.open-regels.nl | VM                   |
| Operaton  | https://operaton.open-regels.nl     | VM                   |

### PROD (Production)

| Component | URL                             | Location             |
| --------- | ------------------------------- | -------------------- |
| Frontend  | https://mijn.open-regels.nl     | Azure Static Web App |
| Backend   | https://api.open-regels.nl      | Azure App Service    |
| Keycloak  | https://keycloak.open-regels.nl | VM                   |
| Operaton  | https://operaton.open-regels.nl | VM (shared with ACC) |

**Note**: Operaton is shared between ACC and PROD, but uses different process definition versions.

## VM Details

### Specifications

- **Provider**: Your hosting provider
- **OS**: Ubuntu 24.04 LTS
- **RAM**: 4-8 GB
- **CPU**: 2-4 cores
- **Storage**: 50-100 GB SSD
- **Network**: 1 Gbps
- **IPv4**: Public IP
- **Cost**: ~€30/month

### Services on VM

```
VM (open-regels.nl)
├── Docker Engine
│   ├── Keycloak ACC (Container)
│   │   └── PostgreSQL ACC (Container)
│   ├── Keycloak PROD (Container)
│   │   └── PostgreSQL PROD (Container)
│   ├── Operaton (Container)
│   └── Caddy (Container)
└── npm-network (Docker Network)
```

### Docker Compose Structure

```
~/keycloak/
├── acc/
│   ├── docker-compose.yml
│   ├── .env (secrets)
│   └── ronl-realm.json
└── prod/
    ├── docker-compose.yml
    ├── .env (secrets)
    └── ronl-realm.json
```

See [Keycloak Deployment Guide](../deployment/keycloak.md) for details.

### Reverse Proxy (Caddy)

**Caddyfile:**

```
acc.keycloak.open-regels.nl {
    reverse_proxy keycloak-acc:8080
}

keycloak.open-regels.nl {
    reverse_proxy keycloak-prod:8080
}

operaton.open-regels.nl {
    reverse_proxy operaton:8080
}
```

Caddy handles:

- SSL termination
- Let's Encrypt certificates
- HTTP → HTTPS redirect
- Reverse proxy to containers

## Azure Resource Groups

### ACC Environment

```
rg-ronl-acc
├── ronl-frontend-acc (Static Web App)
├── ronl-business-api-acc (App Service)
├── ronl-postgres-acc (PostgreSQL Flexible Server)
└── ronl-redis-acc (Cache for Redis)
```

### PROD Environment

```
rg-ronl-prod
├── ronl-frontend-prod (Static Web App)
├── ronl-business-api-prod (App Service)
├── ronl-postgres-prod (PostgreSQL Flexible Server)
└── ronl-redis-prod (Cache for Redis)
```

## Security Boundaries

### Network Isolation

**VM**:

- Firewall: Only ports 80, 443, 22 open
- Docker network isolation
- Containers communicate via Docker network
- No direct database access from internet

**Azure**:

- Virtual Network (VNet) isolation
- App Service: VNet integration
- PostgreSQL: Private endpoint
- Redis: VNet injection
- Firewall rules per service

### Authentication Flow

1. User accesses Azure frontend
2. Frontend redirects to VM Keycloak
3. Keycloak authenticates user
4. Issues JWT token (signed by VM Keycloak)
5. User returns to Azure frontend with token
6. Frontend calls Azure backend with JWT
7. Backend validates JWT against VM Keycloak JWKS endpoint
8. Backend calls VM Operaton with validated context

**Key Point**: Azure never stores user credentials, only validates JWTs.

## High Availability

### VM Services

**Current**:

- Single VM instance
- Docker restart policies (always restart)
- Caddy auto-restarts on failure
- Keycloak/Operaton restart on failure

**Future HA Options**:

- Load balancer + 2 VMs
- Keycloak clustering
- Operaton clustering
- Shared PostgreSQL database

### Azure Services

**Current**:

- Single instance per service
- Azure manages availability
- App Service: 99.95% SLA
- Static Web Apps: 99.95% SLA
- PostgreSQL: 99.99% SLA (with HA)

**Scaling**:

- Frontend: Auto-scales (CDN)
- Backend: Manual or auto-scale rules
- Database: Vertical scaling (CPU/RAM)
- Redis: Vertical scaling (memory)

## Backup Strategy

### VM

**Keycloak Database**:

```bash
# Daily backup
docker exec keycloak-postgres-prod pg_dump -U keycloak keycloak \
  > /backup/keycloak-prod-$(date +%Y%m%d).sql
```

**Configuration**:

- docker-compose.yml (in git)
- ronl-realm.json (in git)
- .env files (secure backup, not in git)

**Volumes**:

```bash
# Weekly backup
docker volume export keycloak-prod-db-data \
  > /backup/keycloak-prod-db-$(date +%Y%m%d).tar
```

### Azure

**PostgreSQL**:

- Automated daily backups (7-day retention)
- Point-in-time restore
- Long-term backup to Azure Backup (optional)

**Static Web App**:

- Code in git (primary backup)
- Deployment history (rollback capability)

**App Service**:

- Code in git (primary backup)
- Deployment slots (blue/green)

## Disaster Recovery

### VM Total Failure

**Recovery Steps**:

1. Provision new VM
2. Install Docker
3. Clone git repository
4. Deploy Keycloak from `deployment/vm/keycloak/`
5. Restore database from backup
6. Update DNS (if IP changed)
7. Verify services

**RTO**: 2-4 hours  
**RPO**: Last backup (24 hours max)

### Azure Region Failure

**Recovery Steps**:

1. Deploy to different Azure region
2. Update DNS
3. Restore PostgreSQL from backup
4. Deploy frontend/backend

**RTO**: 1-2 hours (if multi-region setup)  
**RPO**: Near-zero (continuous replication)

## Monitoring

### VM Monitoring

**Docker Stats**:

```bash
docker stats --no-stream
```

**Service Health**:

```bash
curl https://acc.keycloak.open-regels.nl/health/ready
curl https://keycloak.open-regels.nl/health/ready
curl https://operaton.open-regels.nl/
```

**Logs**:

```bash
docker logs keycloak-acc -f
docker logs keycloak-prod -f
docker logs operaton -f
docker logs caddy -f
```

### Azure Monitoring

**Azure Monitor**:

- App Service metrics
- PostgreSQL metrics
- Redis metrics
- Custom metrics

**Application Insights**:

- Backend API traces
- Performance metrics
- Error tracking
- User analytics

## Migration History

### Phase 1: All Azure (Initial)

- All services in Azure
- High cost: €260-440/month
- Easy management, high operational cost

### Phase 2: Keycloak to VM (Completed)

- Moved Keycloak to VM
- Savings: €100-160/month
- Increased control, reduced cost

### Phase 3: Operaton to VM (Completed)

- Moved Operaton to VM
- Additional savings: €50-80/month
- Total savings: €150-240/month

### Future: Potential Optimizations

- Move backend to VM (save €50-100/month)
- Keep frontend on Azure (CDN benefits)
- Total possible savings: €200-340/month

## Decision Matrix: When to Use VM vs Azure

| Factor                      | Use VM | Use Azure |
| --------------------------- | ------ | --------- |
| **Need deep customization** | ✅     | ❌        |
| **Cost-sensitive**          | ✅     | ❌        |
| **Full control required**   | ✅     | ❌        |
| **Need auto-scaling**       | ❌     | ✅        |
| **Want managed updates**    | ❌     | ✅        |
| **CDN required**            | ❌     | ✅        |
| **Quick deployment**        | ❌     | ✅        |
| **Compliance audit**        | ✅     | ✅        |
| **High availability**       | ⚠️     | ✅        |
| **Developer-friendly**      | ⚠️     | ✅        |

## Next Steps

- [Keycloak Deployment](../deployment/keycloak.md) - Deploy Keycloak to VM
- [Backend Deployment](../deployment/backend.md) - Deploy to Azure App Service
- [Frontend Deployment](../deployment/frontend.md) - Deploy to Azure Static Web Apps
- [Security Architecture](security.md) - Authentication flows

---

**The hybrid architecture gives us the best of both worlds: control where we need it, managed services where they make sense.** 🏗️
