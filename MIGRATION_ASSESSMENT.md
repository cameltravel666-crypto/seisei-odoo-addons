# Seisei Infrastructure Migration Assessment

**Assessment Date**: 2026-02-01
**Prepared By**: Claude Code
**Migration Scope**: Complete production infrastructure from 54.65.127.141 to new AWS environment

---

## Executive Summary

The current production server (54.65.127.141) is **already using industrial-grade deployment practices** including:
- ✅ Release-based deployments with digest-pinned images
- ✅ Automated deployment scripts and tracking
- ✅ Proper stack segregation in `/srv/stacks/`
- ✅ Deployment history and audit logging
- ✅ Custom GHCR images with baked-in dependencies

**Migration Strategy**: Replicate the existing deployment architecture on new AWS infrastructure (2 EC2 instances + 2 RDS instances) while maintaining zero-downtime service delivery.

**Total Databases**: 17 databases (~850 MB total)
**Services to Migrate**: 9 production services
**Estimated Downtime**: Zero (blue-green DNS cutover)

---

## 1. Current Infrastructure (54.65.127.141)

### 1.1 Running Services

| Service | Container Name | Image | Status | Ports | Domain |
|---------|---------------|-------|--------|-------|---------|
| **Traefik** | traefik | traefik:3.6.7 | Healthy | 80, 443, 8888 | Edge router |
| **Odoo Production** | odoo18-prod-web | ghcr.io/.../seisei-odoo18:sha-9329928 | Healthy | Internal | demo.nagashiro.top |
| **Odoo Admin** | odoo-admin | ghcr.io/.../seisei-odoo18:sha-d8c582d | Healthy | Internal | admin.erp.seisei.tokyo |
| **Odoo Tenant** | odoo-tenant | ghcr.io/.../seisei-odoo18:sha-d8c582d | Healthy | Internal | *.erp.seisei.tokyo |
| **Odoo Staging** | odoo18-staging-web | ghcr.io/.../seisei-odoo18 | Healthy | 8069, 8072 | staging.odoo.seisei.tokyo |
| **BizNexus Prod** | seisei-erp-app | ghcr.io/.../seisei-erp:latest | Running | Internal | biznexus.seisei.tokyo |
| **BizNexus Staging** | biznexus-staging-app | ghcr.io/.../seisei-erp:latest | ⚠️ Unhealthy | 9528 | staging.erp.seisei.tokyo |
| **Main Website** | seisei-www | seisei-www:pin-20260129-d75f3637 | Running | Internal | seisei.tokyo |
| **OCR Service** | ocr-service | ghcr.io/.../ocr-service:sha-b73ee89 | Healthy | 8180 | Internal API |
| **Langbot** | langbot | rockchin/langbot | Running | Internal | langbot.seisei.tokyo |
| **Dify AI** | docker-web-1 | langgenius/dify-web:1.10.1-fix.1 | Running | 3000 | dify.seisei.tokyo |
| **QR BFF** | qr-bff | qr-bff:20260129-proxy-v9 | Healthy | Internal | API proxy |

### 1.2 Database Inventory (seisei-db)

**PostgreSQL 15** running locally on original server.

| Database | Size | Purpose |
|----------|------|---------|
| ten_testodoo | 188 MB | Test tenant database |
| ten_public | 62 MB | Public tenant database |
| ten_00000001 - ten_00000004 | 55 MB each | Multi-tenant Odoo databases |
| tpl_production | 53 MB | Production template |
| tpl_restaurant | 51 MB | Restaurant template |
| tpl_consulting | 50 MB | Consulting template |
| tpl_service | 49 MB | Service template |
| tpl_retail | 48 MB | Retail template |
| tpl_realestate | 47 MB | Real estate template |
| test001 | 21 MB | Test database |
| opss.seisei.tokyo | 21 MB | OPSS application |
| biznexus | 8.3 MB | BizNexus application database |
| seisei-project | 7.5 MB | Project database |
| postgres | 7.5 MB | Default database |

**Total Database Size**: ~850 MB

### 1.3 Directory Structure

```
/opt/
├── seisei-odoo-addons/     # ✅ Active repository (GitHub sync)
├── seisei-odoo/            # Legacy Odoo directory
├── biznexus-build/         # BizNexus build artifacts
├── dify/                   # Dify AI platform
├── odoo18/                 # Odoo 18 installation
├── qr-bff/                 # QR BFF service
├── seisei-project/         # Project files
├── seisei-services/        # Service definitions
└── seisei-stack/           # Stack configurations

/srv/
├── stacks/                 # Production stack deployments
│   ├── edge-traefik/       # Traefik edge router
│   ├── odoo18-prod/        # Odoo production
│   ├── odoo18-staging/     # → Symlink to /srv/releases/stacks/odoo18-staging/sha-724f892__20260201T023346Z
│   ├── erp-seisei/         # BizNexus production
│   ├── erp-seisei-staging/ # BizNexus staging
│   ├── langbot/            # Langbot service
│   ├── ocr/                # OCR service
│   ├── web-seisei/         # Main website
│   └── crm-api/            # CRM API (stopped)
├── releases/               # Release management
├── backups/                # Backup storage
└── deploy-history.log      # Deployment audit log
```

