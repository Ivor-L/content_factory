#!/bin/sh
set -e

# Push schema to match database (no migration history in prod)
echo "Pushing database schema..."
npx prisma db push --accept-data-loss

# Start the application
echo "Starting application..."
exec "$@"
