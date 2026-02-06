# Security & Authentication Architecture

## Overview

RONL Business API implements government-grade security following Dutch compliance standards (BIO, NEN 7510, AVG/GDPR). The system uses OpenID Connect (OIDC) with JWT tokens, multi-tenant isolation, and comprehensive audit logging.

## Authentication Flow

### Complete OIDC Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Keycloak
    participant Backend
    participant Operaton

    User->>Frontend: Visit portal
    Frontend->>Frontend: Check for token
    Frontend->>Keycloak: Redirect to /auth
    Keycloak->>User: Show login page
    User->>Keycloak: Enter credentials
    Keycloak->>Keycloak: Validate credentials
    Keycloak->>Frontend: Redirect with auth code
    Frontend->>Keycloak: Exchange code for tokens
    Keycloak->>Frontend: Return access_token + id_token
    Frontend->>Frontend: Store tokens
    Frontend->>Backend: API call + Bearer token
    Backend->>Keycloak: Validate JWT (JWKS)
    Backend->>Backend: Extract claims
    Backend->>Operaton: Call with user context
    Operaton->>Backend: Return result
    Backend->>Backend: Log audit entry
    Backend->>Frontend: Return response
```

### OIDC Endpoints

**Keycloak Discovery (ACC)**:

```
https://acc.keycloak.open-regels.nl/realms/ronl/.well-known/openid-configuration
```

**Keycloak Discovery (PROD)**:

```
https://keycloak.open-regels.nl/realms/ronl/.well-known/openid-configuration
```

**Key Endpoints**:

- `authorization_endpoint`: Login page
- `token_endpoint`: Exchange auth code for tokens
- `jwks_uri`: Public keys for JWT validation
- `userinfo_endpoint`: Get user profile
- `end_session_endpoint`: Logout

## JWT Token Structure

### Access Token

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-123"
  },
  "payload": {
    "exp": 1704110400,
    "iat": 1704106800,
    "iss": "https://keycloak.open-regels.nl/realms/ronl",
    "aud": "ronl-business-api",
    "sub": "user-uuid-123",
    "typ": "Bearer",
    "azp": "ronl-business-api",
    "preferred_username": "test-citizen-utrecht",
    "email_verified": false,
    "municipality": "utrecht",
    "roles": ["citizen"],
    "loa": "substantial"
  },
  "signature": "..."
}
```

### Custom Claims

| Claim          | Type   | Description                        | Example            |
| -------------- | ------ | ---------------------------------- | ------------------ |
| `municipality` | string | Tenant identifier                  | `"utrecht"`        |
| `roles`        | array  | User roles                         | `["citizen"]`      |
| `loa`          | string | Level of Assurance                 | `"substantial"`    |
| `mandate`      | string | Representation authority           | `"legal-guardian"` |
| `bsn`          | string | Citizen Service Number (encrypted) | `"***-***-***"`    |

**Note**: Real BSN would be encrypted in production. Our simulation uses placeholder values.

## JWT Validation

### Backend Validation Steps

1. **Extract Token**

   ```javascript
   const authHeader = req.headers.authorization;
   const token = authHeader?.split(' ')[1];
   ```

2. **Verify Signature**

   ```javascript
   const jwks = await fetchJWKS(keycloakUrl);
   const decoded = jwt.verify(token, jwks);
   ```

3. **Validate Claims**

   ```javascript
   // Check expiration
   if (decoded.exp < Date.now() / 1000) {
     throw new Error('Token expired');
   }

   // Check audience
   if (decoded.aud !== 'ronl-business-api') {
     throw new Error('Invalid audience');
   }

   // Check issuer
   if (!decoded.iss.startsWith(keycloakUrl)) {
     throw new Error('Invalid issuer');
   }
   ```

4. **Extract User Context**
   ```javascript
   const userContext = {
     userId: decoded.sub,
     municipality: decoded.municipality,
     roles: decoded.roles,
     loa: decoded.loa,
   };
   ```

### JWKS Caching

