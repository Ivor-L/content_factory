#!/bin/sh
set -e

# Validate runtime env before any migration/startup.
./scripts/validate-runtime-env.sh --mode=runtime

# Push schema to match database (no migration history in prod)
echo "Pushing database schema..."
npx prisma db push --accept-data-loss

# Start the application
echo "Starting application..."
exec "$@"
