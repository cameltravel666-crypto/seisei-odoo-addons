#!/usr/bin/env bash
set -euo pipefail

SUMMARY_FILE="/tmp/ai_run_summary.md"
: > "$SUMMARY_FILE"

append() {
  printf "%s\n" "$*" >> "$SUMMARY_FILE"
}

result="success"

repo="${GITHUB_REPOSITORY:-unknown}"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
branch="${branch:-${GITHUB_REF_NAME:-unknown}}"
sha="$(git rev-parse HEAD 2>/dev/null || true)"
sha="${sha:-${GITHUB_SHA:-unknown}}"

issue_number="${ISSUE_NUMBER:-}"
if [ -z "$issue_number" ] && [[ "$branch" =~ ^auto/issue-([0-9]+)$ ]]; then
  issue_number="${BASH_REMATCH[1]}"
fi

pr_number="${PR_NUMBER:-}" 

append "## AI Run Summary / AI 执行摘要"
append "- Repo / 仓库: ${repo}"
append "- Branch / 分支: ${branch}"
append "- Commit / 提交: ${sha}"
append "- Issue / 问题: ${issue_number:-N/A}"
append "- PR / 合并请求: ${pr_number:-N/A}"
append ""

append "### Safe Environment / 安全环境变量"
SAFE_ENV_VARS=(
  GITHUB_REPOSITORY
  GITHUB_RUN_ID
  GITHUB_RUN_NUMBER
  GITHUB_WORKFLOW
  GITHUB_REF
  GITHUB_REF_NAME
  GITHUB_HEAD_REF
  GITHUB_SHA
  RUNNER_NAME
  RUNNER_OS
  RUNNER_ARCH
  ISSUE_NUMBER
  ISSUE_TITLE
  ISSUE_URL
  PR_NUMBER
)
for var in "${SAFE_ENV_VARS[@]}"; do
  value="${!var:-}"
  if [ -n "$value" ]; then
    append "- ${var}=${value}"
  fi
done
append ""

append "### Pre-flight / 预检查"
if [ -n "$(git status --porcelain)" ]; then
  append "- FAIL: Working tree is not clean. 请先确保工作目录干净。"
  result="fail"
else
  append "- OK: Working tree is clean."
fi

append ""
append "### Lightweight Checks / 轻量校验"
if [ -d ".github/workflows" ]; then
  append "- OK: .github/workflows present"
else
  append "- FAIL: .github/workflows missing"
  result="fail"
fi

if [ -d "scripts" ]; then
  append "- OK: scripts/ present"
else
  append "- FAIL: scripts/ missing"
  result="fail"
fi

if [ -f "package.json" ] && command -v node >/dev/null 2>&1; then
  if node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" >/dev/null 2>&1; then
    append "- OK: package.json is valid JSON"
  else
    append "- FAIL: package.json is invalid"
    result="fail"
  fi
else
  append "- SKIP: package.json validation (file or node missing)"
fi

if [ -f "pyproject.toml" ] && command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY' >/dev/null 2>&1
import sys
try:
    import tomllib  # py3.11+
except Exception:
    sys.exit(0)
with open('pyproject.toml','rb') as f:
    tomllib.load(f)
PY
  then
    append "- OK: pyproject.toml parsed by tomllib"
  else
    append "- FAIL: pyproject.toml parse failed"
    result="fail"
  fi
else
  append "- SKIP: pyproject.toml validation (file or tomllib missing)"
fi

append ""
append "### Execution / 执行"
append "- This run uses AI_RUN_CMD to execute automation on the runner."
append "- 当前为最小可运行闭环，仅输出摘要，不强制修改代码。"
append ""

append "### Result / 结果"
append "- ${result}"

append ""
append "### Next Steps / 下一步"
append "- If changes were produced, review the draft PR and request approval."
append "- 如无变更，检查 Issue 需求是否完整，或完善 AI_RUN_CMD 行为。"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -f "$SUMMARY_FILE" ]; then
  cat "$SUMMARY_FILE" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$result" != "success" ]; then
  echo "::error::AI run pre-flight checks failed."
  exit 1
fi
