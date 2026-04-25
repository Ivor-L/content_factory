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

if [ -n "${REDNOTE_API_KEY:-}" ]; then
  echo "[deploy-safe] Injecting REDNOTE_API_KEY from shell env into .env"
  upsert_env_var "REDNOTE_API_KEY" "$REDNOTE_API_KEY" ".env"
fi

echo "[deploy-safe] Validating env..."
./scripts/validate-runtime-env.sh --mode=runtime

echo "[deploy-safe] Pulling latest code..."
git pull --ff-only

echo "[deploy-safe] Building and starting containers..."
docker compose up -d --build

echo "[deploy-safe] Done."
