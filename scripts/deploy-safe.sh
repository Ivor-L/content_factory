#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "[deploy-safe] ERROR: .env not found in $PROJECT_DIR" >&2
  exit 1
fi

echo "[deploy-safe] Syncing missing env keys from template..."
./scripts/sync-env-from-template.sh .env.production.example .env

echo "[deploy-safe] Validating env..."
./scripts/validate-runtime-env.sh --mode=runtime

echo "[deploy-safe] Pulling latest code..."
git pull --ff-only

echo "[deploy-safe] Building and starting containers..."
docker compose up -d --build

echo "[deploy-safe] Done."
