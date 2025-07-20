# Legacy Directory

This directory contains old code that's being phased out during the DDD refactor.

## Moved from root to legacy:
- `adapters/` → `legacy/adapters/`
- `api/` → `legacy/api/`
- `application/` → `legacy/application/`
- `commands/` → `legacy/commands/`
- `dependencies/` → `legacy/dependencies/`
- `domain/` → `legacy/domain/`
- `orm/` → `legacy/orm/`
- `schemas/` → `legacy/schemas/`
- `models/` → `legacy/models/`
- `services/` → `legacy/services/`
- `repositories/` → `legacy/repositories/`

## New Structure:
- User aggregate: `user/`
- Campaign aggregate: `campaign/`
- Shared infrastructure: `shared/`

**DO NOT** import from legacy/ directories in new code.