```javascript
// Cache JWKS keys for 1 hour
const jwksCache = new NodeCache({ stdTTL: 3600 });

async function fetchJWKS(keycloakUrl) {
  const cached = jwksCache.get('jwks');
  if (cached) return cached;

  const response = await axios.get(`${keycloakUrl}/realms/ronl/protocol/openid-connect/certs`);

  jwksCache.set('jwks', response.data);
  return response.data;
}
```

## Authorization

### Role-Based Access Control (RBAC)

**Roles**:

- `citizen`: Can start processes, view own data
- `caseworker`: Can process applications, view queue
- `admin`: Full access to system

**Process-Level Authorization**:

```javascript
function canStartProcess(user, processKey) {
  const permissions = {
    zorgtoeslag: ['citizen', 'caseworker'],
    vergunning: ['citizen', 'caseworker'],
    bezwaar: ['citizen', 'caseworker', 'admin'],
  };

  const allowedRoles = permissions[processKey];
  return user.roles.some((role) => allowedRoles.includes(role));
}
```

### Tenant Isolation

**Database-Level**:

```sql
-- All queries filtered by municipality
SELECT * FROM process_instances
WHERE municipality = $1 AND user_id = $2;
```

**API-Level**:

```javascript
// Middleware enforces tenant isolation
app.use((req, res, next) => {
  const municipality = req.user.municipality;
  req.query.municipality = municipality; // Force tenant filter
  next();
});
```

**Operaton-Level**:

```javascript
// Process variables include tenant
{
  "municipality": "utrecht",
  "initiator": "user-uuid-123",
  "input": { ... }
}
```

## DigiD Integration (Future)

### Current: Simulated DigiD

```javascript
// Keycloak user attributes (simulation)
{
  "username": "test-citizen-utrecht",
  "attributes": {
    "municipality": "utrecht",
    "loa": "substantial",
    "authentication_method": "digid-simulated"
  }
}
```

### Future: Real DigiD

**DigiD Broker Flow**:

```
User → Keycloak → DigiD Broker → DigiD
                     ↓
              Return SAML assertion
                     ↓
              Map to OIDC claims
                     ↓
              Issue JWT with BSN
```

**Required Changes**:

1. Configure Keycloak identity provider
2. Add DigiD SAML metadata
3. Map SAML assertions to JWT claims
4. Encrypt BSN in JWT
5. Update audit logging for BSN

### Level of Assurance (LoA)

| Level         | Description              | Use Case                   |
| ------------- | ------------------------ | -------------------------- |
| `low`         | Basic authentication     | Public information         |
| `substantial` | DigiD midden             | Most government services   |
| `high`        | DigiD hoog / eHerkenning | Sensitive data, legal acts |

**Enforcement**:

```javascript
function requireLoA(minLevel) {
  return (req, res, next) => {
    const userLoA = req.user.loa;
    const levels = ['low', 'substantial', 'high'];

    if (levels.indexOf(userLoA) < levels.indexOf(minLevel)) {
      return res.status(403).json({
        error: 'Insufficient authentication level',
      });
    }

    next();
  };
}

// Require high LoA for sensitive operations
app.post('/process/bezwaar/start', authenticate, requireLoA('high'), startProcess);
```

## Audit Logging

### What We Log

**Every API call logs**:

- `timestamp`: When
- `user_id`: Who (never BSN in simulation)
- `municipality`: Which tenant
- `action`: What (e.g., 'START_PROCESS')
- `resource`: What resource (e.g., 'zorgtoeslag')
- `ip_address`: From where
- `result`: Success/failure
- `details`: Additional context

