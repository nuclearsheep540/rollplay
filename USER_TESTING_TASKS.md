# User Testing Tasks - Rollplay
**Last Updated:** 2025-11-12
**Source:** User testing feedback from real potential end users

---

## 📊 Progress Overview

- **Critical Bugs:** 0/6 completed
- **Quick Wins:** 0/10 completed
- **Small Features:** 0/8 completed
- **Medium Features:** 0/7 completed
- **Major Rethinks:** 0/4 completed

**Total Tasks:** 0/35 completed

---

# Phase 1: Critical Bugs 🔥
**Priority: IMMEDIATE** - These block users and must be fixed first

---

## ⚠️ CRITICAL-1: Fix Production Magic Link URL
- [x] **Status:** COMPLETED
- **Priority:** CRITICAL
- **Complexity:** Simple
- **Estimated Time:** < 1 hour
- **Issue:** Magic link email sends users to `http://localhost/auth/verify` instead of production URL

### Current Implementation
- **File:** `/api-auth/auth/passwordless.py` line 42
- **Code:** `f"{self.settings.frontend_url}/auth/verify?token={magic_token}"`
- **Settings:** `/api-auth/config/settings.py` line 26
- **Env Var:** Uses `NEXT_PUBLIC_API_URL` from `.env` (set to `http://localhost`)

### Required Changes
1. Change environment variable name from `NEXT_PUBLIC_API_URL` to `FRONTEND_URL` in:
   - `/api-auth/config/settings.py` line 26
   - `/.env` file
2. Update production `.env` to use `FRONTEND_URL=https://tabletop-tavern.uk`
3. Add validation to ensure production uses HTTPS

### Files Involved
- `/api-auth/config/settings.py` ✅ Updated
- `/api-auth/auth/passwordless.py` (no changes needed, uses settings correctly)
- `/.env` ✅ Updated with FRONTEND_URL

### Solution Implemented
1. Updated `settings.py` to use `FRONTEND_URL` env var (with fallback to `NEXT_PUBLIC_API_URL`)
2. Added `FRONTEND_URL=http://localhost` to development `.env`
3. Added documentation for production

### Production Deployment Steps
**To fix in production:**
1. Add to production `.env` file:
   ```bash
   FRONTEND_URL=https://tabletop-tavern.uk
   ```
   (Note: Must use `https://` not `http://`)
2. Restart api-auth container:
   ```bash
   docker-compose restart api-auth
   ```
3. Test magic link email - should now contain `https://tabletop-tavern.uk/auth/verify?token=...`

### Why This Fixes It
- Email clients block/warn about `http://` links
- NGINX HTTP→HTTPS redirects can lose query params
- `https://` links work properly from all email clients

---

## ⚠️ CRITICAL-2: Fix DM Not Showing in Lobby
- [ ] **Status:** Not Started
- **Priority:** CRITICAL
- **Complexity:** Medium
- **Estimated Time:** 2-3 hours
- **Issue:** DM doesn't appear in lobby as "connected user", causing confusion about who is present

### Current Implementation
- **File:** `/rollplay/app/game/components/LobbyPanel.js`
- Shows only users where `is_in_party: false`
- **File:** `/api-game/websocket_handlers/connection_manager.py` lines 94-97
- DM tracking unclear, may not be in lobby_users array

### Required Changes
1. Update ConnectionManager to explicitly track DM connection status
2. Send DM info in `lobby_update` WebSocket event as separate field
3. Update LobbyPanel to show DM status separately (e.g., "DM: [username] ✅ Connected")
4. Ensure DM appears distinct from regular lobby users

### Files Involved
- `/api-game/websocket_handlers/connection_manager.py`
- `/rollplay/app/game/components/LobbyPanel.js`
- `/rollplay/app/game/hooks/useWebSocket.js`
- `/rollplay/app/game/hooks/webSocketEvent.js`

### Dependencies
- None, but related to CRITICAL-3 (reconnection)

---

## ⚠️ CRITICAL-3: Fix Can't See Connected Users on Refresh
- [ ] **Status:** Not Started
- **Priority:** CRITICAL
- **Complexity:** Medium
- **Estimated Time:** 2-3 hours
- **Issue:** When page refreshes, WebSocket reconnects but doesn't fetch current room state

### Current Implementation
- **File:** `/rollplay/app/game/hooks/useWebSocket.js`
- WebSocket connects but doesn't request current state
- **File:** `/api-game/websocket_handlers/connection_manager.py`
- No "initial state" message sent on connect

### Required Changes
1. Create new WebSocket event type: `initial_state`
2. On WebSocket connect, backend sends:
   - Current lobby_users
   - Current seat_layout
   - DM name
   - Combat state
3. Frontend handles `initial_state` event to populate all state
4. Send this BEFORE broadcasting `player_connection` event

### Files Involved
- `/api-game/websocket_handlers/connection_manager.py`
- `/api-game/app.py` (WebSocket endpoint)
- `/rollplay/app/game/hooks/useWebSocket.js`
- `/rollplay/app/game/hooks/webSocketEvent.js`

### Dependencies
- Should be fixed alongside CRITICAL-2

---

