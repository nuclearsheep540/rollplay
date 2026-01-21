# DDD Refactor: Session Module Architecture

## Current State (January 2025)

The Session module currently uses a **pragmatic but impure DDD pattern** that trades architectural purity for practical code organization.

### Current Structure

```
modules/campaign/
├── model/
│   ├── campaign_model.py      ← Campaign ORM (aggregate root)
│   └── session_model.py       ← Session ORM (entity owned by Campaign)

modules/session/
├── domain/
│   └── session_aggregate.py   ← SessionEntity class (misleading filename)
├── application/
│   ├── commands.py            ← Session-specific commands
│   └── queries.py             ← Session-specific queries
├── repositories/
│   └── session_repository.py  ← Direct Session persistence
├── api/
│   └── endpoints.py           ← /api/sessions/* routes
```

### The Impurity

In pure DDD terms, **Session is an entity within the Campaign aggregate**, not a root aggregate. Evidence:

1. **ORM ownership**: `session_model.py` lives under `modules/campaign/model/` because Campaign owns Session in persistence
2. **Business rule**: "You cannot have a Session without a Campaign"
3. **Foreign key**: Sessions reference `campaign_id` as a required field

However, Session has its own:
- Full `modules/session/` module with domain, application, repositories, and API layers
- Independent CRUD operations (`CreateSession`, `StartSession`, etc.)
- Direct API surface (`/api/sessions/*`)

This makes Session **behave like an aggregate root** even though it isn't one.

---

## Why This Happened

During the game→session rename refactor, we gave Session its own module because:

1. **Complexity**: Session has significant behavior (lifecycle state machine, roster management, ETL coordination)
2. **Convenience**: Easier to navigate code when Session logic is co-located
3. **Time constraints**: A proper restructure would require significant additional work

---

## The Pure DDD Alternative

A DDD-correct structure would consolidate everything under Campaign:

```
modules/campaign/
├── domain/
│   ├── campaign_aggregate.py  ← Root aggregate
│   └── session_entity.py      ← Entity (lives with its root)
├── model/
│   ├── campaign_model.py
│   └── session_model.py
├── application/
│   └── commands.py            ← ALL campaign + session commands
├── repositories/
│   └── campaign_repository.py ← Handles both Campaign and Session persistence
├── api/
│   └── endpoints.py           ← All campaign + session routes
```

### Benefits of Pure DDD Approach

1. **Clear aggregate boundaries**: Session clearly owned by Campaign
2. **Single repository**: CampaignRepository handles all persistence
3. **Transactional consistency**: Cross-entity operations in single transaction
4. **No module confusion**: No separate `modules/session/` implying independence

### Costs of Pure DDD Approach

1. **Large Campaign module**: ~1500+ lines of commands, queries, and endpoints
2. **Navigation difficulty**: Finding session-specific code requires searching larger files
3. **Merge conflicts**: More developers touching same files
4. **Migration effort**: ~600 lines of code to move and merge

---

## Recommended Refactor (When Needed)

If the current structure causes problems (e.g., confusion about ownership, transaction issues), consider this migration:

### Phase 1: Move SessionEntity

```bash
# Move domain class
mv modules/session/domain/session_aggregate.py modules/campaign/domain/session_entity.py

# Update class name (already done)
# class SessionAggregate → class SessionEntity
```

### Phase 2: Merge Commands

```python
# modules/campaign/application/commands.py

# Existing Campaign commands
class CreateCampaign: ...
class DeleteCampaign: ...

# Add Session commands (moved from modules/session/application/commands.py)
class CreateSession: ...
class StartSession: ...
class PauseSession: ...
class FinishSession: ...
```

### Phase 3: Merge Repository

```python
# modules/campaign/repositories/campaign_repository.py

class CampaignRepository:
    # Existing Campaign methods
    def get_by_id(self, campaign_id) -> CampaignAggregate: ...

    # Add Session methods (moved from SessionRepository)
    def get_session_by_id(self, session_id) -> SessionEntity: ...
    def save_session(self, session: SessionEntity): ...
```

### Phase 4: Consolidate API Routes

```python
# modules/campaign/api/endpoints.py

# Campaign routes
@router.post("/")
async def create_campaign(): ...

# Session routes (nested under campaigns or separate)
@router.post("/{campaign_id}/sessions")
async def create_session(): ...

# Or keep /api/sessions/* but in campaign module
```

### Phase 5: Remove modules/session/

After migration, remove the now-empty session module.

---

## Decision: Current Trade-off

**We chose pragmatism over purity** for now:

- ✅ Code is organized and navigable
- ✅ Session behavior is co-located
- ✅ Tests pass, functionality works
- ⚠️ DDD purists would object
- ⚠️ `SessionEntity` in its own module is technically incorrect

**Revisit this if**:
- Transaction consistency issues arise between Campaign and Session
- Team members are confused about aggregate boundaries
- Code duplication appears due to unclear ownership

---

## Reference: Ubiquitous Language

| Term | Meaning | Storage | Service |
|------|---------|---------|---------|
| **Session** | Scheduled play instance | PostgreSQL | api-site |
| **Game** | Live multiplayer experience | MongoDB | api-game |
| **Campaign** | Collection of sessions | PostgreSQL | api-site |

- A Campaign *contains* Sessions (1:many)
- A Session *contains* a Game when ACTIVE
- Starting a Session creates a Game (ETL: PostgreSQL → MongoDB)
- Pausing/Finishing a Session archives the Game (ETL: MongoDB → PostgreSQL)
