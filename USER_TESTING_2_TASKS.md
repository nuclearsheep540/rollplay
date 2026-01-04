# User Testing Tasks - Rollplay (Batch 2)
**Last Updated:** 2025-12-09
**Source:** User testing feedback from production testing sessions

---

## 📊 Progress Overview

**Total Tasks:** 10 issues across 4 implementation phases
**Status:** Not Started

### By Phase:
- **Phase 1 (Quick Wins):** 0/5 completed
- **Phase 2 (Character Enhancements):** 0/2 completed
- **Phase 3 (Bug Investigation):** 0/2 completed
- **Phase 4 (Account System):** 0/1 completed

---

## Phase 1: Quick Wins & UI Polish 🎨
**Priority:** HIGH | **Risk:** LOW | **Estimated Time:** 2-3 hours

---

### Issue 1: Character Edit Redirect Missing Tab Parameter
- [ ] **Status:** Not Started
- **Priority:** HIGH
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

#### Problem
When editing a character, the redirect goes to `/dashboard` without the `?tab=characters` parameter, so users land on the wrong tab (defaults to Campaigns).

#### Current Implementation
**File:** `/home/matt/rollplay/rollplay/app/character/edit/[id]/page.js` line 68
```javascript
router.push('/dashboard')  // ❌ Missing tab parameter
```

#### Required Changes
Update redirect to include tab parameter:
```javascript
router.push('/dashboard?tab=characters')  // ✅ Matches create behavior
```

#### Files Involved
- `/home/matt/rollplay/rollplay/app/character/edit/[id]/page.js`

---

### Issue 2: "Create Game" vs "Create Session" Terminology Inconsistency
- [ ] **Status:** Not Started
- **Priority:** HIGH
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

#### Problem
Button says "Create Session" but modal heading says "Create New Game" - inconsistent terminology after Game → Session refactor.

#### Current Implementation
**File:** `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignManager.js`
- Line 810: Button text = `"Create Session"` ✅
- Line 1019: Modal heading = `"Create New Game"` ❌
- Line 1023: Input label = `"Game Name"` ❌

#### Required Changes
- Line 1019: Change to `"Create New Session"`
- Line 1023: Change to `"Session Name"`

#### Files Involved
- `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignManager.js`

---

### Issue 3: Campaign Invite Modal Input Fields Use Light Theme
- [ ] **Status:** Not Started
- **Priority:** MEDIUM
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

#### Problem
FriendsManager uses dark theme inputs (`bg-slate-700`), but CampaignInviteModal uses light theme - inconsistent styling.

#### Current Implementation
**FriendsManager:** Dark theme ✅
```javascript
className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-200 ..."
```

**CampaignInviteModal:** Light theme ❌
```javascript
className="w-full px-4 py-2 border border-slate-300 ..."
```

#### Required Changes
Update CampaignInviteModal input styling to match FriendsManager dark theme.

#### Files Involved
- `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignInviteModal.js` (line 231)

---

### Issue 4: Remove "UUID" References in Friend Invite UI
- [ ] **Status:** Not Started
- **Priority:** MEDIUM
- **Complexity:** Trivial
- **Estimated Time:** < 5 minutes

#### Problem
UI still references "UUID" in placeholders, even though we use human-friendly friend codes.

#### Current Implementation
**File:** `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignInviteModal.js` line 230
```javascript
placeholder="Enter friend code (UUID)"  // ❌ Technical jargon
```

#### Required Changes
Update placeholder to be user-friendly:
```javascript
placeholder="Enter account tag (e.g., matt#1234)"  // ✅ Will be account tag in Phase 4
```

**Note:** This will be further updated in Phase 4 when account names replace friend codes.

#### Files Involved
- `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignInviteModal.js`

---

### Issue 5: Audit for Raw UUID Display in Friend Lookup
- [ ] **Status:** Not Started
- **Priority:** MEDIUM
- **Complexity:** Simple
- **Estimated Time:** 30 minutes

