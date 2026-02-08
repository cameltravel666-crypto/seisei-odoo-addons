# AI Executor Manual (Owner) / AI 执行器手册（Owner）

## Owner 3 Steps / Owner 三步
1. Create or update an Issue with complete fields (Goal, Scope, Acceptance, Risk). / 创建或完善 Issue，确保 Goal/Scope/Acceptance/Risk 填写完整。
2. Add label `ready-for-dev` to auto-create a draft PR on `auto/issue-<id>`. / 打 `ready-for-dev` 标签以生成 draft PR。
3. Add label `ai-run` to trigger the AI Run workflow, then review the draft PR and request approval. / 再打 `ai-run` 标签触发 AI 执行，审核 draft PR 并申请审批。

## Set AI_RUN_CMD / 设置 AI_RUN_CMD
- Path: `Settings → Actions → Variables → New repository variable`.
- Name: `AI_RUN_CMD`
- Value example: `bash scripts/ai_run.sh`

## Safety Boundaries / 安全边界
- No production deploys are executed automatically. / 不会自动执行生产部署。
- No changes to `deploy.yml` or production connection logic. / 不修改 `deploy.yml` 或生产连接逻辑。
- No secrets are printed in logs or summaries. / 不会在日志或摘要中输出任何密钥。
- All changes are auditable via PR history. / 所有变更可通过 PR 历史审计。

## Runner Label Requirement / Runner 标签要求
- Workflow runs on `runs-on: [self-hosted, staging-ai-executor]`.
- Ensure the runner is configured with label `staging-ai-executor`.
- If you need to add the label, re-run runner config with `--labels ai-executor,staging-ai-executor`.

## Troubleshooting / 常见问题
- Runner offline: check `Settings → Actions → Runners` for status. / Runner 离线：检查 Runners 页面状态。
- Missing auto branch: add `ready-for-dev` first to create `auto/issue-<id>`. / 找不到分支：先打 `ready-for-dev`。
- AI_RUN_CMD not set: set repo variable and re-run workflow. / 未设置 AI_RUN_CMD：设置变量后重跑。
- No PR comment: PR may not exist or permissions are limited; check Actions Summary. / 无 PR 评论：可能无 PR 或权限不足，查看 Actions Summary。