## ⚠️ CRITICAL-4: Fix Users Can Re-Seat
- [ ] **Status:** Not Started
- **Priority:** CRITICAL
- **Complexity:** Medium
- **Estimated Time:** 1-2 hours
- **Issue:** Players can take multiple seats, breaking game integrity

### Current Implementation
- **File:** `/api-game/gameservice.py` (seat assignment logic)
- No validation preventing already-seated player from taking another seat
- No seat clearing on disconnect

### Required Changes
1. Add validation in GameService.assign_seat():
   - Check if player already occupies a seat
   - If yes, return error: "You already have a seat at position X"
2. On disconnect, send `seat_clear` event with player's current seat
3. Update seat to "empty" in MongoDB
4. Frontend shows toast notification if re-seat attempt fails

### Files Involved
- `/api-game/gameservice.py`
- `/api-game/websocket_handlers/connection_manager.py`
- `/rollplay/app/game/hooks/webSocketEvent.js`

### Dependencies
- Related to CRITICAL-5 (seat clearing)

---

## ⚠️ CRITICAL-5: Fix Seat Not Clearing on Refresh
- [ ] **Status:** Not Started
- **Priority:** CRITICAL
- **Complexity:** Medium
- **Estimated Time:** 1-2 hours
- **Issue:** When seated player refreshes, their seat doesn't clear, causing ghost players

### Current Implementation
- WebSocket disconnect doesn't trigger seat clearing
- ConnectionManager removes user but doesn't check if they were seated

### Required Changes
1. In ConnectionManager.disconnect():
   - Check if disconnecting user has a seat in current game
   - If yes, mark seat as "empty" in MongoDB
   - Broadcast `seat_clear` event with seat index
2. Frontend handles `seat_clear` to update UI immediately

### Files Involved
- `/api-game/websocket_handlers/connection_manager.py`
- `/api-game/gameservice.py`
- `/rollplay/app/game/hooks/webSocketEvent.js`

### Dependencies
- Same fix as CRITICAL-4 (seat validation)

---

## ⚠️ CRITICAL-6: Prevent DM from Taking Player Seats
- [ ] **Status:** Not Started
- **Priority:** CRITICAL
- **Complexity:** Simple
- **Estimated Time:** < 1 hour
- **Issue:** DM can sit in player seats, which breaks game logic

### Current Implementation
- No validation preventing DM from seat assignment
- Seat assignment doesn't check player role

### Required Changes
1. Add check in GameService.assign_seat():
   ```python
   if player_name == game_session["dungeon_master"]:
       raise ValueError("DM cannot take player seats")
   ```
2. Return error message to frontend
3. Frontend shows toast: "Dungeon Masters cannot take player seats"

### Files Involved
- `/api-game/gameservice.py` (seat assignment method)
- `/rollplay/app/game/hooks/webSocketEvent.js` (error handling)

### Dependencies
- None (quick fix)

---

## ⚠️ CRITICAL-7: Fix Name Tracking Bug (Jordy/Rob Issue)
- [ ] **Status:** Not Started
- **Priority:** CRITICAL
- **Complexity:** Complex
- **Estimated Time:** 1-2 days
- **Issue:** When one player leaves, different player's name disappears (data integrity issue)

### Current Implementation
- Player names used as primary identifier in ConnectionManager
- Seat layout stores player names, not IDs
- Disconnect logic may have name collision issue

### Root Cause Analysis Needed
- Use player IDs (UUIDs) instead of player names as primary identifier
- Display names derived from ID lookup
- Fix disconnect logic to only remove specific player

### Required Changes
1. **Backend:** Change ConnectionManager to use user_id as key instead of username
2. **MongoDB:** Store `user_id` in seat layout instead of `player_name`
3. **WebSocket Events:** Include both `user_id` and `player_name` in all events
4. **Frontend:** Track players by ID, display names via lookup

### Files Involved
- `/api-game/websocket_handlers/connection_manager.py` (refactor tracking)
- `/api-game/gameservice.py` (update seat structure)
- `/rollplay/app/game/hooks/useGameState.js` (use IDs)
- `/rollplay/app/game/hooks/webSocketEvent.js` (update event handling)

### Dependencies
- Large refactor, may affect all player-related features
- Consider this after fixing other critical bugs

### Notes
- This is the most complex critical bug
- Requires careful testing to avoid breaking existing functionality
- May need to create migration path for existing game sessions

---

# Phase 2: Quick Wins ✨
**Priority: HIGH** - Simple UI fixes, low effort, high impact

---

## 🎨 UI-1: Username Input Text Too Light
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 15 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/ScreenNameModal.js` line 42
- Text color not explicitly set, defaults to light gray

### Required Changes
- Add `text-slate-900` to input className

### Files Involved
- `/rollplay/app/dashboard/components/ScreenNameModal.js`

---

## 🎨 UI-2: Replace Delete Campaign Window Prompt with Modal
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/CampaignManager.js` line 529
- Uses browser `confirm()` dialog

### Required Changes
1. Create `DeleteCampaignModal.js` component (similar to `EndGameModal`)
2. Replace `window.confirm()` with modal state
3. Add proper styling consistent with app theme

### Files Involved
- `/rollplay/app/dashboard/components/CampaignManager.js`
- Create: `/rollplay/app/dashboard/components/DeleteCampaignModal.js`

