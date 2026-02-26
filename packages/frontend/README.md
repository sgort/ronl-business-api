# RONL Municipality Portal (MijnOmgeving)

> Simple React frontend demonstrating the complete RONL Business API architecture

> For full frontend developer documentation — component API calls, theming, adding pages, and feature flags — see [Frontend Development](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/frontend-development/) on the IOU Architecture docs site.

**Municipality Portal** → **Keycloak** → **Business API** → **Operaton**

---

## 🎯 What This Demonstrates

This frontend implements the complete RONL Business API architecture — see [Features overview](https://iou-architectuur.open-regels.nl/ronl-business-api/features/overview/) for a full description.

```
Resident (You in browser)
    ↓ Login
Municipality Frontend (This app)
    ↓ Keycloak JS Adapter
Keycloak IAM (DigiD simulation)
    ↓ JWT Token
Business API (Secure layer)
    ↓ Authenticated REST
Operaton BPMN Engine (DMN evaluation)
```

---

## ✨ Features

- ✅ **Keycloak Authentication** - Automatic login with test users
- ✅ **JWT Token Management** - Handled by Keycloak JS adapter
- ✅ **DMN Evaluation** - Zorgtoeslag (healthcare allowance) calculator
- ✅ **Municipality Context** - Shows user's municipality (Utrecht)
- ✅ **Assurance Level** - Displays DigiD LoA (hoog/basis/midden)
- ✅ **API Health Check** - Real-time status of all services
- ✅ **Results Visualization** - Pretty display of DMN results

---

## 🚀 Quick Start

### Prerequisites

Make sure these are running:

- ✅ Keycloak: http://localhost:8080
- ✅ Business API: http://localhost:3002
- ✅ Operaton: https://operaton.open-regels.nl

### 1. Install Dependencies

```bash
cd ronl-municipality-portal
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

### 3. Open Browser

```
http://localhost:5173
```

You'll be automatically redirected to Keycloak login.

### 4. Login

Use one of the test users:

**Citizen (Utrecht)**

- Username: `test-citizen-utrecht`
- Password: `test123`

**Caseworker (Utrecht)**

- Username: `test-caseworker-utrecht`
- Password: `test123`

### 5. Test DMN Evaluation

The form is pre-filled with example data:

- Check/uncheck requirements
- Adjust income value
- Click "Berekenen" (Calculate)
- See the zorgtoeslag result!

---

## 🏗️ Project Structure

```
ronl-municipality-portal/
├── src/
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # React entry point
│   ├── index.css               # Tailwind CSS
│   └── services/
│       ├── keycloak.ts         # Keycloak authentication
│       └── api.ts              # Business API client
├── index.html                  # HTML template
├── vite.config.ts              # Vite configuration
├── tailwind.config.js          # Tailwind CSS config
├── package.json                # Dependencies
└── README.md                   # This file
```

---

## 🎨 Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first styling
- **Keycloak JS** - Authentication adapter
- **Axios** - HTTP client

---

## 🔐 Authentication Flow

1. **App loads** → Keycloak JS adapter initializes
2. **Not logged in?** → Redirect to Keycloak login page
3. **User logs in** → Keycloak validates credentials
4. **Success** → Redirected back with JWT token
5. **Token stored** → Used for all API calls

---

## 🎨 Customize Styling

Edit `tailwind.config.js` or `src/index.css`.

---

## 📊 Architecture Benefits

This setup demonstrates:

✅ **Separation of Concerns**

- Frontend doesn't call Operaton directly
- All security handled by Business API
- Token validation centralized

✅ **Multi-Tenancy**

- Municipality from JWT token
- Automatic tenant isolation
- Each municipality has separate data

✅ **Audit Trail**

- All API calls logged
- User actions tracked
- Compliance with government requirements

✅ **Security**

- No credentials in frontend
- Short-lived JWT tokens (15 min)
- Automatic token refresh
- CORS properly configured

---

## 🚀 Production Deployment

### Build

```bash
npm run build
# Creates dist/ folder
```

### Deploy to Azure Static Web Apps

```bash
# Install Azure CLI
az login

# Create static web app
az staticwebapp create \
  --name ronl-portal \
  --resource-group ronl-production \
  --source ./dist \
  --location westeurope

# Configure environment
az staticwebapp appsettings set \
  --name ronl-portal \
  --setting-names \
    VITE_API_URL=https://api.ronl.nl \
    VITE_KEYCLOAK_URL=https://auth.ronl.nl
```

### Production Configuration

Update `src/services/keycloak.ts`:

```typescript
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: 'ronl',
  clientId: 'ronl-business-api',
});
```

Update `src/services/api.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/v1';
```

---

## 📝 Testing Checklist

- [ ] Can login with test-citizen-utrecht
- [ ] Can login with test-caseworker-utrecht
- [ ] API health shows all services UP
- [ ] Municipality displayed correctly (Utrecht)
- [ ] Assurance level shows "hoog"
- [ ] Can calculate zorgtoeslag
- [ ] Results display correctly
- [ ] Can logout and login again
- [ ] Token auto-refreshes after 15 minutes

---

## 🎓 Learning Resources

- **Keycloak JS:** https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter
- **React:** https://react.dev
- **Vite:** https://vitejs.dev
- **Tailwind CSS:** https://tailwindcss.com

---

## 🤝 Integration with Business API

This frontend calls these Business API endpoints:

- `GET /v1/health` - Check API health
- `POST /v1/decision/:key/evaluate` - Evaluate DMN
- `POST /v1/process/:key/start` - Start BPMN process

All calls include:

- `Authorization: Bearer <token>` header
- Automatic token refresh
- Municipality context from token

---

## 💡 Tips

- **F12** - Open browser DevTools
- **Network tab** - See API requests/responses
- **Console tab** - See Keycloak token info
- **Logout** - Click "Uitloggen" in header
- **Test Different Users** - Logout and login as different user

---

## 🤝 Support & Resources

- **Full developer docs:** [Frontend Development](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/frontend-development/)
- **API Documentation:** http://localhost:3002 (when running)
- **Keycloak Docs:** https://www.keycloak.org/docs/23.0/
- **React Docs:** https://react.dev
- **Express Docs:** https://expressjs.com

---

**🎉 Your complete RONL architecture is now running!**

All components working together:

- ✅ Frontend (Port 5173)
- ✅ Keycloak (Port 8080)
- ✅ Business API (Port 3002)
- ✅ Operaton (operaton.open-regels.nl)
