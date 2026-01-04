#!/bin/bash
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

set -e

echo "Waiting for PostgreSQL to be ready..."

# Retry loop: wait for postgres to accept connections
while ! python -c "import psycopg2; psycopg2.connect('$APP_DATABASE_URL')" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done

echo "PostgreSQL is ready!"

echo "Running Alembic migrations..."
alembic upgrade head

echo "Starting API server..."
exec "$@"
