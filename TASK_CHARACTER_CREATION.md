# Character Creation & Ability Score System

**Domain:** Character Management & D&D Rules
**Priority:** HIGH (D&D 2024 implementation in progress)
**Status:** ✅ Background System Complete - Feats System Blocked on Chapter 3 Data

---

## ✅ COMPLETED: D&D 2024 Background Bonus System

**Status:** Backend 100% complete, Frontend 100% complete, **FULLY IMPLEMENTED**

### Implementation Summary

**Problem Identified:** OriginBonusAllocator was allowing users to choose ANY of the 6 abilities for background bonuses, when it should only show the 3 specific abilities associated with each background.

**Solution Implemented:**
- ✅ Backend: Supports background and origin_ability_bonuses fields
- ✅ Frontend: OriginBonusAllocator component filters abilities correctly
- ✅ **FIXED**: User can now only choose from the 3 abilities specific to their selected background
- ✅ **DATA ADDED**: Complete background → ability mappings from D&D 2024 Player's Handbook

**Files Modified:**
1. ✅ `/home/matt/rollplay/rollplay/app/shared/constants/characterEnums.js` - Added BACKGROUND_ABILITIES mapping
2. ✅ `/home/matt/rollplay/rollplay/app/character/components/OriginBonusAllocator.js` - Updated to filter abilities by background
3. ✅ `/home/matt/rollplay/rollplay/app/character/components/CharacterForm.js` - Passes background prop to allocator

**Implementation Details:**
```javascript
// characterEnums.js - Added complete mapping
export const BACKGROUND_ABILITIES = {
  'Acolyte': ['intelligence', 'wisdom', 'charisma'],
  'Artisan': ['strength', 'dexterity', 'intelligence'],
  'Charlatan': ['dexterity', 'constitution', 'charisma'],
  'Criminal': ['dexterity', 'constitution', 'intelligence'],
  'Entertainer': ['strength', 'dexterity', 'charisma'],
  'Farmer': ['strength', 'constitution', 'wisdom'],
  'Guard': ['strength', 'intelligence', 'wisdom'],
  'Guide': ['dexterity', 'constitution', 'wisdom'],
  'Hermit': ['constitution', 'wisdom', 'charisma'],
  'Merchant': ['constitution', 'intelligence', 'charisma'],
  'Noble': ['strength', 'intelligence', 'charisma'],
  'Sage': ['constitution', 'intelligence', 'wisdom'],
  'Sailor': ['strength', 'dexterity', 'wisdom'],
  'Scribe': ['dexterity', 'intelligence', 'wisdom'],
  'Soldier': ['strength', 'dexterity', 'constitution'],
  'Wayfarer': ['dexterity', 'wisdom', 'charisma'],
}

// OriginBonusAllocator.js - Filter logic
const getAvailableAbilities = (currentSelection) => {
  const allowedAbilities = selectedBackground && BACKGROUND_ABILITIES[selectedBackground]
    ? ABILITIES.filter(a => BACKGROUND_ABILITIES[selectedBackground].includes(a.value))
    : ABILITIES
  const selected = Object.values(mode === '2_1' ? mode2_1 : mode1_1_1).filter(v => v && v !== currentSelection)
  return allowedAbilities.filter(a => !selected.includes(a.value))
}
```

**Test Plan:**
1. Create character, select "Soldier" background
2. Verify only Soldier's 3 abilities (Strength, Dexterity, Constitution) show in bonus dropdowns
3. Allocate bonuses (+2/+1 or +1/+1/+1)
4. Verify cannot select abilities outside the 3
5. Change background and verify dropdown options update to new background's abilities
6. Submit and verify saves correctly to backend

---

## ✅ COMPLETED: D&D 2024 Core Features

### Multi-Class Support (COMPLETED)
- ✅ Backend: Character can have 1-3 classes
- ✅ Frontend: MultiClassSelector component
- ✅ Database: Migration 007 applied
- ✅ Validation: Class levels sum to total level
- **Status:** Production ready

