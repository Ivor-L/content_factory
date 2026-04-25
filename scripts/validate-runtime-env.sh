#!/bin/sh
set -eu

MODE="runtime"
PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"

for arg in "$@"; do
  case "$arg" in
    --mode=build) MODE="build" ;;
    --mode=runtime) MODE="runtime" ;;
  esac
done

MISSING=0
WARNINGS=0

log_err() {
  echo "[env-check] ERROR: $1" >&2
}

log_warn() {
  echo "[env-check] WARN: $1" >&2
}

get_env() {
  name="$1"
  eval "value=\${$name-}"
  if [ -n "${value:-}" ]; then
    printf '%s' "$value"
    return 0
  fi

  if [ -f "$ENV_FILE" ]; then
    # Read value from .env without executing it in shell.
    line="$(grep -E "^[[:space:]]*${name}=" "$ENV_FILE" | tail -n 1 || true)"
    if [ -n "$line" ]; then
      value="${line#*=}"
      # trim CR for files edited on Windows
      value="$(printf '%s' "$value" | tr -d '\r')"
      # strip optional surrounding quotes
      case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
      esac
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' ""
}

is_placeholder() {
  value="$1"
  case "$value" in
    "" | "\"\"" | "''" | "<"*">" | *"<project-ref>"* | *"<database-password>"* | "your-upstream-key" | "replace-me" | "changeme")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_var() {
  name="$1"
  label="$2"
  value="$(get_env "$name")"
  if is_placeholder "$value"; then
    log_err "$label ($name) is missing or still placeholder."
    MISSING=$((MISSING + 1))
  fi
}

require_any() {
  label="$1"
  shift
  found=""
  for name in "$@"; do
    value="$(get_env "$name")"
    if ! is_placeholder "$value"; then
      found="$name"
      break
    fi
  done

  if [ -z "$found" ]; then
    names="$(printf '%s' "$1")"
    shift
    for name in "$@"; do
      names="$names / $name"
    done
    log_err "$label is missing. Set one of: $names"
    MISSING=$((MISSING + 1))
  fi
}

warn_if_missing() {
  name="$1"
  label="$2"
  value="$(get_env "$name")"
  if is_placeholder "$value"; then
    log_warn "$label ($name) is empty; related feature may fail at runtime."
    WARNINGS=$((WARNINGS + 1))
  fi
}

echo "[env-check] Running env validation (mode=$MODE)..."

require_var "DATABASE_URL" "Database connection"
require_var "DIRECT_URL" "Database direct connection"
require_var "NEXT_PUBLIC_SUPABASE_URL" "Supabase URL"
require_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" "Supabase anon key"
require_var "NEXT_PUBLIC_APP_URL" "App public URL"
require_var "ADMIN_TOKEN" "Webhook admin token"
require_var "N8N_CALLBACK_BASE_URL" "n8n callback base URL"
require_var "N8N_IMAGE_GEN_WEBHOOK" "Storyboard image generation webhook"
require_any "Storyboard video generation webhook" "N8N_VIDEO_GEN_WEBHOOK" "N8N_VEO3_WEBHOOK"

# Social scraper dependencies (TikTok/Facebook/Instagram)
require_any "Apify token for social scraper" "SOCIAL_SCRAPER_APIFY_TOKEN" "APIFY_API_TOKEN" "APIFY_TOKEN"
require_any "Social scraper webhook URL" "N8N_SOCIAL_SCRAPER_WEBHOOK" "SOCIAL_SCRAPER_WEBHOOK_URL"
require_var "REDNOTE_API_KEY" "Rednote publish API key"

# High-impact feature keys (warn only)
warn_if_missing "CLOUD_API_KEY" "Cloud LLM API key"
warn_if_missing "CANVAS_UPSTREAM_DEFAULT_API_KEY" "Canvas default upstream key"
warn_if_missing "NEXAPI_UPSTREAM_KEY" "NexAPI upstream key"

if [ "$MISSING" -gt 0 ]; then
  echo "[env-check] FAILED: $MISSING required config item(s) missing." >&2
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  echo "[env-check] PASSED with $WARNINGS warning(s)." >&2
else
  echo "[env-check] PASSED." >&2
fi
