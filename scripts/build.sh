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

echo "Validating environment variables..."
./scripts/validate-runtime-env.sh --mode=build
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