### Audit Table Schema

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL,
  municipality VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100),
  ip_address INET,
  result VARCHAR(20) NOT NULL,
  details JSONB,
  INDEX idx_municipality (municipality),
  INDEX idx_user (user_id),
  INDEX idx_timestamp (timestamp)
);
```

### Example Audit Entry

```json
{
  "timestamp": "2024-01-01T10:30:00Z",
  "user_id": "user-uuid-123",
  "municipality": "utrecht",
  "action": "START_PROCESS",
  "resource": "zorgtoeslag",
  "ip_address": "192.168.1.100",
  "result": "SUCCESS",
  "details": {
    "process_instance_id": "abc-123",
    "input": {
      "income": 24000,
      "age": 25
    },
    "output": {
      "eligible": true,
      "amount": 1150
    }
  }
}
```

### Audit Log Retention

- **ACC**: 90 days
- **PROD**: 7 years (compliance requirement)
- **Archived logs**: Cold storage (Azure Blob)

### Compliance Requirements

**BIO (Baseline Informatiebeveiliging Overheid)**:

- ✅ Authentication events logged
- ✅ Authorization decisions logged
- ✅ Data access logged
- ✅ System changes logged

**NEN 7510 (Healthcare)**:

- ✅ Patient/citizen data access logged
- ✅ Tampering detection (immutable logs)
- ✅ Regular audit reports

**AVG/GDPR**:

- ✅ Data processing logged
- ✅ User consent tracked
- ✅ Data deletion audited
- ✅ Data export audited

## Security Headers

### Frontend (Static Web App)

```json
{
  "headers": {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  }
}
```

### Backend (App Service)

```javascript
app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://operaton.open-regels.nl'],
      },
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  })
);
```

## Rate Limiting

### API Rate Limits

```javascript
const rateLimit = require('express-rate-limit');

// General API: 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
});

// Auth endpoints: 5 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts',
});

app.use('/v1', apiLimiter);
app.use('/v1/auth', authLimiter);
```

### Keycloak Rate Limiting

**Brute Force Protection**:

- Enabled by default
- Max 5 failed attempts
- 15-minute lockout
- Exponential backoff

## CORS Configuration

### Backend CORS

```javascript
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://mijn.open-regels.nl',
      'https://acc.mijn.open-regels.nl',
      'http://localhost:5173', // Development
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
```

### Keycloak CORS

**Realm Settings → Client → ronl-business-api**:

- Valid Redirect URIs: `https://mijn.open-regels.nl/*`
- Web Origins: `https://mijn.open-regels.nl`
- Enable CORS: ✅

## Secrets Management

### Environment Variables

**Backend (.env)**:

```bash
# Keycloak
KEYCLOAK_URL=https://keycloak.open-regels.nl
KEYCLOAK_REALM=ronl
KEYCLOAK_CLIENT_ID=ronl-business-api

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://cache.redis.cache.windows.net:6380

# Operaton
OPERATON_URL=https://operaton.open-regels.nl
```

**Never commit**:

- ❌ .env files
- ❌ Passwords
- ❌ API keys
- ❌ Database credentials

**Use Azure Key Vault (Production)**:

```javascript
const { SecretClient } = require('@azure/keyvault-secrets');

const client = new SecretClient(process.env.KEY_VAULT_URL, credential);

const dbPassword = await client.getSecret('db-password');
```

## Penetration Testing

### Recommended Tests

**Authentication**:

- ✅ JWT token tampering
- ✅ Token expiration handling
- ✅ Replay attacks
- ✅ CSRF protection

**Authorization**:

- ✅ Privilege escalation
- ✅ Tenant isolation bypass
- ✅ Role boundary testing
- ✅ API endpoint access control

**Input Validation**:

- ✅ SQL injection
- ✅ XSS attacks
- ✅ Command injection
- ✅ Path traversal

**Infrastructure**:

- ✅ Port scanning
- ✅ SSL/TLS configuration
- ✅ Certificate validation
- ✅ Network segmentation

## Security Checklist

### Pre-Production

- [ ] All secrets in Azure Key Vault
- [ ] HTTPS enforced everywhere
- [ ] JWT validation working
- [ ] Rate limiting enabled
- [ ] Audit logging comprehensive
- [ ] CORS properly configured
- [ ] Security headers set
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Dependency scan (npm audit)
- [ ] Container scan (Docker)
- [ ] Penetration test completed

### Ongoing

- [ ] Monthly security updates
- [ ] Quarterly dependency audit
- [ ] Annual penetration test
- [ ] Monitor audit logs
- [ ] Review access logs
- [ ] Certificate renewal (automatic)
- [ ] Backup verification

## Next Steps

- [Backend Development](../development/backend.md) - Implement authentication
- [Deployment Overview](../deployment/overview.md) - Deploy securely
- [Architecture Overview](overview.md) - Understand the full picture

---

**Security is not optional for government services. It's the foundation.** 🔐
