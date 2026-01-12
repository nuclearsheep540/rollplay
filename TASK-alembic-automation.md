# Task: Automate Alembic Migrations on api-site Container Startup

**Goal:** Configure api-site container to automatically run `alembic upgrade head` on startup, ensuring database schema is always up-to-date.

**Date Created:** 2026-01-04
**Status:** Implementation Complete - Testing Pending
**Priority:** Medium
**Estimated Complexity:** Low-Medium

---

## Background

Currently, Alembic migrations must be run manually via `docker exec api-site-dev alembic upgrade head`. This task automates migrations on container startup, ensuring:
- Zero manual steps for developers
- Consistent production deployments
- Fail-fast behavior if migrations fail
- Proper database readiness checking

---

## Implementation Checklist

### Phase 1: Create Entrypoint Script

- [x] **Create `/api-site/entrypoint.sh`**
  - [x] Add shebang and set -e for error handling
  - [x] Implement PostgreSQL readiness check with retry loop
  - [x] Run `alembic upgrade head` after database is ready
  - [x] Execute CMD passed from Dockerfile using `exec "$@"`
  - [x] Add logging messages (no emojis) to track startup progress
  - [x] Make script executable (`chmod +x`)

### Phase 2: Update Requirements

- [x] **Check `/api-site/requirements.txt`**
  - [x] Verify `psycopg2` or `psycopg2-binary` is present (needed for DB connection check)
  - [x] Add if missing (psycopg2-binary==2.9.9 already present)
  - [x] Verify `alembic==1.13.1` is present (already confirmed in exploration)

### Phase 3: Update Development Dockerfile

- [x] **Modify `/docker/dev/api-site/Dockerfile`**
  - [x] Copy entrypoint.sh to container: `COPY entrypoint.sh /entrypoint.sh`
  - [x] Make executable: `RUN chmod +x /entrypoint.sh`
  - [x] Add ENTRYPOINT: `ENTRYPOINT ["/entrypoint.sh"]`
  - [x] Keep existing CMD: `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082", "--reload"]`

### Phase 4: Update Production Dockerfile

- [x] **Modify `/docker/prod/api-site/Dockerfile`**
  - [x] Copy entrypoint.sh to container: `COPY entrypoint.sh /entrypoint.sh`
  - [x] Make executable: `RUN chmod +x /entrypoint.sh`
  - [x] Add ENTRYPOINT: `ENTRYPOINT ["/entrypoint.sh"]`
  - [x] Keep existing CMD: `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082"]`

### Phase 5: Add PostgreSQL Healthcheck

- [x] **Modify `/docker-compose.dev.yml`**
  - [x] Add healthcheck to `postgres` service:
    ```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d rollplay"]
      interval: 5s
      timeout: 5s
      retries: 5
    ```

- [x] **Modify `/docker-compose.yml` (production)**
  - [x] Add healthcheck to `postgres` service (same as above)

### Phase 6: Add Service Dependencies

- [x] **Modify `/docker-compose.dev.yml`**
  - [x] Add `depends_on` to `api-site` service:
    ```yaml
    depends_on:
      postgres:
        condition: service_healthy
    ```

- [x] **Modify `/docker-compose.yml` (production)**
  - [x] Add `depends_on` to `api-site` service:
    ```yaml
    depends_on:
      postgres:
        condition: service_healthy
    ```

### Phase 7: Testing

- [ ] **Development Environment Testing**
  - [ ] Rebuild api-site container: `docker-compose -f docker-compose.dev.yml build api-site`
  - [ ] Stop all containers: `docker-compose -f docker-compose.dev.yml down`
  - [ ] Start fresh: `docker-compose -f docker-compose.dev.yml up`
  - [ ] Verify logs show:
    - "Waiting for PostgreSQL to be ready..."
    - "PostgreSQL is ready!"
    - "Running Alembic migrations..."
    - Alembic output
    - "Starting API server..."
  - [ ] Verify api-site starts successfully
  - [ ] Test API endpoints still work

- [ ] **Migration Testing**
  - [ ] Create a test migration: `docker exec api-site-dev alembic revision -m "test_migration"`
  - [ ] Restart container: `docker-compose -f docker-compose.dev.yml restart api-site`
  - [ ] Verify test migration was applied automatically
  - [ ] Clean up test migration file

- [ ] **Failure Testing**
  - [ ] Temporarily break a migration to ensure container fails to start
  - [ ] Verify logs show clear error message
  - [ ] Restore migration and verify recovery

### Phase 8: Documentation

- [ ] **Update `/rollplay/CLAUDE.md`**
  - [ ] Add section under "Database Architecture" or "Development Commands"
  - [ ] Document automatic migration behavior
  - [ ] Note that migrations run on every container startup
  - [ ] Explain how to handle migration failures

- [ ] **Update `/rollplay/README.md` (if exists)**
  - [ ] Remove any manual migration steps from setup instructions
  - [ ] Note automatic migration behavior

---

## Technical Details

### Entrypoint Script Logic
```bash
#!/bin/bash
set -e

# Wait for PostgreSQL
while ! python -c "import psycopg2; psycopg2.connect('$APP_DATABASE_URL')" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done

# Run migrations
alembic upgrade head

# Start application
exec "$@"
```

### Environment Variables Used
- `APP_DATABASE_URL` - PostgreSQL connection string (already configured)
- `POSTGRES_USER` - For healthcheck (from .env)
- `POSTGRES_DB` - For healthcheck (from .env)

### Files Modified
1. `/api-site/entrypoint.sh` (NEW)
2. `/api-site/requirements.txt` (POSSIBLY MODIFIED)
3. `/docker/dev/api-site/Dockerfile` (MODIFIED)
4. `/docker/prod/api-site/Dockerfile` (MODIFIED)
5. `/docker-compose.dev.yml` (MODIFIED)
6. `/docker-compose.yml` (MODIFIED)
7. `/rollplay/CLAUDE.md` (MODIFIED - documentation)

---

## Rollback Plan

If issues arise:
1. Remove `ENTRYPOINT` line from Dockerfiles
2. Revert docker-compose changes (remove `depends_on` and healthchecks)
3. Rebuild containers
4. Manually run migrations as before

---

## Future Enhancements (Out of Scope for This Task)

- [ ] Add `SKIP_MIGRATIONS` environment variable flag to bypass migrations if needed
- [ ] Add alembic downgrade support via environment variable
- [ ] Implement migration lock timeout handling
- [ ] Add Slack/email notification on migration failures (production)

---

## Notes

- Alembic has built-in locking, so concurrent migrations are safe
- `alembic upgrade head` is idempotent (safe to run multiple times)
- Entrypoint pattern follows existing nginx precedent in codebase
- No emojis used in code per user preference
