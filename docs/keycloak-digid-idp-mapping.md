# Keycloak-Specific Mapping

## DigiD / eIDAS / eHerkenning via Keycloak IAM Federation

This document describes **how to configure Keycloak** to support the login flow shown in the mockups:
Municipality Frontend → Keycloak → DigiD / eIDAS / eHerkenning → Business API.

The focus is on **Identity Provider (IdP) configuration**, **authentication flows**, and **token mapping**.

---

## 1. Keycloak Role in the Architecture

Keycloak acts as:

- OIDC Provider for Municipality Frontend
- Federation hub (IdP Broker) for DigiD, eIDAS, eHerkenning
- Token issuer (JWT)
- Attribute & assurance-level mapper

Keycloak **never stores user passwords** for DigiD/eHerkenning users.

---

## 2. Realm Setup

Create a dedicated realm, e.g.:

```
Realm name: municipality
```

Realm-level settings:

- Login with email: ❌
- Username editable: ❌
- Brute force protection: ✅
- SSL required: external / all

---

## 3. Identity Provider Configuration

### 3.1 DigiD (SAML or OIDC)

> DigiD typically integrates via **SAML 2.0** (OIDC is emerging but SAML is still common).

**Create IdP**

```
Identity Providers → Add provider → SAML v2.0
Alias: digid
Display name: DigiD
```

**Core Settings**

- Service Provider Entity ID: `https://keycloak.municipality.nl/realms/municipality`
- Single Sign-On Service URL: provided by Logius
- Single Logout Service URL: optional
- NameID Policy Format: `urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`
- Force Authentication: true

**Security**

- Sign assertions: required
- Validate signatures: required
- Encryption: per Logius requirements

---

### 3.2 eHerkenning

```
Identity Providers → Add provider → SAML v2.0
Alias: eherkenning
Display name: eHerkenning
```

Key differences:

- NameID often organization-bound
- Attributes include:
  - KvK number
  - Role / mandate
  - Assurance level (eH2 / eH3 / eH4)

---

### 3.3 eIDAS

```
Identity Providers → Add provider → SAML v2.0
Alias: eidas
Display name: eIDAS
```

Typical attributes:

- PersonIdentifier
- FamilyName
- FirstName
- DateOfBirth
- LevelOfAssurance (low / substantial / high)

---

## 4. Attribute & Claim Mapping

### 4.1 User Attribute Mapping

Use **IdP Mappers** per provider.

Example (DigiD):

```
Identity Provider → DigiD → Mappers → Create
```

| SAML Attribute                   | User Attribute |
| -------------------------------- | -------------- |
| urn:oid:2.5.4.5                  | bsn            |
| urn:oid:1.3.6.1.4.1.5923.1.1.1.9 | loa            |

---

### 4.2 Token Claim Mapping

Create **Protocol Mappers** on the client.

Example:

- Mapper Type: User Attribute
- User Attribute: `bsn`
- Token Claim Name: `bsn`
- Add to ID token: ✅
- Add to access token: ✅

---

## 5. Clients Configuration

### 5.1 Municipality Frontend (OIDC Client)

```
Client ID: municipality-frontend
Client Type: confidential
Protocol: openid-connect
```

Settings:

- Standard Flow: ✅
- PKCE: recommended
- Redirect URIs: `https://portal.municipality.nl/*`
- Web Origins: same as redirect

---

### 5.2 Business API (Bearer-only)

```
Client ID: business-api
Access Type: bearer-only
```

Used only for token validation.

---

## 6. Authentication Flows

### 6.1 Browser Flow (Customized)

Copy the default flow:

```
Authentication → Flows → Browser → Copy
Name: browser-digid
```

Flow structure:

1. Cookie (optional)
2. Identity Provider Redirector
3. IdP selection (if multiple)
4. External IdP authentication
5. User auto-link / create
6. Post-login required actions (optional)

Set **browser-digid** as the realm default.

---

### 6.2 First Broker Login Flow

```
Authentication → Flows → First Broker Login
```

Recommended actions:

- Auto-create user
- Skip profile update
- Enforce attribute validation
- Block login if BSN missing

---

## 7. Assurance Level (LoA) Enforcement

Use one of the following:

### Option A: Client-level LoA Check

- Validate `loa` claim in Business API
- Reject insufficient levels

### Option B: Keycloak Authentication Flow

- Script authenticator
- Conditional flow based on IdP / attribute

---

## 8. Authorization & Roles

### Realm Roles

```
resident
business-user
case-worker
```

Map roles based on:

- Identity Provider
- Attributes (BSN vs KvK)

---

## 9. Token Example (Access Token)

```json
{
  "iss": "https://keycloak.municipality.nl/realms/municipality",
  "aud": "business-api",
  "sub": "f:digid:8f23...",
  "bsn": "*********",
  "loa": "substantial",
  "roles": ["resident"]
}
```

---

## 10. Logout Flow

- Frontend triggers OIDC logout
- Keycloak ends session
- Optional SAML Single Logout to IdP (if supported)

---

## 11. Security & Compliance Notes

- Follow Logius integration contracts strictly
- Never persist BSN outside allowed scope
- Use short-lived access tokens
- Enable audit logging in Keycloak

---

## 12. Summary

✔ Keycloak as federation hub  
✔ SAML-based DigiD/eHerkenning/eIDAS  
✔ OIDC/JWT for internal APIs  
✔ Clear separation of concerns  
✔ BPMN-ready security context

---

**Document type:** Architecture / IAM configuration  
**Scope:** Municipality login federation
