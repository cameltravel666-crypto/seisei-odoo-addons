# Owner Operating Manual / Owner 操作手册

## Role Definition / 角色定义
- Owner does **not** write code. / Owner **不写代码**。
- Owner focuses on approvals, risk decisions, and release gates. / Owner 负责审批、风险决策与发布放行。

## Responsibilities / 职责
- Approve or reject production changes / 审批或拒绝生产变更
- Confirm risk level (P0/P1/P2) / 确认风险等级
- Ensure rollback plan exists / 确认有回滚方案
- Ensure no secrets are exposed / 确保无密钥泄露

## Approval Checklist / 审批清单
- Summary is clear / 摘要清楚
- Scope is limited / 范围可控
- Risk rated with rationale / 风险等级有理由
- Verification steps are defined / 有验证步骤
- Rollback plan is defined / 有回滚方案
- Evidence attached (no secrets) / 有证据且不含密钥

## Escalation / 升级路径
- P0: Stop release immediately / P0：立即停止发布
- P1: Require mitigation or rollback plan / P1：必须有缓解或回滚
- P2: Can proceed with monitoring / P2：可在监控下推进

## Do-Not-Do / 禁止事项
- Do not add or request secrets in GitHub / 不在 GitHub 中添加或索要密钥
- Do not approve if scope is unclear / 范围不清不批准
- Do not bypass required reviews / 不绕过必需审核