#### Problem
Ensure no raw UUIDs are exposed in friend-related UI (debug logs, error messages, displays).

#### Current Implementation
**Known issues:**
- CampaignInviteModal has debug `console.log` statements (lines 43-44)
- Need to verify all friend displays use `screen_name` or `friend_code`, never `user_id`

#### Required Actions
1. Remove debug logging that exposes UUIDs
2. Audit FriendsManager and CampaignInviteModal displays
3. Verify API responses use PublicUserResponse schema (no user_id in body)

#### Files Involved
- `/home/matt/rollplay/rollplay/app/dashboard/components/FriendsManager.js`
- `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignInviteModal.js`

---

## Phase 2: Character Creation Enhancements ⚔️
**Priority:** HIGH | **Risk:** MEDIUM (database migration) | **Estimated Time:** 1-2 days

---

### Issue 6: Add Temporary HP System to Character Creation
- [ ] **Status:** Not Started
- **Priority:** HIGH
- **Complexity:** Medium
- **Estimated Time:** 1 day

#### Problem
No temp HP field exists. D&D 5e uses temporary hit points extensively, and users need to track them.

#### D&D Convention
Display format: `"25/30 + 5 temp"` (current / max + temp)

#### Required Changes

**Backend (4 files + migration):**
1. Database migration to add `temp_hp` column (INTEGER, default 0)
2. Update Character model to include `temp_hp` field
3. Update Character aggregate with temp_hp field and validation:
   - Current HP cannot exceed Max HP
   - Current HP cannot be negative
   - Temp HP cannot be negative
4. Update Character schemas (request/response)
5. Update Character repository ORM mapping

**Frontend (1 file):**
1. CharacterForm component redesign:
   - Add temp_hp to form state
   - Create visual HP display: `"25/30 + 5 temp"` format
   - Add Temp HP input control (NumericStepper)
   - Enforce current_hp ≤ max_hp validation

#### Files Involved

**Backend:**
- New Alembic migration: `add_temp_hp_to_characters.py`
- `/home/matt/rollplay/api-site/modules/characters/model/character_model.py`
- `/home/matt/rollplay/api-site/modules/characters/domain/character_aggregate.py`
- `/home/matt/rollplay/api-site/modules/characters/api/schemas.py`
- `/home/matt/rollplay/api-site/modules/characters/orm/character_repository.py`

**Frontend:**
- `/home/matt/rollplay/rollplay/app/character/components/CharacterForm.js`

#### Testing Requirements
- [ ] Create character with temp HP → verify saves
- [ ] Try setting current HP > max HP → verify validation error
- [ ] HP display shows `"25/30 + 5 temp"` format correctly
- [ ] Edit character → temp HP loads correctly
- [ ] Backend validation prevents negative values

---

### Issue 7: Ability Score Bonus Visualization
- [ ] **Status:** Not Started
- **Priority:** HIGH
- **Complexity:** Simple
- **Estimated Time:** 1-2 hours

#### Problem
Green highlighting shows *that* a bonus exists, but doesn't show *how much* (+2 or +1).

#### User Requirement
Show bonus amounts in **BOTH** places:
1. NumericStepper label: `"STR: 16 (+2)"`
2. OriginBonusAllocator dropdown: `"Strength (+2)"`

#### Current Implementation
- Green highlighting: ✅ Working (via `hasBonus` prop)
- Bonus amount display: ❌ Not shown

#### Required Changes

**NumericStepper Component:**
- Add `bonus` prop to component signature
- Update label display to show `(+X)` when bonus > 0

**AbilityScoreBuilder Component:**
- Pass `bonus={originBonuses[key] || 0}` to NumericStepper

**OriginBonusAllocator Component:**
- Verify dropdown labels already show bonus amounts
- If not, add `(+{bonus})` to option labels

