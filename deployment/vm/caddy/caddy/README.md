# Caddy Reverse Proxy on Docker

This project runs **Caddy** in Docker as a reverse proxy for hosting services like **Operaton** and **CPRMV API** with automatic HTTPS.

---

## 📋 Configuration Status

> **Current Implementation**: This README documents the **actual deployed configuration** as of September 6, 2025.

### ✅ Currently Deployed

- Basic reverse proxy with automatic HTTPS
- Container name and IP address routing
- Gzip compression
- Let's Encrypt SSL certificates

### 🔄 Planned Enhancements

- [x] Enhanced security headers & signed `security.txt` file(s)
- [ ] Access logging configuration
- [ ] Health check endpoints
- [ ] Performance optimization

### 📝 Configuration Notes

- **Last Updated**: September 12, 2025
- **Server Config Version**: v1.1
- **Tested Endpoints**: All services responding correctly

---

## 🚀 Prerequisites

- Ubuntu 22.04 LTS (VM or bare metal)
- Docker & Docker Compose Plugin installed
- DNS records pointing to your VM for each service domain, e.g.:
  - `operaton.open-regels.nl`
  - `operaton-dev.open-regels.nl`
  - `cprmv-dev.open-regels.nl`

---

## 📂 Repository Layout

    caddy/
    ├── docker-compose.yml   # Compose configuration for Caddy
    ├── Caddyfile            # Reverse proxy routing configuration
    └── README.md            # This file

---

## ⚙️ Setup

### 1. Create shared Docker network

```bash
docker network create npm-network
```

### 2. Start Caddy reverse proxy

```bash
cd ~/caddy
docker compose up -d
```

### 3. Configure routing

Add service routes to your **Caddyfile**. Example CPRMV:

```
# Global security headers
(security_headers) {
    header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    header X-Content-Type-Options "nosniff"
    header X-Frame-Options "DENY"
    header X-XSS-Protection "1; mode=block"
    header Referrer-Policy "strict-origin-when-cross-origin"
    header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
}

cprmv.open-regels.nl {
    import security_headers
    reverse_proxy cprmv-api:8000
    encode gzip
}

cprmv-dev.open-regels.nl {
    import security_headers
    reverse_proxy cprmv-api-dev:8000
    encode gzip
}
```

Reload Caddy after changes:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

#### Test security headers:

```bash
# Check all security headers on production
curl -I https://cprmv.open-regels.nl

# Check all security headers on development
curl -I https://cprmv-dev.open-regels.nl
```

You should see these headers in the response:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`

---

#### Test OCSP stapling:

Caddy enables OCSP stapling automatically by default when using Let's Encrypt certificates.

```bash
# Test OCSP stapling
openssl s_client -connect cprmv.open-regels.nl:443 -status -servername cprmv.open-regels.nl < /dev/null 2>/dev/null | grep -A 10 "OCSP response"
```

If you see "OCSP response: no response sent" or no OCSP section, that's actually normal for newer Let's Encrypt certificates since they have very long validity periods and OCSP stapling may not be necessary.

```bash
OCSP response: no response sent
---
Certificate chain
 0 s:CN = cprmv.open-regels.nl
   i:C = US, O = Let's Encrypt, CN = E7
   a:PKEY: id-ecPublicKey, 256 (bit); sigalg: ecdsa-with-SHA384
   v:NotBefore: Sep  6 11:22:43 2025 GMT; NotAfter: Dec  5 11:22:42 2025 GMT
 1 s:C = US, O = Let's Encrypt, CN = E7
   i:C = US, O = Internet Security Research Group, CN = ISRG Root X1
   a:PKEY: id-ecPublicKey, 384 (bit); sigalg: RSA-SHA256
   v:NotBefore: Mar 13 00:00:00 2024 GMT; NotAfter: Mar 12 23:59:59 2027 GMT