### Point-Buy System (COMPLETED)
- ✅ Backend: Validation rules
- ✅ Frontend: PointBuyCalculator component
- ✅ Rules: 27 points, 8-15 range, correct costs
- ✅ UI: Shows points remaining, validation errors
- **Status:** Production ready

### Dice Rolling (COMPLETED)
- ✅ Frontend: DiceRoller component
- ✅ Rules: 4d6 drop lowest
- ✅ UI: Re-roll button, individual rolls visible
- **Status:** Production ready

### Manual Entry (COMPLETED)
- ✅ Frontend: NumericStepper component
- ✅ UI: +/- buttons, modifier display
- ✅ Range: 1-20 per ability
- **Status:** Production ready

---

## Implementation History (For Context)

### Phase 1: Removed Incorrect ASI System (COMPLETED)
- ❌ Removed: ASI points calculation (was based on 2014 rules)
- ❌ Removed: asiCalculations.js file
- ❌ Removed: ASI tracking from PointBuyCalculator and DiceRoller
- **Reason:** D&D 2024 uses feats instead of automatic ASI

### Phase 2: Implemented Background Bonuses (100% COMPLETE)
- ✅ Backend: CharacterBackground enum (16 backgrounds)
- ✅ Backend: origin_ability_bonuses field (JSONB)
- ✅ Backend: Validation (3 points total, max 20, valid abilities)
- ✅ Frontend: Background selector
- ✅ Frontend: OriginBonusAllocator component with ability filtering
- ✅ **COMPLETE:** Background → ability mappings from D&D 2024 Player's Handbook

### Phase 3: Feats System (NOT STARTED - BLOCKED)
- ❌ Blocked on: Need Chapter 3 class progression tables
- ❌ Need to know: Which levels grant feats per class
- ❌ Need to know: Available feat options
- **Status:** Cannot implement until we have Chapter 3 data

---

## D&D 2024 Rules Reference Summary

### Point-Buy (CONFIRMED - Page 38)
- Budget: 27 points
- Range: 8-15
- Costs: 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9

### Background Bonuses (CONFIRMED - Page 38)
- **Quote:** "Your background lists three abilities; increase one of those scores by 2 and a different one by 1, or increase all three by 1."
- Applied AFTER base score generation
- Cannot exceed 20
- One-time at creation only

### Dice Rolling (CONFIRMED - Page 38)
- 4d6, drop lowest die
- Do 6 times (one per ability)
- Range: 3-18

### Standard Array (CONFIRMED - Page 38)
- Values: 15, 14, 13, 12, 10, 8
- Assign to abilities
- Not implemented (not priority)

---

## Files Reference (For Next Session)

### Backend Files
- `/home/matt/rollplay/api-site/modules/characters/domain/character_aggregate.py` - Domain model
- `/home/matt/rollplay/api-site/modules/characters/model/character_model.py` - Database model
- `/home/matt/rollplay/api-site/modules/characters/api/schemas.py` - API schemas
- `/home/matt/rollplay/api-site/modules/characters/api/endpoints.py` - API endpoints
- `/home/matt/rollplay/api-site/modules/characters/application/commands.py` - Commands
- `/home/matt/rollplay/api-site/alembic/versions/008_bg_origin_bonuses.py` - Migration

### Frontend Files
- `/home/matt/rollplay/rollplay/app/character/components/CharacterForm.js` - Main form
- `/home/matt/rollplay/rollplay/app/character/components/OriginBonusAllocator.js` - Bonus UI
- `/home/matt/rollplay/rollplay/app/character/components/AbilityScoreBuilder.js` - Score entry
- `/home/matt/rollplay/rollplay/app/shared/constants/characterEnums.js` - Constants

### Documentation Files
- `/home/matt/rollplay/RULES_DND_2024.md` - Rules reference
- `/home/matt/rollplay/TASK_CHARACTER_CREATION.md` - This file

---

## Git Status (Last Known)
- Branch: `user_feedback`
- Modified files include character creation components
- Migration 008 applied to database
- System running in Docker containers

---

**NEXT STEP:** Obtain background → ability mappings from D&D 2024 Player's Handbook, then update OriginBonusAllocator to filter abilities based on selected background.
