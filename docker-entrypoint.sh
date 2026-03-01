#!/bin/sh
set -e

# Run migrations
echo "Running database migrations..."
prisma migrate deploy

# Start the application
echo "Starting application..."
exec "$@"