---

## 🎨 UI-3: Fix Game Status Capitalization
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 15 minutes

### Current Implementation
- **Files:**
  - `/rollplay/app/dashboard/components/CampaignManager.js` line 587-590
  - `/rollplay/app/dashboard/components/GamesManager.js`
- Displays `game.status` directly (shows "inactive" instead of "Inactive")

### Required Changes
- Replace `{game.status}` with `{game.status.charAt(0).toUpperCase() + game.status.slice(1)}`
- Or create utility function: `capitalizeFirst(str)`

### Files Involved
- `/rollplay/app/dashboard/components/CampaignManager.js`
- `/rollplay/app/dashboard/components/GamesManager.js`

---

## 🎨 UI-4: Remove roomID Display
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 15 minutes

### Required Changes
- Search for `{roomId}` or `Room ID:` display in game page
- Remove any display of room ID from game interface

### Files Involved
- `/rollplay/app/game/page.js`
- Any game components displaying roomId

---

## 🎨 UI-5: Add Back Button to Game
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Required Changes
1. Add back button in top-left corner of game page
2. Links to `/dashboard?tab=games`
3. Style with arrow icon + "Back to Dashboard" text
4. Use shared button styles from constants.js

### Files Involved
- `/rollplay/app/game/page.js`

---

## 🎨 UI-6: Landing Page Text Simplification
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

### Current Implementation
- **File:** `/rollplay/app/page.js` line 85
- Text: "All you need to start is an email address and you can sign up passwordless to start managing campaigns and characters"

### Required Changes
- Change to: "All you need is an email address"

### Files Involved
- `/rollplay/app/page.js`

---

## 🎨 UI-7: Change Session Icon from Game Controller to Plus
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/CampaignManager.js` line 522
- Uses `faGamepad` icon

### Required Changes
- Change to `faPlus` icon (already imported line 20)

### Files Involved
- `/rollplay/app/dashboard/components/CampaignManager.js`

---

## 🎨 UI-8: Fix Friends Action Buttons Hover Consistency
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/FriendsManager.js`
- Inconsistent hover styles across friend action buttons

### Required Changes
- Audit all friend action button hover states
- Standardize to consistent color scheme (use PRIMARY_COLOR from constants)
- Apply to: Accept, Decline, Cancel, Remove buttons

### Files Involved
- `/rollplay/app/dashboard/components/FriendsManager.js`

---

## 🎨 UI-9: Default Dashboard Tab to Campaigns
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/page.js` line 19 - defaults to `'characters'`
- **File:** `/rollplay/app/dashboard/components/DashboardLayout.js` line 34 - fallback to `'characters'`

### Required Changes
- Change both to `'campaigns'`

### Files Involved
- `/rollplay/app/dashboard/page.js`
- `/rollplay/app/dashboard/components/DashboardLayout.js`

---

## 🎨 UI-10: Reorder Left Nav (Campaigns First)
- [ ] **Status:** Not Started
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/DashboardLayout.js` lines 98-152
- Order: Characters, Campaigns, Games, Friends

### Required Changes
- Reorder to: Campaigns, Games, Characters, Friends

### Files Involved
- `/rollplay/app/dashboard/components/DashboardLayout.js`

---

# Phase 3: Small Features 🔧
**Priority: MEDIUM** - Isolated changes, few hours each

---

## 🔧 FEATURE-1: Add DM Metadata to Games Tab
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 1-2 hours

### Current Implementation
- GamesManager doesn't show DM name/metadata

### Required Changes
1. **Backend:** Update game response to include DM info
   - File: `/api-site/modules/campaign/api/endpoints.py`
   - Add `dm_name` or `dm_username` to game response schema
2. **Frontend:** Display "Dungeon Master: {dm_name}" above "Players: x/y"
   - File: `/rollplay/app/dashboard/components/GamesManager.js`

### Files Involved
- `/api-site/modules/campaign/api/endpoints.py`
- `/api-site/modules/campaign/schemas/game_schemas.py`
- `/rollplay/app/dashboard/components/GamesManager.js`

---

## 🔧 FEATURE-2: Show Moderator Badge Against Player Names
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 2-3 hours

### Current Implementation
- No moderator tracking or display in game UI

### Required Changes
1. **Backend:** Add `moderators` array to game session (list of user_ids with moderator role)
2. **WebSocket:** Include `isModerator` flag in player data
3. **Frontend:** Add purple "MOD" badge next to player name if isModerator
   - File: `/rollplay/app/game/components/PlayerCard.js`

### Files Involved
- `/api-game/gameservice.py` (add moderator tracking)
- `/rollplay/app/game/components/PlayerCard.js`
- `/rollplay/app/game/hooks/webSocketEvent.js`

---

## 🔧 FEATURE-3: Rename "Friend UUID" to "Friend Code"
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/FriendsManager.js` line 23
- Variable: `friendUuid`
- UI Label: "Friend UUID"

### Required Changes
1. Rename variable to `friendCode`
2. Change UI label to "Friend Code"
3. Update placeholder text to be user-friendly
4. Update all references to "UUID" in friend context

### Files Involved
- `/rollplay/app/dashboard/components/FriendsManager.js`

---

## 🔧 FEATURE-4: Campaign Tile Toggle Expand/Collapse
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/CampaignManager.js` line 560
- Shows "Close" button requiring separate click

