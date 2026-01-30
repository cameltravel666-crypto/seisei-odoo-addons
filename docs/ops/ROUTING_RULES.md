# Traefik Routing Rules

This document defines routing conventions to prevent conflicts.

## Core Principles

1. **One Route, One Definition** - Never define the same route in both file provider AND docker labels
2. **Explicit Priority** - Use priority values when routes might overlap
3. **PathPrefix Consistency** - Always include or exclude trailing slash consistently
4. **Host Specificity** - More specific hosts should have higher priority

## Route Definition Methods

### File Provider (Preferred for Static Routes)
```yaml
# infra/stacks/edge-traefik/dynamic/services.yml
http:
  routers:
    my-router:
      rule: "Host(`example.com`) && PathPrefix(`/api`)"
      service: my-service
      priority: 100
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
```

### Docker Labels (For Dynamic/Stack-Specific Routes)
```yaml
# docker-compose.yml
services:
  myapp:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
```

## Priority Guidelines

| Priority | Use Case |
|----------|----------|
| 200+ | Emergency overrides |
| 100-199 | Specific paths (e.g., `/api/v2`) |
| 50-99 | Standard routes |
| 1-49 | Catch-all / fallback |
| 0 (default) | Avoid - unpredictable |

### Example Priority Usage

```yaml
routers:
  # Highest priority - most specific
  qr-ordering-api:
    rule: "Host(`qr.seisei.tokyo`) && PathPrefix(`/api`)"
    priority: 150

  # Medium priority - specific path
  qr-ordering-static:
    rule: "Host(`qr.seisei.tokyo`) && PathPrefix(`/qr_ordering/static`)"
    priority: 100

  # Lower priority - catch-all
  qr-ordering-main:
    rule: "Host(`qr.seisei.tokyo`)"
    priority: 50
```

## PathPrefix Rules

### Always Use Backticks
```yaml
# CORRECT
rule: "Host(`example.com`) && PathPrefix(`/api`)"

# WRONG (quotes inside quotes)
rule: "Host('example.com') && PathPrefix('/api')"
```

### Trailing Slash Handling

Option 1: Strip trailing slash with middleware
```yaml
http:
  middlewares:
    strip-slash:
      redirectRegex:
        regex: "^(.*)/+$"
        replacement: "${1}"
        permanent: true

  routers:
    myapp:
      rule: "PathPrefix(`/app`)"
      middlewares:
        - strip-slash
```

Option 2: Match both with regex (when possible)
```yaml
rule: "PathPrefix(`/app`) || PathPrefix(`/app/`)"
```

### Path Conflicts to Avoid

```yaml
# CONFLICT - /qr matches before /qr_ordering
router-a:
  rule: "PathPrefix(`/qr`)"

router-b:
  rule: "PathPrefix(`/qr_ordering`)"

# SOLUTION - Use priority
router-a:
  rule: "PathPrefix(`/qr`)"
  priority: 50

router-b:
  rule: "PathPrefix(`/qr_ordering`)"
  priority: 100  # Higher = matches first
```

## Middleware Usage

### StripPrefix
```yaml
middlewares:
  strip-api:
    stripPrefix:
      prefixes:
        - "/api"

routers:
  api-router:
    rule: "PathPrefix(`/api`)"
    middlewares:
      - strip-api
    # /api/users -> /users (to backend)
```

### Headers
```yaml
middlewares:
  cors-headers:
    headers:
      accessControlAllowOrigin: "*"
      accessControlAllowMethods:
        - GET
        - POST
        - OPTIONS
```

### Rate Limiting
```yaml
middlewares:
  rate-limit:
    rateLimit:
      average: 100
      burst: 50
```

## Current Route Registry

| Host | Path | Service | Priority | Source |
|------|------|---------|----------|--------|
| biznexus.seisei.tokyo | / | seisei-erp-app | 50 | labels |
| *.erp.seisei.tokyo | / | seisei-odoo-router | 50 | file |
| testodoo.seisei.tokyo | / | seisei-odoo-router | 50 | file |
| qr.seisei.tokyo | /api | qr-bff | 100 | file |
| qr.seisei.tokyo | / | qr-proxy | 50 | file |
| ocr.seisei.tokyo | / | ocr-service | 50 | labels |

## Debugging Routes

### Check Active Routes
```bash
# Via Traefik API
curl http://localhost:8888/api/http/routers | jq '.[] | {name, rule, priority}'

# Via dashboard
open http://localhost:8888/dashboard/
```

### Validate Before Deploy
```bash
./scripts/validate_routes.sh --local
```

### Common Issues

1. **Route Not Matching**
   - Check entryPoints (websecure vs web)
   - Verify Host spelling
   - Check PathPrefix case sensitivity

2. **Wrong Service Receiving Traffic**
   - Check priority values
   - Look for overlapping rules
   - Verify no duplicate router names

3. **TLS Issues**
   - Ensure certResolver is specified
   - Check ACME storage permissions
   - Verify domain is accessible for ACME challenge

## Adding New Routes

1. Check for conflicts: `./scripts/validate_routes.sh`
2. Choose appropriate priority
3. Prefer file provider for stable routes
4. Use docker labels for stack-specific routes
5. Document in this file
6. Test with curl before committing
