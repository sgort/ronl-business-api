# Caddy Reverse Proxy Configuration

Caddy handles SSL termination and reverse proxying for all services on the VM.

## Files to Copy from VM

You need to retrieve the current Caddyfile from your VM:

```bash
# From your local machine
scp user@vm:/path/to/Caddyfile deployment/vm/caddy/Caddyfile

# Or view it from VM
ssh user@vm "docker exec caddy cat /etc/caddy/Caddyfile" > deployment/vm/caddy/Caddyfile
```

## Expected Configuration

Your Caddyfile should include entries for:

### Keycloak ACC

```
acc.keycloak.open-regels.nl {
    reverse_proxy keycloak-acc:8080
}
```

### Keycloak PROD

```
keycloak.open-regels.nl {
    reverse_proxy keycloak-prod:8080
}
```

### Operaton

```
operaton.open-regels.nl {
    reverse_proxy operaton:8080
}
```

## Network Configuration

Caddy must be on the `npm-network` to communicate with Keycloak containers:

```bash
# Verify Caddy is on npm-network
docker network inspect npm-network | grep -A 3 caddy
```

## Reload Caddy Configuration

After updating Caddyfile:

```bash
# Copy updated Caddyfile to VM
scp deployment/vm/caddy/Caddyfile user@vm:/path/to/Caddyfile

# Reload Caddy without downtime
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Or restart Caddy
docker restart caddy
```

## Verify Configuration

```bash
# Check Caddy logs
docker logs caddy --tail 50

# Test endpoints
curl https://acc.keycloak.open-regels.nl/health/ready
curl https://keycloak.open-regels.nl/health/ready
curl https://operaton.open-regels.nl/
```

## SSL Certificates

Caddy automatically obtains and renews SSL certificates from Let's Encrypt.

### Verify Certificates

```bash
# Check certificate expiry
echo | openssl s_client -servername acc.keycloak.open-regels.nl -connect acc.keycloak.open-regels.nl:443 2>/dev/null | openssl x509 -noout -dates
echo | openssl s_client -servername keycloak.open-regels.nl -connect keycloak.open-regels.nl:443 2>/dev/null | openssl x509 -noout -dates
```

### Certificate Storage

Caddy stores certificates in:

- `/data/caddy/` inside the container
- Mapped to a Docker volume

### Force Certificate Renewal

```bash
# If certificates expire or have issues
docker exec caddy caddy reload --force
```

## Troubleshooting

### Cannot Access Service

1. **Check Caddy is running:**

   ```bash
   docker ps | grep caddy
   ```

2. **Check Caddyfile syntax:**

   ```bash
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile
   ```

3. **Check service is on npm-network:**

   ```bash
   docker network inspect npm-network | grep <service-name>
   ```

4. **Test from inside Caddy:**
   ```bash
   docker exec caddy wget -O- http://keycloak-acc:8080/
   ```

### SSL Certificate Issues

```bash
# Check Caddy logs for certificate errors
docker logs caddy | grep -i "certificate\|acme\|ssl"

# Ensure DNS points to your server
dig acc.keycloak.open-regels.nl
dig keycloak.open-regels.nl

# Ensure ports 80 and 443 are open
sudo netstat -tlnp | grep -E ":80|:443"
```

### 502 Bad Gateway

This means Caddy can't reach the backend service:

1. Check service is running: `docker ps`
2. Check service is on correct network
3. Check service health
4. Check Caddyfile has correct service name

## Security

### Headers

Consider adding security headers to your Caddyfile:

```
(security_headers) {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}

acc.keycloak.open-regels.nl {
    import security_headers
    reverse_proxy keycloak-acc:8080
}
```

### Rate Limiting

Add rate limiting if needed:

```
acc.keycloak.open-regels.nl {
    rate_limit {
        zone acc_keycloak {
            key {remote_host}
            events 100
            window 1m
        }
    }
    reverse_proxy keycloak-acc:8080
}
```

## Monitoring

### Check Caddy Metrics

Caddy exposes metrics at `:2019/metrics` (if enabled):

```bash
curl http://localhost:2019/metrics
```

### Access Logs

```bash
# Follow Caddy logs
docker logs -f caddy

# Search for specific domain
docker logs caddy | grep "acc.keycloak.open-regels.nl"
```

## Backup

Backup your Caddyfile regularly:

```bash
# From VM
docker exec caddy cat /etc/caddy/Caddyfile > /backup/Caddyfile-$(date +%Y%m%d)

# Or include in your git repo (recommended)
```

## Documentation

- Caddy Docs: https://caddyserver.com/docs/
- Reverse Proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Automatic HTTPS: https://caddyserver.com/docs/automatic-https
