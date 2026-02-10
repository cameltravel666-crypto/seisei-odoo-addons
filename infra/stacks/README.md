# Infra Stacks — Single Source of Truth (SSOT)

This directory contains the **canonical** Docker Compose stack definitions deployed to production and staging servers.

## Stack Directory Map

| Stack | Path | Deployed To |
|-------|------|------------|
| Odoo 18 Prod | `odoo18-prod/` | prod-odoo18 (54.65.127.141) via `/srv/stacks/odoo18-prod` |
| Odoo 18 Staging | `odoo18-staging/` | staging-odoo18 (13.231.24.250) via `/srv/stacks/odoo18-staging` |
| OCR Service | `ocr/` | prod-odoo18 + staging-odoo18 via `/srv/stacks/ocr` |
| Edge Traefik | `edge-traefik/` | both servers via `/opt/seisei-odoo-addons/infra/stacks/edge-traefik` |

## Image Pinning

All service images MUST be digest-pinned. See `../images.lock` for the canonical digest registry.

## Deployment

Stacks are deployed via GitHub Actions workflows. The deploy process:
1. Creates a release snapshot in `/srv/releases/stacks/<stack>/`
2. Symlinks `/srv/stacks/<stack>` to the release
3. Runs `docker compose pull && docker compose up -d`

## Related Repos

- `server-apps/infra/stacks/` — DEPRECATED, not deployed (see `README_DEPRECATED.md` there)
- `Seisei ERP/services/biznexus-app/` — Biznexus app compose (deployed separately)
