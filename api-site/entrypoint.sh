#!/bin/bash
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

set -e

echo "Waiting for PostgreSQL to be ready..."

# Construct database URL from environment variables
# APP_DB_USER comes from .env via docker-compose
export POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export DB_URL="postgresql://${APP_DB_USER}:${APP_DB_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

# Retry loop: wait for postgres to accept connections
while ! python -c "import psycopg2; psycopg2.connect('$DB_URL')" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done

echo "PostgreSQL is ready!"

echo "Running Alembic migrations..."
alembic upgrade head

echo "Starting API server..."
exec "$@"
