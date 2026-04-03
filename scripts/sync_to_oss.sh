#!/usr/bin/env bash
# sync_to_oss.sh — 本地扫描文件夹同步到 Aliyun OSS → 服务器 ossfs 自动挂载
#
# 用法:
#   ./sync_to_oss.sh /path/to/local/folder [客户名称]
#
# 文件夹结构:
#   /path/to/local/folder/
#     ├── 2026-03/
#     │   ├── IMG_001.jpg
#     │   └── IMG_002.pdf
#     └── IMG_003.png
#
# 同步目标: oss://nagashiro-prod/ocr_inbox/客户名称/...
# 服务器 ossfs 挂载点: /var/lib/odoo/ocr_inbox/ → Odoo cron 自动扫描导入
#
# 前提:
#   brew install ossutil  (或从阿里云下载)
#   ossutil config -e oss-ap-southeast-1-internal.aliyuncs.com -i <AccessKeyID> -k <AccessKeySecret>
#
# 注意: 使用公网端点上传 (oss-ap-southeast-1.aliyuncs.com)
#       服务器内网端点免流量费 (oss-ap-southeast-1-internal.aliyuncs.com)

set -euo pipefail

OSS_BUCKET="oss://nagashiro-prod"
OSS_INBOX_PREFIX="ocr_inbox"
# 公网端点 (本地上传用)
OSS_ENDPOINT="oss-ap-southeast-1.aliyuncs.com"

usage() {
    echo "用法: $0 <本地文件夹路径> [客户名称]"
    echo ""
    echo "示例:"
    echo "  $0 ~/Desktop/永代商事-3月 永代商事"
    echo "  $0 ~/Desktop/receipts              # 不指定客户 → 直接放 ocr_inbox 根目录"
    echo ""
    echo "前提: ossutil 已安装并配置好 AccessKey"
    exit 1
}

# --- 参数检查 ---
if [ $# -lt 1 ]; then
    usage
fi

LOCAL_DIR="$1"
CLIENT_NAME="${2:-}"

if [ ! -d "$LOCAL_DIR" ]; then
    echo "错误: 目录不存在: $LOCAL_DIR"
    exit 1
fi

# --- 检查 ossutil ---
if ! command -v ossutil &>/dev/null; then
    echo "错误: ossutil 未安装"
    echo "安装: brew install ossutil"
    echo "配置: ossutil config -e $OSS_ENDPOINT -i <AK_ID> -k <AK_SECRET>"
    exit 1
fi

# --- 构建目标路径 ---
if [ -n "$CLIENT_NAME" ]; then
    OSS_TARGET="${OSS_BUCKET}/${OSS_INBOX_PREFIX}/${CLIENT_NAME}/"
else
    OSS_TARGET="${OSS_BUCKET}/${OSS_INBOX_PREFIX}/"
fi

# --- 统计文件数 ---
FILE_COUNT=$(find "$LOCAL_DIR" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.gif' -o -iname '*.pdf' \) | wc -l | tr -d ' ')

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "没有找到支持的文件 (jpg/png/pdf/webp/bmp/gif)"
    exit 0
fi

echo "=== OCR 文件同步到 OSS ==="
echo "本地目录: $LOCAL_DIR"
echo "目标路径: $OSS_TARGET"
echo "文件数量: $FILE_COUNT"
echo ""

# --- 确认 ---
read -p "确认同步? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

# --- 同步 (只上传新文件，不删除远程已有文件) ---
echo ""
echo "开始同步..."
ossutil cp -r "$LOCAL_DIR" "$OSS_TARGET" \
    -e "$OSS_ENDPOINT" \
    --include "*.jpg" --include "*.jpeg" --include "*.png" \
    --include "*.webp" --include "*.bmp" --include "*.gif" \
    --include "*.pdf" \
    --include "*.JPG" --include "*.JPEG" --include "*.PNG" --include "*.PDF" \
    -u \
    --jobs 5

echo ""
echo "同步完成! $FILE_COUNT 个文件 → $OSS_TARGET"
echo "服务器 Odoo cron 将在下一个周期自动扫描并导入"