#### Files Involved
- `/home/matt/rollplay/rollplay/app/character/components/NumericStepper.js`
- `/home/matt/rollplay/rollplay/app/character/components/AbilityScoreBuilder.js`
- `/home/matt/rollplay/rollplay/app/character/components/OriginBonusAllocator.js`

#### Testing Requirements
- [ ] Ability scores with origin bonuses show "(+2)" or "(+1)" in label
- [ ] OriginBonusAllocator dropdowns show "Strength (+2)"
- [ ] Bonus only displays when bonus > 0
- [ ] Create character with background bonuses → verify displays correctly

---

## Phase 3: Bug Investigation & Fixes 🔍
**Priority:** MEDIUM | **Risk:** LOW | **Estimated Time:** 2-4 hours

---

### Issue 8: Level Sum Bug - Edit Shows Wrong Level
- [ ] **Status:** Needs Investigation
- **Priority:** MEDIUM
- **Complexity:** Unknown (depends on root cause)
- **Estimated Time:** 2-4 hours

#### Reported Issue
User creates "Bard level 3" → Edit character → Shows "Bard level 1"

#### Suspected Causes
1. Backend: `character_classes` JSONB deserialization issue
2. Frontend: `initialData` not properly passed to MultiClassSelector
3. API response: Incorrect level values in CharacterClassInfo objects

#### Investigation Steps

**1. Add Debug Logging**
Add to edit page after API fetch:
```javascript
console.log('=== CHARACTER EDIT DEBUG ===')
console.log('API Response:', data)
console.log('Character Classes:', data.character_classes)
console.log('Total Level:', data.level)
console.log('===========================')
```

**2. Verify Backend Response Schema**
Check `_to_character_response()` function:
- Verify character_classes array structure
- Ensure all CharacterClassInfo objects have correct level values

**3. Verify MultiClassSelector Initialization**
Check how `characterClasses` prop is initialized from `initialData`

**4. Verify CharacterRepository**
Check `to_aggregate()` method JSONB deserialization

#### Files to Investigate
- `/home/matt/rollplay/rollplay/app/character/edit/[id]/page.js`
- `/home/matt/rollplay/api-site/modules/characters/api/endpoints.py`
- `/home/matt/rollplay/api-site/modules/characters/orm/character_repository.py`
- `/home/matt/rollplay/rollplay/app/character/components/MultiClassSelector.js`

#### Potential Fixes (TBD after investigation)
- Fix backend deserialization
- Fix frontend initialization
- Add fallback for malformed data

#### Testing Requirements
- [ ] Create level 3 single-class character → Edit → Verify shows level 3
- [ ] Create multiclass (Fighter 5 / Rogue 3) → Edit → Verify shows both classes with correct levels
- [ ] Character classes array structure matches expected format

---

### Issue 9: Ability Score Decrease Bug (Deferred)
- [ ] **Status:** Deferred (user said "address later if can't replicate")
- **Priority:** LOW
- **Complexity:** Unknown
- **Estimated Time:** TBD

#### Reported Issue
User has:
- STR base score: 2
- Origin bonus: +2
- Total: 4

User **cannot decrease base score to 1** (which would make total = 3).

#### Note from User
"If we can't replicate this bug, we can address it later"

#### Action
- Document as known potential issue
- If reported again during Phase 2 testing, investigate:
  - Check if origin bonus incorrectly affects min value in manual mode
  - Review AbilityScoreBuilder base score calculation logic

#### File to Investigate (if needed)
- `/home/matt/rollplay/rollplay/app/character/components/AbilityScoreBuilder.js` (lines 46-51)

---

## Phase 4: Account Name System (Major Refactor) 🏗️
**Priority:** MEDIUM | **Risk:** HIGH (breaking change) | **Estimated Time:** 3-5 days

---

### Issue 10: Replace Friend Codes with Discord-Style Account Names
- [ ] **Status:** Not Started
- **Priority:** MEDIUM
- **Complexity:** Very Complex
- **Estimated Time:** 3-5 days

