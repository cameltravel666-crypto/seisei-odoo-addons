# Release Runbook

## Release Flow (Staging -> Production)
1. Open a PR with all changes. Merge only after review and required checks pass.
2. Deploy to staging.
3. Complete acceptance checks (see below).
4. Deploy to production only after staging is verified and approvals are complete.

## Pre-Release Checklist
- CI is green for the PR.
- Scope and risk level are documented (P0/P1/P2).
- Change set is reviewed and approved.
- Data backup readiness confirmed (as applicable).
- Rollback path confirmed and documented.

## Acceptance Steps (Non-Technical)
- Confirm the target environment loads correctly.
- Validate one critical user flow end-to-end.
- Verify logs show no new errors during the validation window.
- If any issue appears, stop and request rollback.

## Rollback Process
- Preferred: revert the PR and redeploy.
- Alternative: use rollback workflow or rollback script as documented.
- Data recovery is out of scope for this runbook and must follow the backup procedures.

## Incident Response
- Approval: designated repo owner or on-call approves release/rollback.
- Notification: inform stakeholders and post status update.
- Freeze: pause further releases until the incident is resolved.

## Workflow Map and Migration Path
- Legacy deployment workflow: `.github/workflows/deploy.yml` (unchanged, contains real deployment logic).
- Framework workflow: `.github/workflows/deploy_framework.yml` (structure only; no production server details or secrets).
- Secrets: configure required environment secrets in GitHub Environments; names should align with the legacy workflow and existing deployment scripts.
- Migration path: move production deployment steps into the framework once approvals and secrets are configured, then retire the legacy workflow.