### Required Changes
- Change line 481 `onClick` logic to toggle
- If campaign is already selected, set to null (collapse)
- Remove "Close" button (clicking tile again closes it)

### Files Involved
- `/rollplay/app/dashboard/components/CampaignManager.js`

---

## 🔧 FEATURE-5: Character Ability Score Backend Validation (Max 30)
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Current Implementation
- **Frontend:** CharacterForm.js already has `max="30"` ✅
- **Backend:** No validation in CharacterAggregate

### Required Changes
- Add validation to `/api-site/modules/characters/domain/character_aggregate.py`
- In ability score setters, add:
  ```python
  if not (1 <= score <= 30):
      raise ValueError("Ability scores must be between 1 and 30")
  ```

### Files Involved
- `/api-site/modules/characters/domain/character_aggregate.py`

---

## 🔧 FEATURE-6: Polling for Friend/Game Invites
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 1-2 hours

### Current Implementation
- No automatic refresh, users must manually refresh page

### Required Changes
1. Create shared hook: `/rollplay/app/shared/hooks/useFetchInterval.js`
2. Poll `/api/friends/` every 10 seconds in FriendsManager
3. Poll `/api/games/my-games` every 10 seconds in GamesManager
4. Show notification badge when new invites appear
5. Add visual indicator when polling (subtle spinner or timestamp)

### Files Involved
- Create: `/rollplay/app/shared/hooks/useFetchInterval.js`
- `/rollplay/app/dashboard/components/FriendsManager.js`
- `/rollplay/app/dashboard/components/GamesManager.js`

### Notes
- Temporary solution until event-driven system exists
- Consider using SWR library for better polling management

---

## 🔧 FEATURE-7: Character Form +/- Increment Buttons for Ability Scores
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 1-2 hours

### Current Implementation
- **File:** `/rollplay/app/character/components/CharacterForm.js` lines 176-262
- Uses standard HTML number inputs

### Required Changes
1. Replace number input with custom control
2. Structure: `[-] [Value] [+]`
3. Style buttons as "gamified" with clear visual feedback
4. Maintain min/max validation (1-30)
5. Use Tailwind classes from constants.js

### Files Involved
- `/rollplay/app/character/components/CharacterForm.js`

### Notes
- Pure UI change, no backend impact
- Consider creating reusable `NumericStepper` component

---

## 🔧 FEATURE-8: Reposition Create Game Button
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

### Current Implementation
- **File:** `/rollplay/app/dashboard/components/CampaignManager.js` lines 518-522
- Button in top-right with config/delete buttons

### Required Changes
1. Move button to bottom-left of campaign tile
2. Make larger with text "Create Session"
3. Use `faPlus` icon
4. Apply prominent button styling

### Files Involved
- `/rollplay/app/dashboard/components/CampaignManager.js`

---

# Phase 4: Medium Features 🎯
**Priority: MEDIUM** - Requires design work, 1-2 days each

---

## 🎯 MEDIUM-1: Character Multi-Class Support
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 1-2 days
- **Issue:** Characters cannot have multiple classes (required for multi-class builds at level 3+)

### Current Implementation
- **File:** `/api-site/modules/characters/domain/character_aggregate.py` line 119
- Single `character_class: CharacterClass` field

### Required Changes

#### 1. Database Migration
- Change `character_class` column to `character_classes` (JSONB array)
- Migration script to convert existing single class to array with one element

#### 2. Domain Model Updates
- **File:** `/api-site/modules/characters/domain/character_aggregate.py`
  - Change `character_class: CharacterClass` to `character_classes: List[CharacterClass]`
  - Add validation: minimum 1 class, maximum 3 classes
  - Add business rule: can only add 2nd class if level >= 3
  - Add methods: `add_class()`, `remove_class()`

#### 3. Database Model Updates
- **File:** `/api-site/modules/characters/model/character_model.py`
  - Update SQLAlchemy model for JSONB array
  - Add proper serialization/deserialization

#### 4. Repository Updates
- **File:** `/api-site/modules/characters/repositories/character_repository.py`
  - Update ORM mapping for class array
  - Handle conversion in `from_persistence()` method

#### 5. API Schema Updates
- **File:** `/api-site/modules/characters/schemas/character_schemas.py`
  - Change response schema to return list of classes
  - Update request schema to accept list

#### 6. Frontend Updates
- **File:** `/rollplay/app/character/components/CharacterForm.js`
  - Replace single select with multi-select or tag input
  - Show warning if trying to add 2nd class before level 3
  - Display all selected classes with remove buttons

### Files Involved
- `/api-site/modules/characters/domain/character_aggregate.py`
- `/api-site/modules/characters/model/character_model.py`
- `/api-site/modules/characters/repositories/character_repository.py`
- `/api-site/modules/characters/schemas/character_schemas.py`
- `/api-site/modules/characters/api/endpoints.py`
- `/rollplay/app/character/components/CharacterForm.js`
- Create Alembic migration file

