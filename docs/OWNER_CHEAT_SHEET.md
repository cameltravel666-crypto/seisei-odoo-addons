# Owner Cheat Sheet / Owner 速查表

## 1) What to Approve / 需要审批什么
- Production changes / 生产变更
- Risk level P0/P1/P2 / 风险等级
- Rollback plan / 回滚方案

## 2) What to Reject / 需要拒绝什么
- Unclear scope / 范围不清
- Missing verification / 无验证步骤
- Missing rollback / 无回滚方案
- Any secrets in docs or PR / 文档或PR含密钥

## 3) Minimum Evidence / 最低证据
- CI results / CI 结果
- Staging validation / 预发布验证
- Logs or screenshots (no secrets) / 日志或截图（不含密钥）

## 4) Escalation / 升级
- P0: stop release / P0：停止发布
- P1: require mitigation / P1：要求缓解
- P2: proceed with monitoring / P2：监控下推进

## Label-Driven Rules / 标签驱动规则
- Always set `type/*`, `priority/*`, and `env/*` labels.
- If `env/production` or `priority/P0`/`priority/P1`, add `status/needs-owner-approval`.
- Use `status/blocked` to stop progress until required info is provided.
- Apply `status/ready-for-merge` only after checks and approvals are complete.
- Use `area/*` and `compliance/*` labels to route review and verify constraints.
