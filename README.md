# RONL Business API

> **This repository contains the source code for the RONL Business API.**
> Full documentation — architecture, deployment guides, API reference, user guides — is published at the [IOU Architecture documentation site](https://iou-architectuur.open-regels.nl/ronl-business-api/).

🌐 **Live application:** [mijn.open-regels.nl](https://mijn.open-regels.nl)
🧪 **Acceptance environment:** [acc.mijn.open-regels.nl](https://acc.mijn.open-regels.nl)

[![Deployed on Azure Web Apps](https://img.shields.io/badge/Azure-Web_Apps-blue?logo=microsoft-azure)](https://ronl.open-regels.nl)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61dafb?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff?logo=vite)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)](https://expressjs.com/)
[![Keycloak](https://img.shields.io/badge/Keycloak-23.0-4d4d4d?logo=keycloak)](https://www.keycloak.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io/)
[![Operaton](https://img.shields.io/badge/Operaton-BPMN%2FDMN-orange)](https://operaton.open-regels.nl)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
![License](https://img.shields.io/badge/License-EUPL--1.2-yellow.svg)

## What is the RONL Business API?

The **RONL Business API** is a secure, multi-tenant platform that enables Dutch municipalities to offer government digital services to residents. It implements the **Business API Layer** pattern: a security and business-logic layer that sits between a municipality's IAM system and the Operaton BPMN engine.

## What it does

Instead of exposing Operaton's REST API directly to municipality portals, RONL Business API provides:

- Secure OIDC/JWT token validation against Keycloak
- Multi-tenant isolation per municipality (Utrecht, Amsterdam, Rotterdam, Den Haag)
- Claims mapping from JWT to BPMN process variables
- Role-based authorization (citizen, caseworker, admin)
- Compliance-grade audit logging (BIO, NEN 7510, AVG/GDPR)
- A clean, versioned REST API (`/v1/*`) following the Dutch API Design Rules

## Architecture at a glance

```
Resident → Municipality Portal → Keycloak IAM → Business API → Operaton BPMN Engine
```

The system is hosted across two platforms. Azure hosts the stateless application layer (frontend, backend, PostgreSQL, Redis). A VM at `open-regels.nl` hosts the services requiring deep customisation or full control (Keycloak, Operaton, Caddy).

## Live environments

| Environment | Frontend                        | Backend                        | Keycloak                            |
| ----------- | ------------------------------- | ------------------------------ | ----------------------------------- |
| ACC         | https://acc.mijn.open-regels.nl | https://acc.api.open-regels.nl | https://acc.keycloak.open-regels.nl |
| Production  | https://mijn.open-regels.nl     | https://api.open-regels.nl     | https://keycloak.open-regels.nl     |

## Technology stack

| Layer            | Technology                                                    |
| ---------------- | ------------------------------------------------------------- |
| Frontend         | React 18, TypeScript, Vite, CSS Custom Properties             |
| Backend          | Node.js 20, Express 4, TypeScript                             |
| Authentication   | Keycloak 23, OIDC Authorization Code Flow                     |
| Business rules   | Operaton BPMN/DMN engine                                      |
| Database         | Azure PostgreSQL Flexible Server (audit logs)                 |
| Cache            | Azure Cache for Redis (JWKS, sessions)                        |
| Hosting          | Azure Static Web Apps (frontend), Azure App Service (backend) |
| IAM/BPMN hosting | VM — Caddy, Docker Compose                                    |
| CI/CD            | GitHub Actions                                                |
| License          | EUPL-1.2                                                      |

## Documentation

All documentation is published at **[iou-architectuur.open-regels.nl/ronl-business-api/](https://iou-architectuur.open-regels.nl/ronl-business-api/)**.

**Features**

- [Overview](https://iou-architectuur.open-regels.nl/ronl-business-api/features/overview/) — Business API Layer pattern and core responsibilities
- [Multi-Tenant Municipality Portal](https://iou-architectuur.open-regels.nl/ronl-business-api/features/multi-tenant-portal/) — Dynamic theming, tenant isolation, feature flags
- [Authentication & IAM](https://iou-architectuur.open-regels.nl/ronl-business-api/features/authentication-iam/) — Keycloak, DigiD flow, JWT structure
- [Business Rules Execution](https://iou-architectuur.open-regels.nl/ronl-business-api/features/business-rules-execution/) — BPMN/DMN via Operaton
- [Security & Compliance](https://iou-architectuur.open-regels.nl/ronl-business-api/features/security-compliance/) — BIO, NEN 7510, AVG/GDPR
- [API Design](https://iou-architectuur.open-regels.nl/ronl-business-api/features/api-design/) — Dutch API Design Rules, versioning

**User Guides**

- [Logging In (DigiD Flow)](https://iou-architectuur.open-regels.nl/ronl-business-api/user-guide/login-digid-flow/) — Step-by-step login, assurance levels
- [Submitting a Calculation](https://iou-architectuur.open-regels.nl/ronl-business-api/user-guide/submitting-calculation/) — Test scenarios with expected outcomes
- [Caseworker Workflow](https://iou-architectuur.open-regels.nl/ronl-business-api/user-guide/caseworker-workflow/)
- [Adding a Municipality](https://iou-architectuur.open-regels.nl/ronl-business-api/user-guide/adding-municipality/)

**Developer Docs**

- [Local Development Setup](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/local-development/) — Prerequisites, JWT token testing, database access, local service URLs
- [Backend Development](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/backend-development/)
- [Frontend Development](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/frontend-development/) — Calling the Business API from a component
- [Troubleshooting](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/troubleshooting/) — Port conflicts, health check failures, 500 errors
- [CI/CD](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/cicd/)
- [Deployment Overview](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/deployment/overview/) — VM troubleshooting, production security checklist
- [Keycloak (VM)](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/deployment/keycloak/)
- [Operaton (VM)](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/deployment/operaton/)
- [Backend (Azure App Service)](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/deployment/backend/)
- [Frontend (Azure Static Web Apps)](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/deployment/frontend/)
- [Caddy (Reverse Proxy)](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/deployment/caddy/) — Retrieving the Caddyfile from a running VM

**References**

- [API Endpoints](https://iou-architectuur.open-regels.nl/ronl-business-api/references/api-endpoints/)
- [Environment Variables](https://iou-architectuur.open-regels.nl/ronl-business-api/references/environment-variables/)
- [JWT Claims](https://iou-architectuur.open-regels.nl/ronl-business-api/references/jwt-claims/)
- [Keycloak Realm Configuration](https://iou-architectuur.open-regels.nl/ronl-business-api/references/keycloak-realm-configuration/)
- [Standards & Compliance](https://iou-architectuur.open-regels.nl/ronl-business-api/references/standards-compliance/)

## License

[EUPL-1.2](LICENSE)
