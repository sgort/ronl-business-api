# RONL Municipality Portal (MijnOmgeving)

> Simple React frontend demonstrating the complete RONL Business API architecture

**Municipality Portal** → **Keycloak** → **Business API** → **Operaton**

---

## 🎯 What This Demonstrates

This frontend completes the reference architecture from `docs/operaton_business_api_architecture.md`:

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
5. **Token stored** → Keycloak JS adapter handles refresh
6. **API calls** → Token automatically added to headers

---

## 🧪 Testing Scenarios

### Test 1: Eligible Citizen

- ✅ Ingezetene: Yes
- ✅ 18+: Yes
- ✅ Verzekering: Yes
- ❌ Betalingsregeling: No
- ❌ Detentie: No
- 💰 Inkomen: €24,000

**Expected Result:** Zorgtoeslag €1,250

### Test 2: Not Eligible (High Income)

- ✅ Ingezetene: Yes
- ✅ 18+: Yes
- ✅ Verzekering: Yes
- ❌ Betalingsregeling: No
- ❌ Detentie: No
- 💰 Inkomen: €50,000

**Expected Result:** Zorgtoeslag €0 (income too high)

### Test 3: Payment Plan Issue

- ✅ Ingezetene: Yes
- ✅ 18+: Yes
- ✅ Verzekering: Yes
- ✅ Betalingsregeling: Yes ← Payment plan active
- ❌ Detentie: No
- 💰 Inkomen: €24,000

**Expected Result:** May affect eligibility

---

## 🔍 Debugging

### Check API Health

The top of the page shows real-time status:

- Business API: healthy/degraded
- Keycloak: up/down
- Operaton: up/down

### View Network Requests

Open browser DevTools (F12):

- **Network tab** → See API calls
- **Console tab** → See errors
- **Application tab** → See Keycloak token

### Decode JWT Token

```bash
# In browser console:
localStorage.getItem('kc-token')

# Or use jwt.io to decode
```

### API Not Responding?

```bash
# Check Business API is running
curl http://localhost:3002/v1/health

# Check Keycloak is running
curl http://localhost:8080/health/ready
```

---

## 🛠️ Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run type-check

# Lint code
npm run lint
```

---

## 🎯 Extending the Frontend

### Add More DMN Decisions

Edit `src/App.tsx`:

```typescript
// Add a new decision
const handleCustomDecision = async () => {
  const response = await businessApi.evaluateDecision('your-decision-key', {
    variable1: { value: 123, type: 'Integer' },
    variable2: { value: true, type: 'Boolean' },
  });
  setResult(response);
};
```

### Add BPMN Process Starting

```typescript
// Start a process
const handleStartProcess = async () => {
  const response = await businessApi.startProcess('vergunning', {
    aanvrager: { value: 'Test', type: 'String' },
    adres: { value: 'Straat 123', type: 'String' },
  });
  console.log('Process started:', response);
};
```

### Change Municipality

Update test user in Keycloak or switch users.

### Customize Styling

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

**🎉 Your complete RONL architecture is now running!**

All components working together:

- ✅ Frontend (Port 5173)
- ✅ Keycloak (Port 8080)
- ✅ Business API (Port 3002)
- ✅ Operaton (operaton.open-regels.nl)
