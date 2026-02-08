# Automation Roadmap / 自动化路线图

## Purpose / 目的
Establish a safe, auditable framework for Issue → Draft PR automation. / 建立可审计、可回滚的 Issue → Draft PR 自动化框架。

## Phase 1 (Current) / 当前阶段
- Trigger: `issues` labeled with `ready-for-dev`
- Validate required fields: Goal/Scope/Acceptance/Risk
- Create a **draft** PR with:
  - `Closes #<issue>`
  - Issue context quote
  - Execution plan template
- No code execution, no external model calls
- Uses only `GITHUB_TOKEN`

## Phase 2 (Next) / 下一阶段
- Integrate local Codex executor (out of scope for this PR)
- Proposed flow:
  1. Draft PR created by workflow
  2. Codex executor pulls issue + repo context
  3. Codex produces plan + minimal commits
  4. Human review and approvals required before merge

## Audit & Rollback / 审计与回滚
- All actions logged in GitHub Actions
- Remove workflow file to disable automation
- Draft PRs can be closed without impact