### Dependencies
- Requires database migration
- Affects all character CRUD operations
- Must maintain backward compatibility during migration

### Testing Requirements
- Test migration on development database
- Test single class → multi-class conversion
- Test validation rules (max 3 classes, level 3 requirement)
- Test frontend display with 1, 2, and 3 classes

---

## 🎯 MEDIUM-2: Ability Score Point-Buy System
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 1-2 days
- **Feature:** Add D&D standard point-buy system for ability score creation

### Current Implementation
- Manual numeric input for each ability score
- No point calculation or validation

### D&D 5e Point-Buy Rules
- Start with 27 points to spend
- Base score: 8 (costs 0 points)
- Score costs:
  - 8 = 0 points
  - 9 = 1 point
  - 10 = 2 points
  - 11 = 3 points
  - 12 = 4 points
  - 13 = 5 points
  - 14 = 7 points
  - 15 = 9 points
- Maximum starting score: 15 (before racial bonuses)

### Required Changes

#### 1. Create Ability Score Builder Component
- **Create:** `/rollplay/app/character/components/AbilityScoreBuilder.js`
- Three modes:
  - **Manual Entry:** Current behavior (free input)
  - **Point-Buy:** Calculate points, enforce limits
  - **Random:** Roll dice (4d6 drop lowest or 3d6)

#### 2. Add Point-Buy Logic Utility
- **Create:** `/rollplay/app/character/utils/abilityScoreCalculations.js`
- Functions:
  - `calculatePointCost(score)`: Returns point cost for score
  - `calculateTotalPoints(scores)`: Sum of all scores' costs
  - `validatePointBuy(scores)`: Check if valid (≤ 27 points, no score > 15)
  - `rollAbilityScore(method)`: Generate random scores

#### 3. Add Randomizer Logic
- **4d6 drop lowest:** Roll 4 dice, sum top 3
- **3d6 straight:** Roll 3 dice, sum all
- Add "Reroll All" button
- Show roll history (what was rolled)

#### 4. Update Character Form
- **File:** `/rollplay/app/character/components/CharacterForm.js`
- Add toggle/tabs for entry mode
- Show remaining points in point-buy mode
- Disable inputs if no points left
- Show modifiers (+1, +2, etc.) next to scores

### Files Involved
- Create: `/rollplay/app/character/components/AbilityScoreBuilder.js`
- Create: `/rollplay/app/character/utils/abilityScoreCalculations.js`
- `/rollplay/app/character/components/CharacterForm.js`

### Dependencies
- None (frontend-only feature)
- No backend changes needed

### Testing Requirements
- Test point-buy calculations match D&D rules
- Test validation prevents exceeding 27 points
- Test random roller produces valid distributions
- Test switching between modes preserves valid states

---

## 🎯 MEDIUM-3: Friends Invite UI Improvements
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 1-2 days

### Current Implementation
- Simple list, no overflow handling
- All friends shown at once

### Required Changes
1. Add accordion/collapsible sections:
   - "Friends" (accepted)
   - "Sent Invites" (pending from me)
   - "Received Invites" (pending to me)
2. Each section scrolls independently (max-height with overflow)
3. Show count badges on collapsed sections
4. Consider pagination if > 50 friends
5. Add search/filter for friends list

### Files Involved
- `/rollplay/app/dashboard/components/FriendsManager.js`
- Consider creating: `FriendsList.js`, `FriendInvitesList.js` sub-components

---

## 🎯 MEDIUM-4: Shorten UUID to Friendly Friend Code
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 1-2 days
- **Issue:** Full UUID (36 characters) not user-friendly

### Proposed Solution
- Generate 8-12 character alphanumeric "friend code" for each user
- Example: `TB4K-2X9P` or `MATT-1234`
- Store mapping in database

### Required Changes

#### 1. Create Friend Code Database Table
- **Create:** `/api-site/modules/user/model/friend_code_model.py`
- Table: `friend_codes`
- Columns:
  - `user_id` (UUID, FK to users, unique)
  - `friend_code` (VARCHAR(12), unique, indexed)
  - `created_at` (timestamp)

#### 2. Generate Friend Code on User Creation
- **File:** `/api-site/modules/user/domain/user_aggregate.py`
- Add `friend_code` property
- Generate on user creation using collision-resistant algorithm:
  - Format: 4 letters + 4 numbers (e.g., `ABCD-1234`)
  - Check for collisions, regenerate if needed
  - Case-insensitive for user entry

#### 3. Add API Endpoint
- **File:** `/api-site/modules/user/api/endpoints.py`
- Add `GET /api/users/by-friend-code/{code}`
- Returns user if found, 404 if not

#### 4. Update Friend Invite Logic
- Accept friend code instead of UUID for invites
- Backend resolves code to user_id

#### 5. Update Frontend
- **File:** `/rollplay/app/dashboard/components/FriendsManager.js`
- Display user's friend code prominently
- Add copy button
- Accept friend code in invite input
- Show user's friend code in profile/settings

### Files Involved
- Create: `/api-site/modules/user/model/friend_code_model.py`
- `/api-site/modules/user/domain/user_aggregate.py`
- `/api-site/modules/user/repositories/user_repository.py`
- `/api-site/modules/user/api/endpoints.py`
- `/rollplay/app/dashboard/components/FriendsManager.js`
- Create Alembic migration

