# RONL Business API - Monorepo

> Secure, multi-tenant Business API for Dutch municipality BPMN/DMN services

**Complete Solution:** Municipality Portal + Business API + Shared Types

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build shared types
npm run build --workspace=@ronl/shared

# 3. Start Docker services
npm run docker:up

# 4. Start development
npm run dev

# Backend: http://localhost:3002
# Frontend: http://localhost:5173
# Keycloak: http://localhost:8080
```

---

## 📦 Monorepo Structure

```
ronl-business-api/
├── packages/
│   ├── frontend/          # Municipality Portal (React)
│   ├── backend/           # Business API (Node.js/Express)
│   └── shared/            # Shared TypeScript types
├── config/                # Keycloak & PostgreSQL config
├── docs/                  # Documentation
├── docker-compose.yml     # Local dev stack
└── package.json           # Workspace root
```

---

## 📚 Documentation

- **[Migration Guide](./MONOREPO_MIGRATION.md)** - Complete restructuring guide
- **[Frontend README](./packages/frontend/README.md)** - Municipality Portal
- **[Backend Setup](./packages/backend/SETUP.md)** - Business API

---

## 🎯 Key Features

✅ **Type-Safe Monorepo** - Shared types prevent drift  
✅ **Multi-Tenant API** - Municipality isolation  
✅ **Keycloak Auth** - DigiD/eIDAS ready  
✅ **DMN Evaluation** - Operaton integration  
✅ **Audit Logging** - Compliance-grade

---

See full documentation in each package's README.
