# RONL Business API

> **R**egels **O**verheid **N**eder**l**and - A BPMN-based business rules execution platform for Dutch municipalities

RONL Business API provides a secure, multi-tenant platform for Dutch municipalities to execute government business rules (like zorgtoeslag/care allowance calculations) through BPMN workflows. The system integrates DigiD-compatible authentication with the Operaton BPMN engine, offering compliance-grade audit logging and tenant isolation.

## 🎯 What is RONL Business API?

RONL implements the **Business API Layer** pattern for government digital services:

```
Resident → Municipality Portal → Keycloak IAM → Business API → Operaton BPMN Engine
```

Instead of exposing BPMN engines directly, RONL provides:

- ✅ Secure token validation (OIDC/JWT)
- ✅ Multi-tenant isolation (Utrecht, Amsterdam, Rotterdam, Den Haag)
- ✅ Claims mapping (roles, mandates, assurance levels)
- ✅ Audit logging for compliance (BIO, NEN 7510, AVG/GDPR)
- ✅ Simplified REST API for municipalities

See [Architecture Overview](docs/architecture/overview.md) for detailed explanation.

## 🏗️ Architecture

### High-Level Architecture

```
┌────────────────────────────────────────┐
│           Azure Cloud                  │
│                                        │
│  ┌─────────────────┐                   │
│  │  Static Web App │  ← Frontend       │
│  │  (ACC + PROD)   │     Multi-tenant  │
│  └─────────────────┘                   │
│           ↓                            │
│  ┌─────────────────┐                   │
│  │   App Service   │  ← Backend API    │
│  │  (ACC + PROD)   │     Node.js       │
│  └─────────────────┘                   │
│           ↓                            │
│  ┌─────────────────┐                   │
│  │   PostgreSQL    │  ← Audit Logs     │
│  │   Redis Cache   │                   │
│  └─────────────────┘                   │
└────────────────────────────────────────┘
                ↓ (JWT validation)
┌────────────────────────────────────────┐
│     VM (open-regels.nl)                │
│                                        │
│  ┌─────────────────┐                   │
│  │    Keycloak     │  ← IAM            │
│  │   (ACC + PROD)  │     Federation    │
│  │   + PostgreSQL  │                   │
│  └─────────────────┘                   │
│                                        │
│  ┌─────────────────┐                   │
│  │    Operaton     │  ← BPMN/DMN       │
│  │                 │     Engine        │
│  └─────────────────┘                   │
│                                        │
│  ┌─────────────────┐                   │
│  │      Caddy      │  ← Reverse Proxy  │
│  └─────────────────┘                   │
└────────────────────────────────────────┘
```

### Why Split Architecture?

**VM (Full Control):**

- Keycloak: Requires deep customization for government compliance
- Operaton: Business rules engine with frequent updates
- Cost: ~€30/month total

**Azure (Managed):**

- Frontend: Static Web Apps with CDN
- Backend: Auto-scaling App Service
- Database: Managed PostgreSQL with backups

**Benefits:**

- ✅ ~€150-280/month cost savings (moved Keycloak from Azure to VM)
- ✅ Full control over authentication layer
- ✅ Managed services for application layer
- ✅ Best of both worlds

See [Deployment Architecture](docs/architecture/deployment.md) for details.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Azure CLI (for deployment)
- Access to VM (for Keycloak deployment)

### Local Development

```bash
# Clone repository
git clone https://github.com/your-org/ronl-business-api.git
cd ronl-business-api

# Install dependencies
npm install

# Setup environment
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env

# Start development servers
npm run dev:backend   # Backend on http://localhost:3001
npm run dev:frontend  # Frontend on http://localhost:5173
```

See [Development Guide](docs/development/) for detailed setup.

## 📦 Project Structure

```
ronl-business-api/
├── packages/
│   ├── frontend/          # React SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   ├── hooks/
│   │   │   └── themes/    # Multi-tenant theming
│   │   └── package.json
│   └── backend/           # Node.js Express API
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/
│       │   └── services/
│       └── package.json
├── config/
│   ├── keycloak/
│   │   └── ronl-realm.json
│   └── postgres/
│       └── init-databases.sql
├── deployment/
│   └── vm/
│       ├── keycloak/
│       │   ├── acc/
│       │   └── prod/
│       └── caddy/
├── docs/                  # Documentation (MkDocs)
└── package.json           # Monorepo root
```

## 🌐 Environments

### ACC (Acceptance)

- Frontend: https://acc.mijn.open-regels.nl
- Backend: https://acc.api.open-regels.nl
- Keycloak: https://acc.keycloak.open-regels.nl

### PROD (Production)

