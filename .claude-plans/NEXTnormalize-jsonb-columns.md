# Plan: Normalize JSONB Columns to Relational Tables

## Context

Audit of all JSONB/JSON columns in PostgreSQL identified columns that store queryable relationships or fixed domain concepts as untyped JSON — violating referential integrity and bypassing migration-driven schema evolution. This plan normalizes the problematic columns while documenting why the remaining JSONB columns are correct.

**Guiding principle:** JSONB is correct for opaque pass-through data (notification payloads) and minimal state snapshots (session ETL bookmarks). Relational tables are correct for entity references (UUIDs pointing to other rows) and fixed domain concepts (D&D classes).

**Schema evolution concern:** Alembic migrations can't update JSONB contents when shapes change. Our thin-reference pattern (`{"asset_id": "..."}`) avoids this — there's almost nothing to drift. But structured domain data in JSONB (like `character_classes`) would break silently if the domain model evolved.

---

## JSONB Audit Summary

| Column | Current | Verdict | Action |
|--------|---------|---------|--------|
| Campaign `player_ids` | JSONB UUID array | **Wrong** — queryable relationship, no FK, no cascade | → join table |
| Campaign `invited_player_ids` | JSONB UUID array | **Wrong** — same issues | → join table (same table, role column) |
| Campaign `assets`, `scenes`, `npc_factory` | JSON | **Dead code** — no business logic uses them | → remove |
| Character `character_classes` | JSONB `[{class, level}]` | **Wrong** — fixed domain concept, no referential integrity | → lookup + join table |
| Character `stats` | JSONB `{ability: score}` | **Wrong** — fixed domain concept, key naming could drift | → lookup + join table |
| Character `origin_ability_bonuses` | JSONB `{ability: bonus}` | **Wrong** — same domain keys as stats, same drift risk | → join table (same `dnd_abilities` lookup) |
| Session `audio_config` | JSONB `{channel: {asset_id}}` | **Correct** — thin ETL bookmark | keep |
| Session `map_config` | JSONB `{asset_id}` | **Correct** — thin ETL bookmark | keep |
| Session `image_config` | JSONB `{asset_id}` | **Correct** — thin ETL bookmark | keep |
| Notification `data` | JSONB | **Correct** — opaque event payload, never queried by field | keep |

---

## Phase 1: Remove Dead / Unused Columns

**Goal:** Remove unused columns — dead campaign fields and unused asset `session_ids` scoping.

### 1a: Dead campaign columns

Remove `assets`, `scenes`, `npc_factory` — zero business logic, pure pass-through cruft.

| File | Change |
|------|--------|
| `api-site/modules/campaign/model/campaign_model.py` | Remove 3 Column definitions |
| `api-site/modules/campaign/domain/campaign_aggregate.py` | Remove 3 dataclass fields + `create()` refs |
| `api-site/modules/campaign/repositories/campaign_repository.py` | Remove from `save()` and `_model_to_aggregate()` |
| `api-site/modules/campaign/api/schemas.py` | Remove from `CampaignResponse` |
| `api-site/modules/campaign/api/endpoints.py` | Remove from response builders |

### 1b: Remove asset `session_ids` scoping

Session-level scoping on assets adds UX complexity with no real value — campaign scope is sufficient. The column is plumbed through backend but nothing reads it for filtering. Frontend never uses it.

| File | Change |
|------|--------|
| `api-site/modules/library/domain/asset_aggregate.py` | Remove `session_ids` field, `add_to_session()` method |
| `api-site/modules/library/domain/map_asset_aggregate.py` | Remove `session_ids` from `create()` and `from_base()` |
| `api-site/modules/library/domain/music_asset_aggregate.py` | Same |
| `api-site/modules/library/domain/sfx_asset_aggregate.py` | Same |
| `api-site/modules/library/domain/image_asset_aggregate.py` | Same |
| `api-site/modules/library/model/asset_model.py` | Remove `session_ids` Column |
| `api-site/modules/library/repositories/asset_repository.py` | Remove from `save()` and `_model_to_aggregate()` |
| `api-site/modules/library/api/schemas.py` | Remove `session_ids` from responses |
| `api-site/modules/library/api/endpoints.py` | Remove from response builders |
| `api-site/modules/library/application/commands.py` | Remove `session_id` from associate command |
| `rollplay/app/asset_library/hooks/useAssociateAsset.js` | Remove optional `sessionId` parameter |

