# Plan: Restore Character Selection Enforcement (Campaign-Level Locking)

## Problem Summary

Users can enter sessions without selecting a character. The enforcement was lost due to:
1. Missing aggregate methods (wrong naming)
2. Frontend endpoint mismatch
3. Incorrect lock level (session vs campaign)

## Intended UX (Clarified)

1. **Player joins campaign** → added to `campaign.player_ids`
2. **Player selects character for campaign** → character locked to CAMPAIGN (not session)
3. **Character stays locked** until player leaves the campaign
4. **Entering session**:
   - If character selected → enter normally
   - If no character selected → enter as **spectator** (can't participate until they select)
5. **Host starting session** → NOT blocked by players without characters (their problem, not host's)

## Current vs Intended Data Model

### Current (WRONG)
```
Character.active_in_session_id → FK to sessions (per-session lock)
SessionJoinedUser.selected_character_id → per-session character selection
```

### Intended (CORRECT)
```
Character.active_in_campaign_id → FK to campaigns (campaign-level lock)
SessionJoinedUser.selected_character_id → optional cache/historical record
```

---

## Implementation Plan

### Phase 1: Database Migration

**New migration file** to:
1. Rename column: `characters.active_in_session_id` → `characters.active_in_campaign_id`
2. Change FK target: from `sessions.id` to `campaigns.id`
3. Clear existing session locks (they're invalid under new model)

```python
# Migration
op.alter_column('characters', 'active_in_session_id', new_column_name='active_in_campaign_id')
op.drop_constraint('characters_active_in_session_id_fkey', 'characters')
op.create_foreign_key('characters_active_in_campaign_id_fkey', 'characters', 'campaigns', ['active_in_campaign_id'], ['id'])
```

### Phase 2: Update CharacterAggregate

**File:** `/api-site/modules/characters/domain/character_aggregate.py`

1. Rename property: `active_game` → `active_campaign`
2. Rename methods: `lock_to_game()` → `lock_to_campaign()`, `unlock_from_game()` → `unlock_from_campaign()`
3. Update docstrings to reflect campaign-level semantics

```python
active_campaign: Optional[UUID] = None  # Campaign character is locked to

def lock_to_campaign(self, campaign_id: UUID) -> None:
    """Lock character to a campaign. Character cannot be used in other campaigns."""
    if self.active_campaign is not None:
        raise ValueError(f"Character already locked to campaign {self.active_campaign}")
    self.active_campaign = campaign_id
    self.updated_at = datetime.now()

def unlock_from_campaign(self) -> None:
    """Unlock character from campaign (when player leaves campaign)."""
    self.active_campaign = None
    self.updated_at = datetime.now()
```

### Phase 3: Update Character Repository

**File:** `/api-site/modules/characters/orm/character_repository.py`

1. Update ORM↔Domain mapping: `active_session` → `active_campaign`
2. Add query method: `get_user_character_for_campaign(user_id, campaign_id)`

```python
def get_user_character_for_campaign(self, user_id: UUID, campaign_id: UUID) -> Optional[CharacterAggregate]:
    """Get the character a user has locked to a specific campaign."""
    model = self.db.query(CharacterModel).filter(
        CharacterModel.user_id == user_id,
        CharacterModel.active_in_campaign_id == campaign_id,
        CharacterModel.is_deleted == False
    ).first()
    return self._to_aggregate(model) if model else None
```

### Phase 4: Update Character Model

**File:** `/api-site/modules/characters/model/character_model.py`

```python
# Change from:
active_session = Column('active_in_session_id', UUID(as_uuid=True), ForeignKey('sessions.id'), nullable=True)

# To:
active_campaign = Column('active_in_campaign_id', UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=True)
```

### Phase 5: Update Session Commands

**File:** `/api-site/modules/session/application/commands.py`

Replace all `lock_to_session()` / `unlock_from_session()` calls with `lock_to_campaign()` / `unlock_from_campaign()`.

Key changes:
- `SelectCharacterForSession` → becomes `SelectCharacterForCampaign` (or move to campaign module)
- Character locking happens when selecting for campaign, not session
- Remove session-level character validation from `StartSession`

### Phase 6: Add Campaign Character Selection

**File:** `/api-site/modules/campaign/application/commands.py`

Add new command for selecting character at campaign level:

```python
class SelectCharacterForCampaign:
    """Select a character to use in this campaign. Locks character to campaign."""

    def execute(self, campaign_id: UUID, user_id: UUID, character_id: UUID):
        # Validate user is campaign member
        # Validate character owned by user
        # Validate character not locked to another campaign
        # Lock character to campaign
```

**File:** `/api-site/modules/campaign/api/endpoints.py`

Add endpoint: `POST /campaigns/{campaign_id}/select-character`

### Phase 7: Update Frontend

**File:** `/rollplay/app/dashboard/components/CharacterSelectionModal.js`

- Fix endpoint path: `/api/campaigns/{id}/select-character` (campaign level, not session)
- Update UX messaging to reflect campaign-level selection

**File:** `/rollplay/app/dashboard/components/CampaignManager.js` (or similar)

- Add character selection UI at campaign level
- Show selected character on campaign card

**File:** `/rollplay/app/game/page.js`

- Allow entry without character (spectator mode)
- Show "Select Character" prompt for spectators
- Disable participation controls until character selected

### Phase 8: Handle Leave Campaign

**File:** `/api-site/modules/campaign/application/commands.py`

In `LeaveCampaign` command:
- Unlock player's character from campaign when they leave

```python
# In LeaveCampaign.execute():
character = self.character_repo.get_user_character_for_campaign(user_id, campaign_id)
if character:
    character.unlock_from_campaign()
    self.character_repo.save(character)
```

### Phase 9: Add Release Character Feature

Allow players to release their character (unlock) while staying in the campaign. Only allowed when no active session exists.

**File:** `/api-site/modules/campaign/application/commands.py`

Add new command:

```python
class ReleaseCharacterFromCampaign:
    """Release character from campaign without leaving. Only allowed when no active session."""

    def execute(self, campaign_id: UUID, user_id: UUID):
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        if not campaign.is_member(user_id):
            raise ValueError("User is not a member of this campaign")

        # Check for active sessions
        active_sessions = self.session_repo.get_active_sessions_for_campaign(campaign_id)
        if active_sessions:
            raise ValueError("Cannot release character while a session is active")

        character = self.character_repo.get_user_character_for_campaign(user_id, campaign_id)
        if not character:
            raise ValueError("No character selected for this campaign")

        character.unlock_from_campaign()
        self.character_repo.save(character)
        return character
```

**File:** `/api-site/modules/campaign/api/endpoints.py`

Add endpoint: `DELETE /campaigns/{campaign_id}/my-character`

```python
@router.delete("/{campaign_id}/my-character")
async def release_character_from_campaign(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo = Depends(campaign_repository),
    character_repo = Depends(character_repository),
    session_repo = Depends(session_repository)
):
    """Release your character from this campaign (stay as member without character)."""
    command = ReleaseCharacterFromCampaign(campaign_repo, character_repo, session_repo)
    command.execute(campaign_id, current_user.id)
    return {"message": "Character released from campaign"}
```

**File:** `/rollplay/app/dashboard/components/CampaignManager.js` (or members list component)

Add release button UI:
- Show "Release Character" button next to current user's entry in members list
- Only visible when user has a character selected
- Disabled/hidden when a session is active
- Confirmation dialog before releasing
- On success, refresh campaign data to show user without character

---

## Files to Modify

| File | Change |
|------|--------|
| `alembic/versions/xxx_campaign_level_char_lock.py` | NEW - Migration to change FK from sessions to campaigns |
| `/modules/characters/domain/character_aggregate.py` | Rename to campaign terminology |
| `/modules/characters/model/character_model.py` | Change FK to campaigns |
| `/modules/characters/orm/character_repository.py` | Update mapping, add campaign query |
| `/modules/campaign/application/commands.py` | Add `SelectCharacterForCampaign`, `ReleaseCharacterFromCampaign`, update `LeaveCampaign` |
| `/modules/campaign/api/endpoints.py` | Add character selection + release endpoints |
| `/modules/session/application/commands.py` | Remove session-level character locking |
| `/modules/session/orm/session_repository.py` | Add `get_active_sessions_for_campaign()` query |
| `/rollplay/app/dashboard/components/CharacterSelectionModal.js` | Fix endpoint, update messaging |
| `/rollplay/app/dashboard/components/CampaignManager.js` | Add "Release Character" button in members list |
| `/rollplay/app/game/page.js` | Allow spectator entry, prompt character selection |

---

## Verification Plan

1. **Migration test**: Verify FK changed correctly, existing data cleared
2. **Unit test**: `lock_to_campaign()` / `unlock_from_campaign()` work correctly
3. **Integration test**:
   - Select character for campaign → character locked
   - Leave campaign → character unlocked
   - Cannot use locked character in another campaign
   - Release character when no active session → character unlocked, user stays member
   - Release character during active session → error
4. **E2E test**:
   - Join campaign → select character → character locked
   - Enter session without character → spectator mode
   - Select character → full participation enabled
   - Leave campaign → character unlocked, can use elsewhere
   - Release character (no session) → button works, character freed, user stays in campaign
   - Release character (active session) → button disabled or error shown

---

## Domain Rules Summary

1. **One character per campaign**: A character can only be active in ONE campaign at a time
2. **Campaign-level lock**: Lock applied when selecting character, released when leaving campaign
3. **Spectator allowed**: Players can enter sessions without character (view-only)
4. **No host blocking**: Session start is NOT blocked by unselected characters
5. **Character ownership**: Only character owner can select it for a campaign
6. **Character release**: Player can release character (unlock) while staying in campaign, but ONLY when no active session