- Frontend: https://mijn.open-regels.nl
- Backend: https://api.open-regels.nl
- Keycloak: https://keycloak.open-regels.nl

## 📚 Documentation

### For Developers

- [Architecture Overview](docs/architecture/overview.md) - Business API layer concept
- [Frontend Development](docs/development/frontend.md) - React, theming, multi-tenancy
- [Backend Development](docs/development/backend.md) - API routes, authentication, Operaton integration
- [Multi-Tenant Theming](docs/development/theming.md) - Dynamic branding system

### For DevOps

- [Deployment Overview](docs/deployment/overview.md) - Complete deployment guide
- [Keycloak Deployment](docs/deployment/keycloak.md) - VM-based IAM setup
- [Frontend Deployment](docs/deployment/frontend.md) - Azure Static Web Apps
- [Backend Deployment](docs/deployment/backend.md) - Azure App Service

### Architecture

- [Deployment Architecture](docs/architecture/deployment.md) - VM vs Azure split
- [Security & Authentication](docs/architecture/security.md) - JWT flow, OIDC, compliance

## 🏛️ Supported Municipalities

Currently configured for:

- **Utrecht** (Gemeente Utrecht)
- **Amsterdam** (Gemeente Amsterdam)
- **Rotterdam** (Gemeente Rotterdam)
- **Den Haag** (Gemeente Den Haag)

Each municipality has:

- Own branding (colors, logos)
- Own user roles (citizens, caseworkers)
- Isolated tenant data
- Dedicated audit logging

See [Multi-Tenant Theming](docs/development/theming.md) for adding municipalities.

## 🔐 Authentication & Authorization

### Authentication Flow

1. User visits municipality portal (e.g., https://mijn.open-regels.nl)
2. Clicks login → Redirected to Keycloak
3. Keycloak authenticates (simulates DigiD/eIDAS/eHerkenning)
4. Issues JWT with claims: `sub`, `municipality`, `roles`, `loa`
5. Frontend stores token, includes in API calls
6. Backend validates JWT, maps claims to process variables
7. Calls Operaton BPMN engine with user context

### Roles & Permissions

- **Citizens** (`citizen`): Start processes, view own applications
- **Caseworkers** (`caseworker`): Process applications, view queue
- **Administrators** (`admin`): Manage users, view audit logs

See [Security Architecture](docs/architecture/security.md) for details.

## 🔧 Technology Stack

### Frontend

- **Framework:** React 18 + TypeScript
- **Build:** Vite
- **Routing:** React Router
- **State:** Context API
- **Styling:** CSS Modules + CSS Custom Properties
- **HTTP:** Axios
- **Auth:** OIDC Client

### Backend

- **Runtime:** Node.js 18+
- **Framework:** Express
- **Auth:** jsonwebtoken, jwks-rsa
- **Database:** PostgreSQL (Azure)
- **Cache:** Redis (Azure)
- **HTTP Client:** Axios (Operaton API)
- **Validation:** Zod

### Infrastructure

- **IAM:** Keycloak 23.0 (VM)
- **BPMN Engine:** Operaton (VM)
- **Reverse Proxy:** Caddy 2 (VM)
- **Frontend Hosting:** Azure Static Web Apps
- **Backend Hosting:** Azure App Service
- **Database:** Azure PostgreSQL Flexible Server
- **Cache:** Azure Cache for Redis
- **CI/CD:** GitHub Actions

## 🧪 Testing

```bash
# Run all tests
npm test

# Backend tests
npm run test:backend

# Frontend tests
npm run test:frontend

# E2E tests (Playwright)
npm run test:e2e
```

## 🚀 Deployment

### Deploy Backend

```bash
cd packages/backend
npm run deploy:acc   # Deploy to ACC
npm run deploy:prod  # Deploy to PROD
```

### Deploy Frontend

```bash
cd packages/frontend
npm run deploy:acc   # Deploy to ACC
npm run deploy:prod  # Deploy to PROD
```

### Deploy Keycloak

See [Keycloak Deployment Guide](docs/deployment/keycloak.md)

## 📊 Monitoring & Logging

- **Backend Logs:** Azure App Service logs
- **Audit Logs:** PostgreSQL audit tables
- **Authentication Events:** Keycloak admin console
- **BPMN Execution:** Operaton Cockpit (https://operaton.open-regels.nl)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Operaton Platform** - BPMN/DMN execution engine
- **Keycloak** - Identity and Access Management
- **Dutch Municipalities** - For collaboration and requirements

## 📞 Support

- **Documentation:** See [docs/](docs/)
- **Issues:** GitHub Issues
- **Contact:** [your-contact@ictu.nl](mailto:your-contact@ictu.nl)

---

**Made with ❤️ for Dutch municipalities**
