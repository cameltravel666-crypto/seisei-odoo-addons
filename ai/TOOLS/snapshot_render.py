#!/usr/bin/env python3
# snapshot_render.py - 把 raw 信号渲染为标准 SYNC_SNAPSHOT
# Encoding: UTF-8
# 作用：读取 raw 信号文件，渲染为 Markdown 格式的快照

import os
import sys
import json
import glob
from datetime import datetime
from pathlib import Path

# 配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
SNAPSHOT_DIR = PROJECT_ROOT / "ai" / "SNAPSHOT"
RAW_DIR = SNAPSHOT_DIR / "raw"
OUTPUT_FILE = SNAPSHOT_DIR / "SYNC_SNAPSHOT.latest.md"

def mask_secrets(text: str) -> str:
    """脱敏函数：替换敏感信息"""
    import re
    patterns = [
        (r'(?i)(api[_-]?key|token|secret|password|auth)[=:]\s*["\']?[^"\'\s]+["\']?', r'\1=***MASKED***'),
    ]
    masked = text
    for pattern, replacement in patterns:
        masked = re.sub(pattern, replacement, masked)
    return masked

def read_raw_file(file_path: Path) -> str:
    """读取 raw 文件并脱敏"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return mask_secrets(content)
    except Exception as e:
        return f"Error reading {file_path}: {e}"

def render_snapshot() -> str:
    """渲染快照内容"""
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    
    # 读取 raw 文件
    raw_files = sorted(glob.glob(str(RAW_DIR / "*.txt")))
    
    sections = []
    sections.append(f"# SYNC_SNAPSHOT.latest.md\n\n> Encoding: UTF-8\n> 最后更新: {timestamp}\n\n---\n\n")
    
    # A) Gate2 Record
    sections.append("## A) Gate2 Record（Gate2 记录）\n\n")
    sections.append("| ID | 操作 | 状态 | 证据摘要 |\n")
    sections.append("|----|------|------|----------|\n")
    sections.append("| G2-XXX | [操作描述] | ⏳ PENDING | [证据摘要] |\n\n")
    
    # B) Next Actions
    sections.append("## B) Next Actions（下一步行动）\n\n")
    sections.append("| 优先级 | 任务 | 负责人 | 状态 |\n")
    sections.append("|--------|------|--------|------|\n")
    sections.append("| P0 | [任务描述] | @username | ⏳ PENDING |\n\n")
    
    # C) Risks
    sections.append("## C) Risks（风险）\n\n")
    sections.append("| 风险 | 严重程度 | 状态 | 缓解措施 |\n")
    sections.append("|------|----------|------|----------|\n")
    sections.append("| [风险描述] | HIGH / MEDIUM / LOW | ⏳ OPEN | [缓解措施] |\n\n")
    
    # D) System Map
    sections.append("## D) System Map（系统地图）\n\n")
    sections.append("### Raw Signals（原始信号）\n\n")
    
    for raw_file in raw_files[-10:]:  # 只显示最近 10 个文件
        file_name = os.path.basename(raw_file)
        content = read_raw_file(Path(raw_file))
        sections.append(f"#### {file_name}\n\n")
        sections.append("```\n")
        sections.append(content[:500] + ("..." if len(content) > 500 else ""))
        sections.append("\n```\n\n")
    
    # E) Run Commands/URLs
    sections.append("## E) Run Commands/URLs（运行命令/URL）\n\n")
    sections.append("### 健康检查命令\n\n")
    sections.append("```bash\n")
    sections.append("# 服务 1\n")
    sections.append("curl http://localhost:PORT/health\n\n")
    sections.append("```\n\n")
    
    return "".join(sections)

def main():
    """主函数"""
    # 确保目录存在
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    
    # 渲染快照
    snapshot_content = render_snapshot()
    
    # 写入文件
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(snapshot_content)
    
    print(f"快照已生成: {OUTPUT_FILE}")
    print(f"文件大小: {len(snapshot_content)} 字节")

if __name__ == "__main__":
    main()