### Migration

Single `alembic revision --autogenerate` for all Phase 1 drops (campaign dead columns + asset session_ids).

---

## Phase 2: Campaign Members Join Table

**Goal:** Replace `player_ids` and `invited_player_ids` JSONB arrays with a `campaign_members` table. FK CASCADE handles user deletion automatically (currently broken — deleted users leave orphaned UUIDs).

### New table: `campaign_members`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `campaign_id` | UUID | FK → campaigns(id) ON DELETE CASCADE |
| `user_id` | UUID | FK → users(id) ON DELETE CASCADE |
| `role` | VARCHAR(10) | NOT NULL — `'player'` or `'invited'` |
| `joined_at` | DateTime | NOT NULL, server default NOW() |
| UNIQUE | | (campaign_id, user_id) |

Invite acceptance = UPDATE role from `'invited'` to `'player'`. Single table, one row per membership.

Follows existing pattern: `SessionJoinedUser` in `campaign/model/session_model.py`.

### Aggregate interface: unchanged

`CampaignAggregate` keeps `player_ids: List[UUID]` and `invited_player_ids: List[UUID]` with all existing methods. The repository maps between the join table and these in-memory lists. This means:

- **Zero changes** to commands, queries, endpoints, events, schemas, or frontend
- Repository `_model_to_aggregate()` splits members by role into two UUID lists
- Repository `save()` diffs current join table rows against aggregate lists

### Files

| File | Change |
|------|--------|
| `api-site/modules/campaign/model/campaign_member_model.py` | **NEW** — ORM model |
| `api-site/modules/campaign/model/campaign_model.py` | Remove 2 JSONB columns, add `members` relationship |
| `api-site/modules/campaign/repositories/campaign_repository.py` | Rewrite queries from JSONB containment to JOINs, rewrite save() for join table sync |
| `api-site/alembic/env.py` | Import `CampaignMember` |
| Migration | Autogenerate + manual data migration (read JSONB → INSERT rows → DROP columns) |

### Repository query changes

**`get_by_member_id()`** — JSONB containment → JOIN:
```python
.outerjoin(CampaignMember)
.filter(or_(
    CampaignModel.host_id == user_id,
    and_(CampaignMember.user_id == user_id, CampaignMember.role == 'player')
))
```

**`get_invited_campaigns()`** — JSONB containment → JOIN:
```python
.join(CampaignMember)
.filter(CampaignMember.user_id == user_id, CampaignMember.role == 'invited')
```

All queries must use `joinedload(CampaignModel.members)` to avoid N+1.

### Save() diff logic

```python
current_members = query join table for campaign_id
desired = {pid: 'player' for pid in aggregate.player_ids}
       | {pid: 'invited' for pid in aggregate.invited_player_ids}

# Delete removed, update role changes, insert new
```

---

## Phase 3: Character Classes Normalization

**Goal:** Replace `character_classes` JSONB with lookup + join tables. Ensures referential integrity for the 12 D&D classes — renames/removals propagate correctly.

### New tables

**`dnd_classes`** (lookup, seeded via migration):

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | Integer | PK, autoincrement |
| `name` | VARCHAR(20) | UNIQUE, NOT NULL |

Seeded with: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard.

**`character_classes`** (join table):

| Column | Type | Constraints |
|--------|------|-------------|
| `character_id` | UUID | FK → characters(id) ON DELETE CASCADE, composite PK |
| `class_id` | Integer | FK → dnd_classes(id), composite PK |
| `level` | Integer | NOT NULL |

### Aggregate interface: unchanged

`CharacterAggregate` keeps `character_classes: List[CharacterClassInfo]`. `CharacterClass` enum stays. All validation in `_validate_multiclass()` stays. Repository handles mapping.

### Files

