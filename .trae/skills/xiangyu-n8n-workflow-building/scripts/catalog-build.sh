#!/usr/bin/env zsh
# ============================================================
# n8n Catalog Builder v2.0
# 从 n8n 源码 dist/ 提取节点目录索引 + 凭证映射
# 多包支持：nodes-base + @n8n/nodes-langchain
# ============================================================
set -euo pipefail

# ── 路径配置 ──────────────────────────────────────────────────
N8N_ROOT="${N8N_ROOT:?ERROR: 请设置 N8N_ROOT 环境变量}"
NODES_BASE_DIST="$N8N_ROOT/packages/nodes-base/dist"
LANGCHAIN_DIST="$N8N_ROOT/packages/@n8n/nodes-langchain/dist"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$SKILL_DIR/reference/catalog"

# ── 前置检查 ──────────────────────────────────────────────────
for pkg_dir in "$NODES_BASE_DIST" "$LANGCHAIN_DIST"; do
  pkg_name=$(basename "$(dirname "$pkg_dir")")
  if [[ ! -d "$pkg_dir/known" ]]; then
    echo "ERROR: $pkg_name/dist/known/ 不存在，请先构建 n8n" >&2
    echo "  cd $N8N_ROOT && pnpm build" >&2
    exit 1
  fi
  for f in nodes.json credentials.json; do
    if [[ ! -f "$pkg_dir/known/$f" ]]; then
      echo "ERROR: $pkg_dir/known/$f 不存在" >&2
      exit 1
    fi
  done
done

# ── 获取 n8n 版本信息 ────────────────────────────────────────
N8N_VERSION=$(node -e "console.log(require('$N8N_ROOT/package.json').version)" 2>/dev/null || echo "unknown")
N8N_COMMIT=$(cd "$N8N_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date '+%Y-%m-%d %H:%M:%S')

echo "=== n8n Catalog Builder v2.0 ==="
echo "  n8n: v$N8N_VERSION ($N8N_COMMIT)"
echo "  nodes-base: $NODES_BASE_DIST"
echo "  langchain:  $LANGCHAIN_DIST"
echo "  输出: $OUTPUT_DIR"
echo ""

# ── 确保输出目录存在 ──────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

# ── 执行 Node.js 构建逻辑 ────────────────────────────────────
node "$SCRIPT_DIR/catalog-build.mjs" \
  "$NODES_BASE_DIST" \
  "$LANGCHAIN_DIST" \
  "$OUTPUT_DIR" \
  "$N8N_VERSION" \
  "$N8N_COMMIT" \
  "$BUILD_TIME"

# ── 输出统计 ──────────────────────────────────────────────────
echo ""
echo "=== 构建完成 ==="

NODES_FILE="$OUTPUT_DIR/nodes-catalog.md"
CREDS_FILE="$OUTPUT_DIR/credentials-map.md"

if [[ -f "$NODES_FILE" ]]; then
  NODES_LINES=$(wc -l < "$NODES_FILE" | tr -d ' ')
  NODES_SIZE=$(du -h "$NODES_FILE" | cut -f1 | tr -d ' ')
  echo "  nodes-catalog.md: $NODES_LINES 行 ($NODES_SIZE)"
fi

if [[ -f "$CREDS_FILE" ]]; then
  CREDS_LINES=$(wc -l < "$CREDS_FILE" | tr -d ' ')
  CREDS_SIZE=$(du -h "$CREDS_FILE" | cut -f1 | tr -d ' ')
  echo "  credentials-map.md: $CREDS_LINES 行 ($CREDS_SIZE)"
fi

TOTAL_SIZE=$(du -ch "$OUTPUT_DIR"/*.md 2>/dev/null | tail -1 | cut -f1 | tr -d ' ')
echo "  总体积: $TOTAL_SIZE"
echo ""
echo "  版本: n8n v$N8N_VERSION ($N8N_COMMIT)"
echo "  时间: $BUILD_TIME"