#### Design Decisions (Confirmed with User)

**Account Name Format:**
- ✅ Discord-style: `account_name#1234` (tag derived from last 4 chars of user ID)
- ✅ account_name: Immutable, 3-20 chars, alphanumeric + dash/underscore
- ✅ Must start with letter or number

**Migration Strategy:**
- ✅ Force account name selection on next login (blocking modal)
- ✅ Existing users: No auto-generation, must choose on next login
- ✅ New users: Must set account_name at creation

**Display Priority:**
- ✅ `screen_name` remains **primary** display (friendly name)
- ✅ `account_name#tag` shown in **profile/settings only** (unique identifier)

**Friend Code Integration:**
- ✅ **REPLACE friend codes entirely**
- ✅ Use `account_name#tag` for friend lookups
- ✅ Deprecate `friend_codes` table

#### Key Changes

**1. Database Migration**
- Add `account_name` column to users table (nullable initially)
- Add unique constraint + index on account_name
- friend_codes table remains but deprecated

**2. Backend (User Aggregate)**
- Add `account_name: Optional[str]` field
- Add `set_account_name()` method (one-time operation, immutable)
- Add `get_friend_tag()` method (format: `account_name#1234`)
- Add account name validation:
  - 3-20 characters
  - Letters, numbers, dash, underscore only
  - Must start with letter/number

