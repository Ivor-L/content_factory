#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "[deploy-safe] ERROR: .env not found in $PROJECT_DIR" >&2
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

echo "[deploy-safe] Syncing missing env keys from template..."
./scripts/sync-env-from-template.sh .env.production.example .env

resolved_rednote_key="${REDNOTE_API_KEY:-}"
if [ -z "$resolved_rednote_key" ] && [ -n "${REDNOTE_QR_API_KEY:-}" ]; then
  resolved_rednote_key="$REDNOTE_QR_API_KEY"
fi
if [ -z "$resolved_rednote_key" ] && [ -n "${XHS_QR_PUBLISH_API_KEY:-}" ]; then
  resolved_rednote_key="$XHS_QR_PUBLISH_API_KEY"
fi
if [ -z "$resolved_rednote_key" ] && [ -n "${XHS_PUBLISH_API_KEY:-}" ]; then
  resolved_rednote_key="$XHS_PUBLISH_API_KEY"
fi

if [ -n "$resolved_rednote_key" ]; then
  echo "[deploy-safe] Injecting XHS publish API key into .env as REDNOTE_API_KEY"
  upsert_env_var "REDNOTE_API_KEY" "$resolved_rednote_key" ".env"
fi

echo "[deploy-safe] Validating env..."
./scripts/validate-runtime-env.sh --mode=runtime

echo "[deploy-safe] Pulling latest code..."
git pull --ff-only

echo "[deploy-safe] Building and starting containers..."
docker compose up -d --build

echo "[deploy-safe] Done."
