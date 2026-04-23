#!/bin/sh
set -e

# Validate runtime env before any migration/startup.
./scripts/validate-runtime-env.sh --mode=runtime

# Push schema to match database (no migration history in prod)
# Emergency toggles:
# - SKIP_PRISMA_DB_PUSH=1: skip db push entirely.
# - PRISMA_DB_PUSH_REQUIRED=0: do not fail startup when db push fails.
if [ "${SKIP_PRISMA_DB_PUSH:-0}" = "1" ]; then
  echo "[entrypoint] SKIP_PRISMA_DB_PUSH=1, skipping prisma db push."
else
  echo "Pushing database schema..."
  if ! npx prisma db push --accept-data-loss; then
    echo "[entrypoint] prisma db push failed." >&2
    if [ "${PRISMA_DB_PUSH_REQUIRED:-1}" = "1" ]; then
      exit 1
    fi
    echo "[entrypoint] Continuing startup because PRISMA_DB_PUSH_REQUIRED=0."
  fi
fi

# Start the application
echo "Starting application..."
exec "$@"