**3. Backend (User Endpoints)**
- New endpoint: `POST /api/users/me/account-name` (set account name)
- New endpoint: `GET /api/users/account-name/check/{account_name}` (availability check)
- New endpoint: `GET /api/users/by-friend-tag/{friend_tag}` (lookup by account_name#tag)
- Update UserResponse schemas to include `account_name` and `friend_tag`

**4. Frontend (New AccountNameModal)**
- Blocking modal shown if user.account_name is null
- Debounced availability check (500ms)
- Real-time validation feedback
- Preview of friend tag format: `account_name#????`
- Warning: "Cannot be changed after creation"

**5. Frontend (Dashboard Integration)**
- Check if user has account_name on login
- Show AccountNameModal if account_name is null (blocking)
- After submission, reload user data

**6. Frontend (Friend Lookup Updates)**
- FriendsManager: Replace friend code lookup with friend tag lookup
- CampaignInviteModal: Replace UUID lookup with friend tag lookup
- Update input placeholders: `"Enter friend tag (e.g., matt#a3f2)"`
- Display friend tags instead of friend codes

#### Files Involved

**Backend (6 files + migration):**
- New Alembic migration: `add_account_name_deprecate_friend_codes.py`
- `/home/matt/rollplay/api-site/modules/user/model/user_model.py`
- `/home/matt/rollplay/api-site/modules/user/domain/user_aggregate.py`
- `/home/matt/rollplay/api-site/modules/user/api/schemas.py`
- `/home/matt/rollplay/api-site/modules/user/api/endpoints.py`
- `/home/matt/rollplay/api-site/modules/user/orm/user_repository.py`

**Frontend (4 files):**
- Create: `/home/matt/rollplay/rollplay/app/dashboard/components/AccountNameModal.js`
- Update: `/home/matt/rollplay/rollplay/app/dashboard/page.js`
- Update: `/home/matt/rollplay/rollplay/app/dashboard/components/FriendsManager.js`
- Update: `/home/matt/rollplay/rollplay/app/dashboard/components/CampaignInviteModal.js`

#### Implementation Steps

**Step 1: Backend Foundation**
1. Create database migration (account_name column)
2. Update User model
3. Update User aggregate (validation, set_account_name, get_friend_tag)
4. Update User schemas (add account_name, friend_tag)

**Step 2: Backend Endpoints**
1. Add account name availability check endpoint
2. Add set account name endpoint
3. Add friend tag lookup endpoint
4. Update repository methods (account_name_exists, get_by_account_name)

**Step 3: Frontend Modal**
1. Create AccountNameModal component
2. Implement debounced availability check
3. Add validation and preview
4. Integrate into Dashboard

**Step 4: Friend Lookup Updates**
1. Update FriendsManager for friend tag lookup
2. Update CampaignInviteModal for friend tag lookup
3. Update displays to show friend tags
4. Remove old friend code references

**Step 5: Testing & Rollout**
1. Test extensively in development
2. Deploy to staging
3. Test existing user flow (forced account name setup)
4. Test new user flow (account name at creation)
5. Verify friend lookups work correctly
6. Deploy to production with user notification

#### Testing Requirements

**Backend:**
- [ ] Account name validation rejects invalid formats
- [ ] Account name uniqueness enforced (case-insensitive)
- [ ] Cannot set account_name twice
- [ ] Friend tag generated correctly (last 4 chars of UUID)
- [ ] Friend lookup by tag works
- [ ] Tag verification prevents spoofing (validates tag matches user ID)

**Frontend:**
- [ ] New user prompted for account_name (blocking modal)
- [ ] Existing user prompted on next login (blocking modal)
- [ ] Availability check works (debounced, real-time feedback)
- [ ] Cannot submit invalid account names
- [ ] Friend tag preview shows correctly
- [ ] Friend lookup by tag works in FriendsManager
- [ ] Friend lookup by tag works in CampaignInviteModal
- [ ] Screen name remains primary display
- [ ] Profile shows account_name#tag

#### Rollback Strategy

**Risk:** HIGH - Users will lose account_name selections

**Rollback Steps:**
1. `git revert <commit>`
2. Run migration downgrade: `alembic downgrade -1`
3. All account_name and friend_tag data will be lost

**Mitigation:**
- Test extensively in staging environment
- Communicate change to users before rollout
- Have rollback plan ready

---

## Risk Assessment & Dependencies

### High Risk Items
1. **Phase 4 (Account Names):** Breaking change, affects authentication flow, requires careful migration
   - **Risk:** Users forced to set account name on next login
   - **Mitigation:** Extensive staging testing, clear user communication

### Medium Risk Items
1. **Phase 2 (Temp HP):** Database migration, validation logic changes
   - **Risk:** Data loss if migration rolled back
   - **Mitigation:** Test migration in dev environment first

### Low Risk Items
1. **Phase 1 (Quick Wins):** Cosmetic changes only
2. **Phase 3 (Bug Investigation):** Investigation first, fix is TBD

### Dependencies

```
Phase 1: No dependencies (can run in parallel)
Phase 2: No dependencies (can run in parallel with Phase 1)
Phase 3: Should wait for Phase 2 (testing multi-class during edit)
Phase 4: Should wait for Phase 1-3 completion (major refactor, needs stable base)
```

---

## Implementation Timeline

### Week 1
- **Days 1-2:** Phase 1 (Quick Wins) - 2-3 hours
- **Days 2-4:** Phase 2 (Character Enhancements) - 1-2 days
- **Day 5:** Phase 3 (Bug Investigation) - 2-4 hours

### Week 2
- **Days 1-5:** Phase 4 (Account Name System) - 3-5 days
- **Day 5:** Final testing, documentation, deployment

**Total Estimated Time:** ~1.5 weeks

---

## Success Metrics

### Phase 1 Success
- [ ] All redirects work correctly
- [ ] Terminology consistent throughout UI
- [ ] Dark theme applied consistently
- [ ] No UUIDs exposed in friend UI

### Phase 2 Success
- [ ] Temp HP feature fully functional
- [ ] HP validation prevents invalid states
- [ ] Ability score bonuses clearly displayed
- [ ] Character creation UX improved

### Phase 3 Success
- [ ] Level sum bug identified and fixed
- [ ] Multi-class level display works correctly

### Phase 4 Success
- [ ] All users have account names set
- [ ] Friend lookup by tag works reliably
- [ ] No friend code system remnants
- [ ] Zero production incidents

---

**End of Task File**