```

#### Add CAA record(s) for domain

CAA (Certificate Authority Authorization) records specify which Certificate Authorities are allowed to issue certificates for your domain. This prevents unauthorized certificate issuance.

These records are added to `open-regels.nl` DNS zone

```
# Allow Let's Encrypt to issue certificates
open-regels.nl.     CAA     0 issue "letsencrypt.org"

# Allow Let's Encrypt to issue wildcard certificates
open-regels.nl.     CAA     0 issuewild "letsencrypt.org"

# Set incident reporting email (optional but recommended)
open-regels.nl.     CAA     0 iodef "mailto:admin@open-regels.nl"
```

Test CAA records after adding:

```bash
# Test CAA records
dig CAA open-regels.nl +short
# or
nslookup -type=CAA open-regels.nl
```

#### Add TLSA record(s) for DANE

DANE (DNS-based Authentication of Named Entities) uses TLSA records to bind certificates to DNS, providing additional certificate validation.

First, get the certificate information:

```bash
# Get the current certificate fingerprint
echo | openssl s_client -connect cprmv.open-regels.nl:443 -servername cprmv.open-regels.nl 2>/dev/null | openssl x509 -fingerprint -sha256 -noout
```

Second, get the public key hash:

```bash
# Get the public key hash (recommended for DANE)
echo | openssl s_client -connect cprmv.open-regels.nl:443 -servername cprmv.open-regels.nl 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | xxd -p -u
```

The TLSA record format is: `_443._tcp.cprmv.open-regels.nl TLSA [usage] [selector] [matching-type] [certificate-data]`

For DANE TLSA records, using the public key hash is recommended because it's more stable - it won't change when Let's Encrypt renews the certificate as long as they use the same key pair.

TLSA Record Details:

- **Name:** _443._tcp.cprmv
- **Type:** TLSA
- **TTL:** 3600 seconds
- **Usage:** 3 (Domain-issued certificate)
- **Selector:** 1 (SubjectPublicKeyInfo)
- **Matching Type:** 1 (SHA-256)
- **Certificate Association Data:** 80A6CE0A112126B672123613E53A0963814CF3A738BAA71EF5B15F0829E5AFCC

In DNS, add:

```
Name: _443._tcp.cprmv
Type: TLSA
TTL: 3600
Value: 3 1 1 80A6CE0A112126B672123613E53A0963814CF3A738BAA71EF5B15F0829E5AFCC
```

Repeat this for the dev site.

Test the TLSA records:

```bash
# Test production TLSA record
dig TLSA _443._tcp.cprmv.open-regels.nl +short
```

You should see output like:

```
3 1 1 80A6CE0A112126B672123613E53A0963814CF3A738BAA71EF5B15F0829E5AFCC
```

#### Enhanced security headers

We already added basic security headers, but enhance them with additional recommended headers for better security.

Updated Caddyfile with enhanced security headers:

```
# Enhanced security headers
(security_headers) {
    header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    header X-Content-Type-Options "nosniff"
    header X-Frame-Options "DENY"
    header X-XSS-Protection "1; mode=block"
    header Referrer-Policy "same-origin"
    header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
    header Cross-Origin-Embedder-Policy "require-corp"
    header Cross-Origin-Opener-Policy "same-origin"
    header Cross-Origin-Resource-Policy "same-origin"
}

operaton.open-regels.nl {
    import security_headers
    reverse_proxy 172.18.0.3:8080
    encode gzip
}

operaton-dev.open-regels.nl {
    import security_headers
    reverse_proxy 172.18.0.5:8080
    encode gzip
}

cprmv.open-regels.nl {
    import security_headers
    reverse_proxy cprmv-api:8000
    encode gzip
}