### Dependencies
- Database migration required
- Affects friend invite flow
- Need to generate codes for existing users

---

## 🎯 MEDIUM-5: Rename "End Game" to "Save & Exit" or "Pause"
- [ ] **Status:** Not Started
- **Complexity:** Simple
- **Estimated Time:** 30 minutes
- **Issue:** Users think "End" means delete campaign

### Required Changes
- Change button text to "Pause Session" or "Save & Exit"
- Update modal title and messaging
- No backend changes needed

### Files Involved
- `/rollplay/app/dashboard/components/CampaignManager.js` line 629
- `/rollplay/app/dashboard/components/GamesManager.js`
- `/rollplay/app/dashboard/components/EndGameModal.js`

---

## 🎯 MEDIUM-6: Show Campaigns User Is Participating In
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 1-2 days
- **Issue:** Players only see campaigns they own, not campaigns they're playing in

### Current Implementation
- Dashboard only shows DM-owned campaigns

### Required Changes

#### 1. Backend Query
- **File:** `/api-site/modules/campaign/application/queries.py`
- Add `GetParticipatingCampaigns` query
- Returns campaigns where user is in any game (not as DM)
- SQL: Join campaigns → games → game_players where user_id matches

#### 2. Backend API Endpoint
- **File:** `/api-site/modules/campaign/api/endpoints.py`
- Add `GET /api/campaigns/participating`
- Returns list of campaigns user is playing in

#### 3. Frontend Display
- **File:** `/rollplay/app/dashboard/components/CampaignManager.js`
- Show two sections:
  - "My Campaigns" (owned by user, full permissions)
  - "Playing In" (participant, view-only)
- Different styling/permissions for each section

### Files Involved
- `/api-site/modules/campaign/application/queries.py`
- `/api-site/modules/campaign/repositories/campaign_repository.py`
- `/api-site/modules/campaign/api/endpoints.py`
- `/rollplay/app/dashboard/components/CampaignManager.js`

### Dependencies
- Requires join query across campaigns and games
- May need to optimize query performance with indexes

---

## 🎯 MEDIUM-7: Post-Game Summary / Session History
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** 1-2 days
- **Feature:** DM writes post-session summary, visible as breadcrumbs in campaign

### Proposed Flow
1. DM clicks "Pause Session" (End Game)
2. Modal shows: "Write a summary of today's session" (optional text area)
3. DM writes: "Today the party defeated the goblin king and recovered the ancient tome"
4. Summary saved with session
5. Campaign view shows expandable history: list of sessions with summaries

### Required Changes

#### 1. Add Summary Field to Game Entity
- **File:** `/api-site/modules/campaign/game/domain/entities.py`
- Add `session_summary: Optional[str]` field
- **File:** `/api-site/modules/campaign/model/game_model.py`
- Add `session_summary` column (TEXT, nullable)

#### 2. Update End Game Flow
- **File:** `/rollplay/app/dashboard/components/EndGameModal.js`
- Add text area for session summary
- Make optional (can skip)
- Pass summary to API

#### 3. API Update
- **File:** `/api-site/modules/campaign/api/endpoints.py`
- Add `session_summary` parameter to end game endpoint
- Save summary when ending game

#### 4. Campaign History Display
- **File:** `/rollplay/app/dashboard/components/CampaignManager.js`
- Add "Session History" section below game list
- Show each session with:
  - Date played
  - Duration (start → end time)
  - Summary (expandable)
  - Players who participated

### Files Involved
- `/api-site/modules/campaign/game/domain/entities.py`
- `/api-site/modules/campaign/model/game_model.py`
- `/api-site/modules/campaign/api/endpoints.py`
- `/rollplay/app/dashboard/components/EndGameModal.js`
- `/rollplay/app/dashboard/components/CampaignManager.js`
- Create: `/rollplay/app/dashboard/components/SessionHistoryPanel.js`
- Create Alembic migration

### Dependencies
- Database migration required
- Affects game end flow

---

# Phase 5: Major Rethinks 🏗️
**Priority: LOW** - Architectural changes, requires full sprint (5-10 days each)

---

## 🏗️ MAJOR-1: Users vs Characters in Game Invites
- [ ] **Status:** Not Started
- **Complexity:** Complex
- **Estimated Time:** 5-7 days
- **Issue:** Game must be ACTIVE for player to respond to invite (bad UX)

### Root Cause
- Characters are invited to games before game starts
- Players can't accept until game is running
- Backwards invite flow

### Proposed Solution

#### New Invite Flow
1. **Invite Phase:** DM invites USERS to game (not characters)
2. **Accept Phase:** User accepts invite → added to `joined_users` list
3. **Character Selection:** When DM starts game (status=STARTING), prompt each joined user to select character
4. **Game Start:** Once all users have selected characters, transition to ACTIVE

### Required Changes

#### 1. Database Schema Changes
- Change game invites to reference `user_id` instead of `character_id`
- Add `joined_users` array to game model
- Add `pending_character_selection` mapping (user_id → selected_character_id)

