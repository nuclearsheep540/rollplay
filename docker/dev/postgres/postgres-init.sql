-- PostgreSQL Initialization Script
-- This script sets up the initial database and users for Rollplay
-- Environment variables will be substituted by envsubst

-- Connect to the main database
\c ${POSTGRES_DB};

-- Create extensions we might need
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create dedicated application user with full privileges (like postgres)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rollplay') THEN
        CREATE ROLE rollplay WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD '${APP_DB_PASSWORD}';
    END IF;
END
$$;

-- Grant all privileges to rollplay user (same as postgres)
GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO rollplay;
GRANT ALL ON SCHEMA public TO rollplay;

-- Set up default permissions for future tables (full privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO rollplay;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO rollplay;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO rollplay;

-- postgres user already has all privileges by default

-- Log completion
\echo 'PostgreSQL initialization completed for Rollplay database';
\echo 'Created users: postgres (admin), rollplay (applications) - both have full privileges';