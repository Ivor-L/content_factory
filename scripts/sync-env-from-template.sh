#!/bin/sh
set -eu

TEMPLATE_FILE="${1:-.env.production.example}"
TARGET_FILE="${2:-.env}"

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "[env-sync] ERROR: template file not found: $TEMPLATE_FILE" >&2
  exit 1
fi

if [ ! -f "$TARGET_FILE" ]; then
  echo "[env-sync] ERROR: target env file not found: $TARGET_FILE" >&2
  exit 1
fi

normalize_default() {
  value="$1"

  # remove surrounding quotes
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  # placeholders should not be copied into real env values
  case "$value" in
    "" | "<"*">" | *"<project-ref>"* | *"<database-password>"* | "your-upstream-key" | "replace-me" | "changeme")
      printf '%s' ""
      return 0
      ;;
  esac

  printf '%s' "$value"
}

ADDED=0

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "" | "#"*) continue ;;
  esac

  case "$line" in
    *=*)
      key="${line%%=*}"
      raw_value="${line#*=}"
      ;;
    *)
      continue
      ;;
  esac

  # trim spaces around key
  key="$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [ -z "$key" ]; then
    continue
  fi

  # only accept valid env var names
  case "$key" in
    [A-Za-z_][A-Za-z0-9_]*)
      ;;
    *)
      continue
      ;;
  esac

  if grep -q "^${key}=" "$TARGET_FILE"; then
    continue
  fi

  value="$(normalize_default "$raw_value")"
  printf '\n%s=%s\n' "$key" "$value" >> "$TARGET_FILE"
  echo "[env-sync] Added missing key: $key"
  ADDED=$((ADDED + 1))
done < "$TEMPLATE_FILE"

echo "[env-sync] Completed. Added $ADDED missing key(s) into $TARGET_FILE."
