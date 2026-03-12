#!/bin/bash

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please create a .env file based on .env.example"
    exit 1
fi

# Source environment variables from .env
echo "Loading environment variables from .env..."
set -a
source .env
set +a

# Verify required variables
REQUIRED_VARS=("DATABASE_URL" "DIRECT_URL" "NEXT_PUBLIC_SUPABASE_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "NEXT_PUBLIC_APP_URL")
MISSING_VARS=0

for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        echo "Error: Required environment variable $VAR is not set!"
        MISSING_VARS=1
    fi
done

if [ $MISSING_VARS -eq 1 ]; then
    echo "Build aborted due to missing environment variables."
    exit 1
fi

echo "Environment variables verified."

# Build the Docker image
echo "Building Docker image..."
docker compose build --no-cache

if [ $? -eq 0 ]; then
    echo "Build successful!"
    echo "To start the application, run: docker compose up -d"
else
    echo "Build failed!"
    exit 1
fi