cprmv-dev.open-regels.nl {
    import security_headers
    reverse_proxy cprmv-api-dev:8000
    encode gzip
}
```

Reload the Caddyfile by restarting the container (safest way to reload new file) and test the new headers:

```bash
curl -I https://cprmv.open-regels.nl | grep -i "permissions-policy\|cross-origin"
```

You should see:

- `permissions-policy: geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()`
- `cross-origin-embedder-policy: require-corp`
- `cross-origin-opener-policy: same-origin`
- `cross-origin-resource-policy: same-origin`
- `referrer-policy: strict-origin-when-cross-origin`

#### Add security.txt file

The final step is to add a `security.txt` file at `/.well-known/security.txt` to provide security contact information and vulnerability disclosure policy.

Create the directories first:

```bash
cd ~/caddy
mkdir -p ~/caddy/static/cprmv/.well-known
```

Then create the `security.txt` file:

```
Contact: mailto:steven.gort@ictu.nl
Expires: 2026-03-21T11:00:00.000Z
Canonical: https://cprmv.open-regels.nl/.well-known/security.txt
Encryption: https://cprmv.open-regels.nl/gpg.asc
Preferred-Languages: nl, en
```

Add the static files volume to the `docker-compose.yml`:

```yaml
name: caddy-proxy

services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./static:/srv/static
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - npm-network

volumes:
  caddy_data:
  caddy_config:

networks:
  npm-network:
    external: true
```

Udate the order of directives in the `Caddyfile`. In Caddy, the handle directive needs to come before the reverse_proxy.

```
(...)
cprmv.open-regels.nl {
    handle /.well-known/* {
        root * /srv/static/cprmv
        file_server
    }
    handle /*.asc {
        root * /srv/static
        file_server
    }
    import security_headers
    reverse_proxy cprmv-api:8000
    encode gzip
}
```

Signing the `security.txt` file is recommended

1. Export your GPG public with `gpg --armor --export {your mail address here}` key and put it in `~/caddy/static/gpg.asc`
2. Sign the file with: `gpg --clearsign ~/caddy/static/cprmv/.well-known/security.txt`
3. Replace the original file with the signed version
4. Update the Caddyfile to serve `.asc` file from root (see example above)
5. Restart Caddy

Test `security.txt` and GPG key access:

```bash
curl https://cprmv.open-regels.nl/gpg.asc
curl https://cprmv.open-regels.nl/.well-known/security.txt
```

## 🔄 Daily Usage

- **Check container status**

  ```bash
  docker ps | grep caddy
  ```

- **View logs**

  ```bash
  docker logs caddy -f
  ```

- **Reload config**

  ```bash
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile
  ```

- **Update image**

  ```bash
  cd ~/caddy
  docker compose pull
  docker compose up -d
  ```

---

## 🔐 HTTPS Certificates

Caddy automatically obtains and renews SSL certificates via Let's
Encrypt.

- Certificates are stored in the container's `/data` volume.
- Ensure DNS records resolve correctly to your server before startup.
- If encountering rate limits, test with the `--staging` flag in
  Caddy.

---

## 🛠️ Configuration

### Docker Compose Configuration

```yaml
services:
  caddy:
    container_name: caddy
    image: caddy:latest
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - npm-network

volumes:
  caddy_data:
  caddy_config:

networks:
  npm-network:
    external: true
```

### Caddyfile Example

    example.com {
        reverse_proxy backend:8080
        encode gzip
    }

---

## 🔍 Troubleshooting

### Container Won't Start

- Check logs: `docker logs caddy`
- Ensure ports 80 and 443 are not in use by another service (e.g.,
  Apache/Nginx)
- Verify DNS points correctly to your server

### SSL Certificate Issues

- Check DNS propagation: https://www.whatsmydns.net
- Ensure port 80 is open for HTTP validation
- Monitor logs for Let's Encrypt errors

### Routing Issues

- Verify container names or IP addresses match Caddyfile targets
- Reload config:
  `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`

---

## ✅ Summary

- **Automatic HTTPS** with Let's Encrypt
- **Reverse proxy** for multiple services on one host
- **Dockerized deployment** with persistent config & cert storage
- **Easy scaling** by extending Caddyfile with more routes
- **Unified access** to Operaton, CPRMV API, and other services
