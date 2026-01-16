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
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER}') THEN
        CREATE ROLE ${APP_DB_USER} WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD '${APP_DB_PASSWORD}';
    END IF;
END
$$;

-- Grant all privileges to rollplay user (same as postgres)
GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
GRANT ALL ON SCHEMA public TO ${APP_DB_USER};

-- Set up default permissions for future tables (full privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${APP_DB_USER};

-- postgres user already has all privileges by default

-- Log completion
\echo 'PostgreSQL initialization completed for Rollplay database';
\echo 'Created users: postgres (admin), ${APP_DB_USER} (applications) - both have full privileges';