### 1.4 Traefik Routing Configuration

**Dynamic Configuration**: `/srv/stacks/edge-traefik/dynamic/services.yml`

| Domain | Service | Backend |
|--------|---------|---------|
| erp.seisei.tokyo, biznexus.seisei.tokyo | BizNexus | seisei-erp-app:9527 |
| admin.erp.seisei.tokyo | Odoo Admin | seisei-odoo-router:80 |
| *.erp.seisei.tokyo | Odoo Multi-tenant | seisei-odoo-router:80 |
| testodoo.seisei.tokyo | Odoo Test | seisei-odoo-router:80 |
| demo.nagashiro.top | Odoo Demo | seisei-odoo-router:80 |
| seisei.tokyo, www.seisei.tokyo | Main Website | seisei-www:3000 |
| dify.seisei.tokyo | Dify AI | docker-web-1:3000 |
| langbot.seisei.tokyo | Langbot | langbot:5300 |

**SSL Certificates**: Let's Encrypt (letsencrypt) + Cloudflare (cloudflare)

### 1.5 Deployment History

Recent deployments from `/srv/deploy-history.log`:

```
2026-02-01 02:34:05 | odoo18-staging | staging | deploy | sha-724f892 | success | image_ref=ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5
2026-01-31 06:53:51 | odoo18-staging | staging | deploy | sha-724f892 | success
2026-01-30 04:57:12 | odoo18-prod | prod | deploy | sha-19b9b98 | success
```

**Key Insight**: Already using industrial-grade deployment automation with:
- Git commit SHA tracking
- Digest-pinned image references
- Success/failure logging
- Timestamp audit trail

---

## 2. Target Infrastructure (New AWS Environment)

### 2.1 AWS Resources

| Resource | Type | Endpoint/IP | Purpose | Status |
|----------|------|-------------|---------|--------|
| **Staging EC2** | t3.medium | 54.178.13.108 (i-07431aa34ec66a65d) | Staging environment | ✅ Deployed |
| **Production EC2** | t3.medium | 57.180.39.58 (i-0c1c8fdf3e17217d7) | Production environment | ⏸️ Ready |
| **Staging RDS** | PostgreSQL 15 | seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com:5432 | Staging database | ✅ Configured |
| **Production RDS** | PostgreSQL 15 | TBD | Production database | ⏸️ Ready |

**Region**: ap-northeast-1 (Tokyo)
**SSH Key**: `/Users/taozhang/Projects/Pem/odoo-2025.pem` (shared across all EC2 instances)

### 2.2 Current Deployment Status

**Staging EC2 (54.178.13.108)**:
- ✅ Odoo 18 Staging deployed and operational
- ✅ Connected to RDS
- ✅ Custom addons mounted via volumes
- ✅ Redis session storage
- ⚠️ Using temporary Python dependency installation (not persistent)
- ⚠️ No GHCR authentication (cannot pull custom images)
- ⚠️ No Traefik routing (direct IP access only)

**Production EC2 (57.180.39.58)**:
- ⏸️ Not yet configured
- ⏸️ Awaiting deployment automation

---

## 3. Migration Dependencies & Constraints

### 3.1 Critical Dependencies

**Deployment Order**:
1. **GHCR Authentication** ← MUST complete first (blocks all custom image deployments)
2. **Database Migration** ← Required for all Odoo/BizNexus services
3. **Traefik** ← Required for SSL termination and domain routing
4. **OCR Service** ← Dependency for Odoo modules
5. **Odoo Production** ← Core business system
6. **BizNexus** ← Depends on Odoo database
7. **Langbot, seisei-www, QR-BFF** ← Independent services

### 3.2 Known Issues to Resolve

| Issue | Severity | Impact | Resolution Required |
|-------|----------|--------|-------------------|
| **No GHCR Authentication** | 🔴 Critical | Cannot pull custom images from ghcr.io | Create GitHub PAT with `read:packages` scope |
| **Temporary Python Dependencies** | 🟡 High | Will be lost on container recreation | Switch to custom GHCR image |
| **Hardcoded Passwords** | 🟡 High | Security vulnerability | Rotate passwords, use AWS SSM Parameter Store |
| **BizNexus Staging Unhealthy** | 🟡 Medium | Staging environment degraded | Debug health check failure |
| **Missing S3 Credentials** | 🟡 Medium | Attachment storage not working | Add IAM credentials to .env |
| **No Domain-based Access** | 🟢 Low | Accessing via IP only | Deploy Traefik with proper routing |

