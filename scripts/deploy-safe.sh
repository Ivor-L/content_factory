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

resolved_xhs_downloader_base_url="${XHS_DOWNLOADER_BASE_URL:-}"
if [ -z "$resolved_xhs_downloader_base_url" ]; then
  resolved_xhs_downloader_base_url="http://xhs-downloader:5556"
  echo "[deploy-safe] XHS_DOWNLOADER_BASE_URL missing, using default: $resolved_xhs_downloader_base_url"
  upsert_env_var "XHS_DOWNLOADER_BASE_URL" "$resolved_xhs_downloader_base_url" ".env"
fi

echo "[deploy-safe] Validating env..."
./scripts/validate-runtime-env.sh --mode=runtime

echo "[deploy-safe] Pulling latest code..."
git pull --ff-only

web_replicas="${WEB_REPLICAS:-3}"
case "$web_replicas" in
  ''|*[!0-9]*)
    echo "[deploy-safe] ERROR: WEB_REPLICAS must be a positive integer, got: $web_replicas" >&2
    exit 1
    ;;
esac
if [ "$web_replicas" -lt 1 ]; then
  echo "[deploy-safe] ERROR: WEB_REPLICAS must be >= 1, got: $web_replicas" >&2
  exit 1
fi

if ! grep -q '^SKIP_PRISMA_DB_PUSH=1$' .env; then
  echo "[deploy-safe] SKIP_PRISMA_DB_PUSH is not 1; setting it to 1 for scaled production startup."
  upsert_env_var "SKIP_PRISMA_DB_PUSH" "1" ".env"
fi

if ! grep -q 'connection_limit=' .env; then
  echo "[deploy-safe] WARN: DATABASE_URL does not appear to include connection_limit=."
  echo "[deploy-safe] WARN: For WEB_REPLICAS=$web_replicas, consider adding connection_limit=3&pool_timeout=10 to DATABASE_URL."
fi

echo "[deploy-safe] Building and starting containers with WEB_REPLICAS=$web_replicas..."
docker compose up -d --build --scale web="$web_replicas"

echo "[deploy-safe] Deployment status:"
docker compose ps

echo "[deploy-safe] Done."
