# Automation Roadmap (Issue -> AI -> PR -> Deploy)

## Scope
This repository uses GitHub Actions as the system of record for automation.
The goal is to move from issue intake to AI-assisted code changes, then staged deployments.

## Phase 1 (Now): Issue -> Draft PR
- Label `ready-for-dev` on a complete issue form.
- Workflow `Issue to PR Framework` creates a draft PR on `auto/issue-<id>`.

## Phase 2 (Now): AI Execution (Self-Hosted Runner)
- Label `ai-run` on the issue to trigger `AI Run (Self-Hosted)`.
- The workflow runs on a self-hosted runner labeled `ai-executor`.
- Runner executes the command set in **Repo Settings → Actions → Variables**:
  - `AI_RUN_CMD`
- The command receives these environment variables:
  - `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_URL`
- If changes are produced, they are committed to `auto/issue-<id>`.

### Runner Setup (Owner)
1. Create a **self-hosted runner** (non-production machine).
2. Assign label: `ai-executor`.
3. Ensure the runner has required tools (git, build tools, etc.).
4. Define `AI_RUN_CMD` in repo variables (not secrets).

## Phase 3: Human Review
- PR must be approved by Code Owners.
- No direct merge without review.

## Phase 4: Deploy (Existing CICD)
This repo already has full CICD. Do **not** modify `deploy.yml`.
Use the existing workflow:
- **Actions → Deploy to Environment** (`deploy.yml`)
- Deploy to **staging** first, verify, then deploy to **production**.
- Production deployment remains manual and protected by environment gates.

## Safety Rules
- No production secrets in automation logs.
- No automatic production deployment.
- All automated changes must be auditable via PR history.
