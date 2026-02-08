# Label Policy / 标签规范

## Purpose / 目的
Define a consistent label taxonomy to drive approvals, risk handling, and release gates. / 通过统一标签体系驱动审批、风险处理与发布放行。

## Label Taxonomy / 标签分类
- `type/*` for work type / 工作类型
- `priority/*` for impact severity / 影响等级
- `env/*` for environment scope / 环境范围
- `area/*` for domain ownership / 领域归属
- `status/*` for workflow state / 流程状态
- `compliance/*` for compliance constraints / 合规约束

## Label Definitions / 标签定义
| Label | Color | Meaning | Trigger | Owner Responsibility |
| --- | --- | --- | --- | --- |
| `type/bug` | `d73a4a` | Defect or outage fix | Bug report or incident | Confirm severity, require fix plan |
| `type/feature` | `a2eeef` | New capability | Feature request | Confirm scope and risk |
| `type/docs` | `0075ca` | Documentation change | Docs-only updates | Ensure accuracy, approve fast |
| `type/chore` | `bfdadc` | Maintenance/task | Non-feature maintenance | Ensure low risk |
| `priority/P0` | `b60205` | Critical outage/data risk | Production down, data loss | Stop release, require rollback plan |
| `priority/P1` | `d93f0b` | High impact | Major degradation | Require mitigation and verification |
| `priority/P2` | `fbca04` | Medium/low impact | Minor issue | Can batch with routine release |
| `env/production` | `e11d21` | Production scope | Any prod change | Require Owner approval |
| `env/staging` | `0e8a16` | Staging scope | Staging-only change | Ensure parity constraints |
| `area/finance` | `5319e7` | Finance domain | Finance workflow | Confirm compliance and data handling |
| `area/security` | `ee0701` | Security-related | Auth, secrets, access | Require security review |
| `area/infra` | `0052cc` | Infra/platform | Networking, DB, storage | Confirm change window |
| `status/needs-owner-approval` | `fbca04` | Awaiting Owner approval | Prod scope or P0/P1 | Owner must approve or reject |
| `status/blocked` | `000000` | Blocked | Missing info/dep | Owner ensures unblock plan |
| `status/ready-for-merge` | `0e8a16` | Ready to merge | Checks + approvals done | Owner verifies completion |
| `compliance/data-privacy` | `f9d0c4` | PII/regulated data | Any PII scope | Confirm masking/retention |

## Label-Driven Workflow / 标签驱动流程
- Always add one `type/*` label and one `priority/*` label.
- Add `env/production` or `env/staging` based on scope.
- If `env/production` or `priority/P0`/`priority/P1`, add `status/needs-owner-approval`.
- Add `area/*` labels to route ownership and review.
- Use `status/blocked` to halt progress until requirements are met.
- Apply `status/ready-for-merge` only after checks pass and approvals are complete.

## UI Creation Checklist / UI 创建清单
If labels are missing, Owner should create them in GitHub UI with the names and colors above. / 如标签不存在，Owner 需在 GitHub UI 中按上述名称与颜色创建。