### 3.3 Data Migration Constraints

**Total Database Size**: ~850 MB
**RDS Migration Method**: `pg_dump` + `pg_restore`
**Estimated Migration Time**: ~15 minutes
**Downtime Window**: Zero (parallel databases during migration)

**Migration Strategy**:
1. Export all databases from seisei-db (PostgreSQL 15)
2. Import to Staging RDS (test and verify)
3. Export again (latest data) to Production RDS
4. Verify data integrity
5. Update application configurations
6. DNS cutover

---

## 4. Services NOT in Migration Scope

These services will **remain on original server** (54.65.127.141):

| Service | Reason to Exclude |
|---------|------------------|
| **Dify AI Platform** | Separate product, independent infrastructure |
| **QR-BFF** | Temporary/experimental service |
| **CRM-API** | Currently stopped, likely deprecated |

**Post-Migration**: Original server will continue running Dify AI and any experimental services.

---

## 5. Migration Phases

### Phase 0: Pre-Migration Preparation ✅ COMPLETED
- [x] SSH access to original server confirmed
- [x] Service inventory completed
- [x] Database inventory completed
- [x] Traefik routing documented
- [x] Deployment history analyzed
- [x] Migration assessment documented

### Phase 1: Authentication & Security Setup
**Target**: Staging + Production EC2

- [ ] Create GitHub Personal Access Token with `read:packages` + `write:packages` scopes
- [ ] Add `GHCR_PAT` to GitHub Secrets
- [ ] Configure Docker login on Staging EC2 (54.178.13.108)
- [ ] Configure Docker login on Production EC2 (57.180.39.58)
- [ ] Test GHCR image pull on both servers
- [ ] Generate strong passwords for `admin_passwd` and `db_password`
- [ ] Rotate RDS passwords
- [ ] Configure AWS SSM Parameter Store for secrets
- [ ] Update docker-compose files to read from SSM

**Success Criteria**: Can pull custom images from GHCR without authentication errors

### Phase 2: Database Migration
**Target**: Staging RDS → Production RDS

- [ ] Create backup of all databases on original server
- [ ] Test database export/import on Staging RDS
- [ ] Verify data integrity on Staging RDS
- [ ] Create production database backup point
- [ ] Import all databases to Production RDS
- [ ] Verify data integrity on Production RDS
- [ ] Update connection strings in application configs
- [ ] Test database connectivity from both EC2 instances

**Success Criteria**: All 17 databases accessible on RDS with verified data integrity

### Phase 3: Edge Infrastructure
**Target**: Deploy Traefik to both EC2 instances