#### 2. Game Entity Updates
- **File:** `/api-site/modules/campaign/game/domain/entities.py`
- Add `joined_user_ids: List[UUID]`
- Add `character_selections: Dict[UUID, UUID]` (user_id → character_id)
- Add business rules:
  - User can accept invite while game is INACTIVE
  - Character selection only when game is STARTING
  - All users must select character before ACTIVE

#### 3. API Changes
- **File:** `/api-site/modules/campaign/api/endpoints.py`
- Add `POST /api/games/{game_id}/join` (user accepts invite)
- Add `POST /api/games/{game_id}/select-character` (user picks character)
- Update start game flow to check character selections

#### 4. Frontend Changes
- **File:** `/rollplay/app/dashboard/components/GameInviteModal.js`
- Show user invites (not character selection at invite time)
- Create: `/rollplay/app/dashboard/components/CharacterSelectionModal.js`
- Show when game starts, user must pick character

#### 5. ETL Pipeline Update
- **File:** `/api-site/modules/campaign/application/commands.py` (StartGame)
- Check all joined users have selected characters
- Gather character data for ETL to api-game
- Include user_id → character_id mapping in game session

### Files Involved
- `/api-site/modules/campaign/game/domain/entities.py`
- `/api-site/modules/campaign/model/game_model.py`
- `/api-site/modules/campaign/repositories/campaign_repository.py`
- `/api-site/modules/campaign/api/endpoints.py`
- `/api-site/modules/campaign/application/commands.py`
- `/rollplay/app/dashboard/components/GameInviteModal.js`
- Create: `/rollplay/app/dashboard/components/CharacterSelectionModal.js`
- `/rollplay/app/dashboard/components/GamesManager.js`
- Create Alembic migration

### Dependencies
- Large refactor, affects game lifecycle
- Affects ETL pipeline
- Requires careful migration of existing invites

### Testing Requirements
- Test new invite flow end-to-end
- Test character selection modal
- Test game start with all/partial character selections
- Test migration of existing game invites

---

## 🏗️ MAJOR-2: Terminology Overhaul (Game → Session)
- [ ] **Status:** Not Started
- **Complexity:** Very Complex
- **Estimated Time:** 10-15 days (full sprint)
- **Issue:** Users confused by "Game" vs "Campaign" terminology

### Current Terminology Issues
- "Campaign" - users think this is the overall game
- "Game" - users think this should be called "session" or "party"
- Misalignment with D&D terminology expectations

### Proposed Terminology
- **Campaign:** Overall story/world (unchanged, correct)
- **Session:** Individual play sessions (rename from "Game")
- **Party:** Seated players in active session (new term)

### Required Changes

#### 1. Database Changes
- Rename `games` table → `sessions`
- Rename all `game_id` columns → `session_id`
- Update foreign keys, indexes, constraints
- Create comprehensive Alembic migration

#### 2. Backend Module Rename
- Rename `/api-site/modules/campaign/game/` → `/api-site/modules/campaign/session/`
- Rename `GameEntity` → `SessionEntity`
- Rename all `game_*` variables → `session_*`
- Update all imports

#### 3. Backend API Routes
- Change `/api/games/` → `/api/sessions/`
- Update all endpoint paths
- Maintain backward compatibility with redirect middleware

#### 4. API-Game Service Rename
- Consider renaming `api-game` → `api-session`
- Update MongoDB collection: `active_sessions` (already correct!)
- Update all internal references

#### 5. Frontend Global Find/Replace
- Replace "Game" → "Session" in all UI text
- Replace "game" → "session" in all variables
- Update route paths
- Update API calls

#### 6. NGINX Configuration
- Update route mappings:
  - `/api/games/` → `/api/sessions/`
  - `/game/` → `/session/` (or keep as `/game/` for active sessions?)
- Restart NGINX

### Files Involved
- **100+ files affected across entire codebase**
- All backend game modules
- All frontend game components
- Database migration
- NGINX configs
- Documentation

### Migration Strategy
1. Create feature branch: `terminology-overhaul`
2. Run global find/replace with careful review
3. Update database schema
4. Test all flows end-to-end
5. Update documentation
6. Merge with comprehensive testing

### Dependencies
- Affects entire codebase
- Requires full regression testing
- High risk of breaking changes

### Testing Requirements
- Full regression test suite
- Test all game/session lifecycle flows
- Test all API endpoints
- Test frontend routing
- Test WebSocket connections

---

## 🏗️ MAJOR-3: Campaign Participation Visibility
- [ ] **Status:** Not Started
- **Complexity:** Medium
- **Estimated Time:** (Covered in MEDIUM-6)
- **Note:** This is already detailed in MEDIUM-6 above

---

## 🏗️ MAJOR-4: Campaign History Breadcrumbs System
- [ ] **Status:** Not Started
- **Complexity:** Complex
- **Estimated Time:** 5-7 days
- **Feature:** Full campaign history with session summaries, adventure log, and timeline

### Proposed Features
1. **Session Timeline:** Chronological list of all sessions
2. **Session Summaries:** DM-written summaries (from MEDIUM-7)
3. **Adventure Log Integration:** Key events from each session
4. **Player Participation:** Who played in each session
5. **Milestones:** Important campaign moments (level ups, major boss defeats)

### Required Changes

