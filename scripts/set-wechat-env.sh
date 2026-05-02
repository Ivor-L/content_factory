#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
APP_ID="${WECHAT_APP_ID:-}"
APP_SECRET="${WECHAT_APP_SECRET:-}"

usage() {
  cat <<'EOF'
Usage:
  scripts/set-wechat-env.sh [--env-file <path>] --app-id <value> --app-secret <value>

Examples:
  scripts/set-wechat-env.sh --app-id wx123 --app-secret abc123
  WECHAT_APP_ID=wx123 WECHAT_APP_SECRET=abc123 scripts/set-wechat-env.sh
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --app-id)
      APP_ID="${2:-}"
      shift 2
      ;;
    --app-secret)
      APP_SECRET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[set-wechat-env] ERROR: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$APP_ID" ] || [ -z "$APP_SECRET" ]; then
  echo "[set-wechat-env] ERROR: both app id and app secret are required." >&2
  usage >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[set-wechat-env] ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

upsert_env_var() {
  key="$1"
  value="$2"
  file="$3"
  tmp_file="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { updated = 0 }
    $0 ~ "^[[:space:]]*" k "=" {
      print k "=" v
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print k "=" v
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

mask_secret() {
  value="$1"
  len="$(printf '%s' "$value" | wc -c | tr -d ' ')"
  if [ "$len" -le 6 ]; then
    printf '***'
    return
  fi
  prefix="$(printf '%s' "$value" | cut -c1-3)"
  suffix="$(printf '%s' "$value" | rev | cut -c1-3 | rev)"
  printf '%s***%s' "$prefix" "$suffix"
}

upsert_env_var "WECHAT_APP_ID" "$APP_ID" "$ENV_FILE"
upsert_env_var "WECHAT_APP_SECRET" "$APP_SECRET" "$ENV_FILE"

echo "[set-wechat-env] Updated $ENV_FILE"
echo "[set-wechat-env] WECHAT_APP_ID=$APP_ID"
echo "[set-wechat-env] WECHAT_APP_SECRET=$(mask_secret "$APP_SECRET")"
echo "[set-wechat-env] Next step: docker compose up -d --build"