- [ ] Deploy Traefik to Staging EC2 (54.178.13.108)
- [ ] Configure dynamic routing for staging services
- [ ] Set up SSL certificates (Let's Encrypt + Cloudflare)
- [ ] Deploy Traefik to Production EC2 (57.180.39.58)
- [ ] Configure dynamic routing for production services
- [ ] Test SSL certificate acquisition
- [ ] Configure health checks

**Success Criteria**: HTTPS access working on both staging and production domains

### Phase 4: Supporting Services
**Target**: OCR, Langbot

- [ ] Deploy OCR service to Staging EC2
- [ ] Deploy OCR service to Production EC2
- [ ] Verify OCR API endpoint accessibility
- [ ] Deploy Langbot to Staging EC2
- [ ] Deploy Langbot to Production EC2
- [ ] Verify Langbot service health

**Success Criteria**: OCR and Langbot responding to health checks

### Phase 5: Core Business Services
**Target**: Odoo Production

- [ ] Finalize Odoo Staging configuration (resolve temporary dependencies)
- [ ] Mark Staging deployment as verified
- [ ] Deploy Odoo Production to Production EC2 (57.180.39.58)
- [ ] Configure multi-tenant routing (admin.erp.seisei.tokyo, *.erp.seisei.tokyo)
- [ ] Test database connectivity to Production RDS
- [ ] Verify all custom modules load correctly
- [ ] Test login and basic functionality
- [ ] Run smoke tests

**Success Criteria**: Odoo accessible via demo.nagashiro.top with all modules functional

### Phase 6: BizNexus Application
**Target**: BizNexus (Next.js wrapper around Odoo)

- [ ] Build BizNexus image via GitHub Actions
- [ ] Deploy BizNexus to Staging EC2
- [ ] Verify database connectivity (shares Odoo database)
- [ ] Test login and basic functionality
- [ ] Deploy BizNexus to Production EC2
- [ ] Configure domain routing (biznexus.seisei.tokyo, erp.seisei.tokyo)
- [ ] Run end-to-end tests

**Success Criteria**: BizNexus accessible via biznexus.seisei.tokyo with full functionality

### Phase 7: Website & Additional Services
**Target**: seisei-www

- [ ] Deploy seisei-www to Staging EC2
- [ ] Deploy seisei-www to Production EC2
- [ ] Configure domain routing (seisei.tokyo, www.seisei.tokyo)
- [ ] Verify static content serving
- [ ] Test page load performance

**Success Criteria**: Main website accessible via seisei.tokyo

### Phase 8: DNS Cutover & Monitoring
**Target**: Production cutover

- [ ] Create DNS cutover plan with rollback procedures
- [ ] Set low TTL values on DNS records (1 minute)
- [ ] Update DNS records to point to new Production EC2 (57.180.39.58)
- [ ] Monitor service health for 24 hours
- [ ] Verify all domains resolving correctly
- [ ] Run full smoke test suite
- [ ] Document any issues
- [ ] Increase DNS TTL back to normal (1 hour)

**Success Criteria**: All services operational on new infrastructure with zero errors

### Phase 9: Cleanup & Documentation
**Target**: Finalize migration

- [ ] Archive old server backups
- [ ] Update runbooks with new infrastructure details
- [ ] Create disaster recovery procedures
- [ ] Document rollback procedures
- [ ] Schedule old server decommissioning (keep for 30 days)
- [ ] Update monitoring dashboards
- [ ] Create post-migration report

**Success Criteria**: Complete documentation and old server ready for decommissioning

---

## 6. Rollback Strategy

**At any point during migration**, rollback is possible:

1. **DNS-based Rollback**: Update DNS records back to 54.65.127.141
2. **Database Rollback**: Original seisei-db remains intact during migration
3. **Service Rollback**: Original containers remain running until DNS cutover

**Rollback Time**: < 5 minutes (DNS propagation time)

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Database migration data loss | Low | Critical | Multiple backups, verification checks |
| GHCR authentication failure | Medium | High | Test authentication before migration |
| DNS propagation delays | High | Low | Use low TTL values, test before cutover |
| SSL certificate issues | Medium | Medium | Pre-configure certificates, test acquisition |
| Service dependency failures | Low | High | Deploy in correct dependency order |
| Traefik routing misconfiguration | Medium | Medium | Test routing on staging first |

---

## 8. Success Metrics

- **Zero Data Loss**: All databases migrated with verified integrity
- **Zero Downtime**: Services remain accessible throughout migration
- **Performance**: Response times ≤ current baseline
- **Security**: All hardcoded passwords eliminated
- **Automation**: All deployments via GitHub Actions
- **Observability**: Full deployment history and audit logging

---

## 9. Timeline Estimate

| Phase | Estimated Duration | Dependencies |
|-------|-------------------|--------------|
| Phase 1: Auth & Security | 2 hours | None |
| Phase 2: Database Migration | 3 hours | Phase 1 |
| Phase 3: Edge Infrastructure | 4 hours | Phase 1 |
| Phase 4: Supporting Services | 2 hours | Phase 1, 3 |
| Phase 5: Odoo Production | 4 hours | Phase 1, 2, 3, 4 |
| Phase 6: BizNexus | 3 hours | Phase 5 |
| Phase 7: Website | 2 hours | Phase 3 |
| Phase 8: DNS Cutover | 1 hour | All previous |
| Phase 9: Cleanup | 2 hours | Phase 8 |

**Total Estimated Duration**: 23 hours (spread over 3-4 days)

---

## 10. Immediate Next Steps

1. **Create GitHub PAT** with required scopes
2. **Configure GHCR authentication** on both EC2 instances
3. **Test custom image pull** to verify authentication
4. **Begin Phase 2**: Database migration to Staging RDS

**Blocker Resolution**: GHCR authentication is the critical path blocking all subsequent work.

---

## Appendix A: Environment Variables Inventory

**Required for all stacks**:
- `IMAGE_REF` - Digest-pinned image reference
- `DB_HOST` - RDS endpoint
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password (from SSM)
- `REDIS_PASSWORD` - Redis password (from SSM)
- `ADMIN_PASSWD` - Odoo admin password (from SSM)

**Service-specific**:
- `SEISEI_S3_BUCKET` - S3 bucket name
- `SEISEI_S3_ACCESS_KEY` - IAM access key
- `SEISEI_S3_SECRET_KEY` - IAM secret key
- `OCR_SERVICE_URL` - OCR service endpoint
- `OCR_SERVICE_KEY` - OCR service API key

---

**Document Version**: 1.0
**Last Updated**: 2026-02-01 03:00 UTC
**Status**: ✅ Assessment Complete, Ready for Phase 1 Execution