#### 1. Adventure Log Persistence
- Currently adventure log lives in MongoDB during active session
- Need to persist to PostgreSQL on session end
- Add `adventure_log_entries` table linked to game/session

#### 2. Campaign History Component
- **Create:** `/rollplay/app/dashboard/components/CampaignHistory.js`
- Expandable timeline showing:
  - Session date
  - Session summary (from DM)
  - Key events (from adventure log)
  - Players who participated
  - Level changes, loot, etc.

#### 3. Backend Query
- **File:** `/api-site/modules/campaign/application/queries.py`
- Add `GetCampaignHistory` query
- Returns all sessions with summaries and log entries

#### 4. API Endpoint
- **File:** `/api-site/modules/campaign/api/endpoints.py`
- Add `GET /api/campaigns/{campaign_id}/history`

### Files Involved
- Create table: `adventure_log_entries`
- `/api-site/modules/campaign/application/queries.py`
- `/api-site/modules/campaign/api/endpoints.py`
- Create: `/rollplay/app/dashboard/components/CampaignHistory.js`
- Update ETL pipeline to persist adventure log
- Create Alembic migration

### Dependencies
- Depends on MEDIUM-7 (session summaries)
- Requires ETL pipeline update
- Database schema changes

---

# Technical Debt & Infrastructure 🔧

---

## 🔧 TECH-1: Investigate Ghostery Extension Blocking Emails
- [ ] **Status:** Not Started
- **Complexity:** Unknown
- **Estimated Time:** 1-2 hours investigation

### Issue
- Ghostery browser extension prevents email from being sent
- May be blocking SMTP port or API endpoint

### Investigation Steps
1. Check browser console with Ghostery enabled
2. Check network requests during magic link send
3. Test with Ghostery disabled
4. Check if endpoint name triggers blocking ("magic-link")

### Potential Solutions
1. Rename endpoint from `/auth/magic-link` to `/auth/email-login`
2. Update NGINX config to use different path
3. Whitelist domain in Ghostery (document for users)
4. Test with other ad blockers

### Files Involved
- `/api-auth/app.py` line 57
- `/rollplay/app/auth/magic/page.js`
- `/docker/dev/nginx/nginx.conf` line 354
- `/docker/prod/nginx/nginx.conf`

---

# Notes & Considerations 📝

## Priority Recommendations

### Week 1: Critical Bugs + Quick Wins
**Focus:** Unblock users, fix production issues
- Fix magic link (CRITICAL-1)
- Fix all game lobby issues (CRITICAL-2 through CRITICAL-6)
- Complete all Quick Wins (UI-1 through UI-10)

**Estimated Time:** 5-7 days

### Week 2: Small Features
**Focus:** Polish existing features
- Complete FEATURE-1 through FEATURE-8
- Polish UI, add missing metadata
- Implement polling for invites

**Estimated Time:** 5 days

### Weeks 3-4: Medium Features
**Focus:** Enhance core systems
- Multi-class support (MEDIUM-1)
- Point-buy system (MEDIUM-2)
- Friend code system (MEDIUM-4)
- Session summaries (MEDIUM-7)

**Estimated Time:** 10 days

### Weeks 5+: Major Rethinks
**Focus:** Architectural improvements
- User invite redesign (MAJOR-1)
- Consider terminology overhaul (MAJOR-2) - significant effort

**Estimated Time:** 15-20 days

---

## Risk Assessment

### High Risk (Requires Careful Testing)
- CRITICAL-7: Name tracking refactor (affects core player tracking)
- MAJOR-1: User invite redesign (changes game lifecycle)
- MAJOR-2: Terminology overhaul (touches 100+ files)

### Medium Risk
- MEDIUM-1: Multi-class support (database migration)
- MEDIUM-4: Friend code system (affects user model)
- CRITICAL-3: Reconnection state (complex WebSocket logic)

### Low Risk (Safe to Implement)
- All Quick Wins (UI-only changes)
- Most Small Features (isolated changes)
- MEDIUM-2: Point-buy system (frontend-only)

---

## Dependencies Map

```
CRITICAL-1 → None (fix immediately)
CRITICAL-2 ← CRITICAL-3 (related, fix together)
CRITICAL-4 ← CRITICAL-5 (same fix)
CRITICAL-6 → None (quick fix)
CRITICAL-7 → Block other features (fix early or late)

MEDIUM-1 → Blocks character-related features
MEDIUM-4 → Affects friend system
MEDIUM-7 → Required for MAJOR-4

MAJOR-1 → Large refactor, do as dedicated sprint
MAJOR-2 → Massive refactor, plan carefully
MAJOR-4 ← MEDIUM-7 (requires session summaries)
```

---

## Success Metrics

### Critical Bugs Fixed
- [ ] Production auth working (magic link)
- [ ] Game lobby fully functional
- [ ] Reconnection working
- [ ] Seat assignment working correctly

### User Experience Improved
- [ ] All UI text clear and consistent
- [ ] No confusing terminology
- [ ] Responsive updates (polling or events)
- [ ] Intuitive invite flow

### Feature Completeness
- [ ] Multi-class characters
- [ ] Point-buy system
- [ ] Session summaries
- [ ] Campaign history

---

**End of Task File**