| File | Change |
|------|--------|
| `api-site/modules/characters/model/dnd_class_model.py` | **NEW** — lookup table model |
| `api-site/modules/characters/model/character_class_model.py` | **NEW** — join table model |
| `api-site/modules/characters/model/character_model.py` | Remove JSONB column, add `class_entries` relationship |
| `api-site/modules/characters/repositories/character_repository.py` | Rewrite JSONB serialization to join table sync with class name lookup |
| `api-site/alembic/env.py` | Import new models |
| Migration | Autogenerate + seed 12 classes + data migration (JSONB → rows) + drop column |

---

## Phase 4: Character Ability Scores Normalization

**Goal:** Replace `stats` and `origin_ability_bonuses` JSONB columns with lookup + join tables. Same pattern as classes — consistent normalization, no key drift risk.

### New table (shared lookup with classes)

**`dnd_abilities`** (lookup, seeded via migration):

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | Integer | PK, autoincrement |
| `name` | VARCHAR(20) | UNIQUE, NOT NULL |

Seeded with: strength, dexterity, constitution, intelligence, wisdom, charisma.

### New join tables

**`character_ability_scores`**:

| Column | Type | Constraints |
|--------|------|-------------|
| `character_id` | UUID | FK → characters(id) ON DELETE CASCADE, composite PK |
| `ability_id` | Integer | FK → dnd_abilities(id), composite PK |
| `score` | Integer | NOT NULL |

**`character_origin_bonuses`**:

| Column | Type | Constraints |
|--------|------|-------------|
| `character_id` | UUID | FK → characters(id) ON DELETE CASCADE, composite PK |
| `ability_id` | Integer | FK → dnd_abilities(id), composite PK |
| `bonus` | Integer | NOT NULL |

Only rows where bonus > 0 are stored (sparse — typically 2-3 rows per character vs 6 for scores).

### Aggregate interface: unchanged

`CharacterAggregate` keeps `ability_scores: AbilityScores` value object and `origin_ability_bonuses: Optional[Dict]`. `AbilityScores` dataclass stays with all validation. Repository handles mapping.

### Files

| File | Change |
|------|--------|
| `api-site/modules/characters/model/dnd_ability_model.py` | **NEW** — lookup table model |
| `api-site/modules/characters/model/character_ability_model.py` | **NEW** — join tables for scores + bonuses |
| `api-site/modules/characters/model/character_model.py` | Remove `stats` and `origin_ability_bonuses` JSONB columns, add relationships |
| `api-site/modules/characters/repositories/character_repository.py` | Rewrite JSONB serialization to join table sync with ability name lookup |
| `api-site/alembic/env.py` | Import new models |
| Migration | Autogenerate + seed 6 abilities + data migration (JSONB → rows) + drop columns |

---

## Verification

### Phase 1
- Build and start — no errors
- API responses no longer include `assets`, `scenes`, `npc_factory`
- Asset API responses no longer include `session_ids`
- Associate endpoint no longer accepts `session_id`
- Full session lifecycle (start/pause/resume) unaffected — ETL uses `campaign_ids` not `session_ids`

### Phase 2
1. Create campaign, invite player, accept → verify `campaign_members` rows
2. Leave campaign → verify row deleted
3. Delete a user directly in PostgreSQL → verify CASCADE removes their `campaign_members` rows (the bug this fixes)
4. Delete a campaign → verify all member rows cascade-deleted
5. Full session lifecycle (start/pause/resume) → verify `campaign.player_ids` correctly populated for ETL
6. Frontend unchanged — campaign member lists display correctly

### Phase 3
1. Create character with multiclass → verify join table rows
2. Edit character classes → verify join table syncs
3. Delete character → verify CASCADE cleans up
4. Verify `CharacterClass` enum values match seeded `dnd_classes` rows exactly

### Phase 4
1. Create character with ability scores → verify `character_ability_scores` rows (6 per character)
2. Set origin bonuses → verify `character_origin_bonuses` rows (2-3 per character)
3. Edit scores → verify rows update
4. Clear origin bonuses → verify rows deleted
5. Delete character → verify CASCADE cleans up both tables
6. `get_final_ability_scores()` returns correct base + bonus totals
7. Frontend character creation/edit works unchanged

### All phases
- `docker exec api-site-dev pytest` passes
- `docker-compose -f docker-compose.dev.yml up --build` starts cleanly
