# Eject Character from Campaign

## Context

When a game session is active, players cannot release their character from a campaign — `ReleaseCharacterFromCampaign` blocks with "Cannot release character while a session is active". This means a DM can effectively hold characters hostage by keeping sessions active. The **eject** feature lets the character owner forcibly release their character mid-session, with the understood tradeoff that in-session progress is lost (character reverts to its last PostgreSQL state).

No character-ETL exists today (characters always load fresh from PostgreSQL on session start), so "lost progress" currently means removal from the active game state — but the warning is forward-looking for when in-session character changes become a thing.

**Who can eject:** Only the character owner (not the DM, not the host).
**What eject does:** Unlocks the character (`active_campaign = None`), removes it from the active MongoDB game state, player stays in the campaign without a character.

---

## Implementation

### 1. api-game: New GameService method + HTTP endpoint

**`api-game/gameservice.py`** — Add `remove_player_character(room_id, player_name)`:
- Fetch room document
- Remove `player_name` key from `player_metadata` via `$unset`
- Replace any occurrence of `player_name` in `seat_layout` with `"empty"` via `$set`
- Single atomic MongoDB update
- Return the updated `seat_layout`

**`api-game/app.py`** — Add `DELETE /game/{room_id}/player/{player_name}/character`:
- Call `GameService.remove_player_character(room_id, player_name)`
- Broadcast `seat_change` event with updated seat layout (clients already handle this via `handleSeatChange`)
- Broadcast `character_ejected` event with `{ player_name, character_name }` for any additional frontend handling
- Add adventure log entry: `"{character_name} was ejected from the game"` (SYSTEM log type)
- Return `{"success": true}`

**`api-game/message_templates.py`** — Add template: `"character_ejected": "{character} was ejected from the game"`

### 2. api-site: New command + endpoint

**`api-site/modules/campaign/application/commands.py`** — Add `EjectCharacterFromCampaign`:

Mirrors `ReleaseCharacterFromCampaign` (line 509) with two differences:
- **No active session guard** (the whole point)
- **HTTP DELETE to api-game** when active session found

```
execute(campaign_id: UUID, user_id: UUID):
  1. Get campaign, validate user is member (same as release)
  2. Get user's character via character_repo.get_user_character_for_campaign()
  3. Capture character_name
  4. Find active sessions — iterate campaign.session_ids, collect any with ACTIVE status
  5. For each active session:
     a. Resolve player's screen_name from user_repo
     b. HTTP DELETE to api-game: http://api-game:8081/game/{session.active_game_id}/player/{player_name}/character
        - Fire-and-best-effort: log errors but don't fail the eject
        - timeout=10.0, same httpx.AsyncClient pattern as StartSession (line 495)
  6. Unlock character: character.unlock_from_campaign(), character_repo.save()
  7. Broadcast CampaignEvents.campaign_character_released() (reuse existing event)
  8. Return character
```

The HTTP call is best-effort because PostgreSQL is the source of truth. If api-game is unreachable, the character still unlocks. MongoDB state cleans up naturally when the session ends.

**`api-site/modules/campaign/api/endpoints.py`** — Add endpoint after release (line 598):

```
POST /{campaign_id}/my-character/eject
```

Same dependency injection pattern as release. Returns same response shape: `{"message": "...", "character_id": str(...), "character_name": ...}`.

POST (not DELETE) because it triggers side effects beyond simple deletion and the DELETE verb is already taken by release.

### 3. Frontend: Mutation hook

**`rollplay/app/dashboard/hooks/mutations/useCharacterMutations.js`** — Add `useEjectCharacter()`:
- `POST /api/campaigns/${campaignId}/my-character/eject` via `authFetch`
- Invalidates `['campaigns']` and `['characters']` query keys
- Same pattern as `useReleaseCharacter`

### 4. Frontend: CampaignManager button + confirmation modal

**`rollplay/app/dashboard/components/CampaignManager.js`**:

- Import `useEjectCharacter`, `ConfirmModal`
- Add `ejectCharacterMutation` hook instance
- Add `ejectConfirmCampaign` state for modal target
- Add `handleEjectCharacter(campaign)` → opens confirmation modal
- Add `confirmEjectCharacter()` → calls mutation, closes modal on success

**Button logic change** (lines 1410-1425):
- When `!hasActiveSession(campaign.id)`: show existing "Release Character" button (unchanged)
- When `hasActiveSession(campaign.id)`: show **"Eject Character"** button (amber/warning style, NOT disabled), calls `handleEjectCharacter`

**Confirmation modal** (using `ConfirmModal` directly, no wrapper file needed):
```
title: "Eject Character"
message: "Are you sure you want to eject your character from "{campaign.title}"?"
description: "A session is currently active. Your character will be released, but any progress from the current session will be lost."
confirmText: "Eject Character"
variant: "warning"
icon: faRightFromBracket (already imported)
```

### 5. Frontend: Game WebSocket handler

**`rollplay/app/game/hooks/webSocketEvent.js`** — Add `handleCharacterEjected`:
- Receives `{ player_name, character_name }`
- Updates `setGameSeats`: replace the ejected player's seat with `"empty"` + clear `characterData`
- Updates `setPlayerMetadata`: remove the player's key

**`rollplay/app/game/hooks/useWebSocket.js`** — Add case in switch (after `player_character_changed`):
```
case 'character_ejected':
  handleCharacterEjected(data, handlers);
  break;
```

Note: The `seat_change` broadcast from api-game also fires and `handleSeatChange` will rebuild seats. The `character_ejected` handler provides the metadata cleanup.

---

## Files Modified

| File | Change |
|------|--------|
| `api-game/gameservice.py` | Add `remove_player_character()` method |
| `api-game/app.py` | Add `DELETE /game/{room_id}/player/{player_name}/character` endpoint |
| `api-game/message_templates.py` | Add `character_ejected` template |
| `api-site/modules/campaign/application/commands.py` | Add `EjectCharacterFromCampaign` command |
| `api-site/modules/campaign/api/endpoints.py` | Add `POST /{campaign_id}/my-character/eject` endpoint |
| `rollplay/app/dashboard/hooks/mutations/useCharacterMutations.js` | Add `useEjectCharacter()` hook |
| `rollplay/app/dashboard/components/CampaignManager.js` | Eject button, confirmation modal, state |
| `rollplay/app/game/hooks/webSocketEvent.js` | Add `handleCharacterEjected` |
| `rollplay/app/game/hooks/useWebSocket.js` | Add `character_ejected` case |

---

## Verification

1. **Backend unit**: Call eject endpoint with active session → character unlocks in PostgreSQL, HTTP call fires to api-game
2. **api-game**: `DELETE /game/{room_id}/player/{player_name}/character` → verify MongoDB `player_metadata` and `seat_layout` updated
3. **Frontend flow**: Open campaign with active session → "Eject Character" button visible → click → confirmation modal → confirm → character released, button changes to "Select Character"
4. **Game UI**: While in game session, another tab ejects character → seat empties via WebSocket, player metadata clears
5. **Edge case**: api-game unreachable → eject still succeeds (character unlocks in PostgreSQL), error logged

---

## Implementation Order

1. `api-game/gameservice.py` + `api-game/app.py` + `api-game/message_templates.py`
2. `api-site/modules/campaign/application/commands.py` + `api-site/modules/campaign/api/endpoints.py`
3. `rollplay/app/dashboard/hooks/mutations/useCharacterMutations.js`
4. `rollplay/app/dashboard/components/CampaignManager.js`
5. `rollplay/app/game/hooks/webSocketEvent.js` + `rollplay/app/game/hooks/useWebSocket.js`
