#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "== Content Factory Repo Clutter Audit =="
echo "root: $ROOT_DIR"
echo "time: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo

echo "## Top-level size (Top 25)"
du -sh * .[!.]* 2>/dev/null | sort -hr | head -n 25
echo

echo "## Root artifact candidates (archives/logs)"
find . -maxdepth 1 -type f \
  \( -name "*.tar" -o -name "*.tar.gz" -o -name "*.zip" -o -name "build.log" \) \
  -print | sed 's|^\./||' || true
echo

echo "## Runtime log/pid candidates"
find runs -maxdepth 1 -type f \( -name "*.log" -o -name "*.pid" -o -name "system-style-presets-backup-*.json" \) -print 2>/dev/null || true
echo

echo "## Extension source duplicates"
find workflows -maxdepth 2 -type d -name "nextide-extension-v0.1.2*" | sort || true
echo

echo "## Marketing/side-project copies (excluded from ts/eslint)"
for path in nextide-site digital_human_miniapp nextide0323; do
  if [ -e "$path" ]; then
    du -sh "$path" 2>/dev/null
  fi
done
echo

echo "## Potential legacy pages"
for f in \
  "app/(main)/content/page.tsx"; do
  if [ -f "$f" ]; then
    echo "$f"
  fi
done
echo

echo "## Debug/test/internal API routes"
find app/api -name "route.ts" | sort | rg -n "debug|chat-test|internal|admin/sync-tasks" -N || true
echo

echo "## Notes"
echo "- This script is read-only. It never deletes files."
echo "- For cleanup strategy, read docs/CLEANUP_AUDIT_2026-03-24.md"
