# Ability Score Improvement (ASI) System

**Domain:** Character Creation & D&D 5e Rules
**Priority:** MEDIUM
**Estimated Time:** 2-3 hours (AFTER multi-class support)
**Status:** Blocked by MEDIUM-1 (Multi-class Support)
**Dependencies:** Requires MEDIUM-1 to be completed first

---

## Overview

Implement D&D 5e Ability Score Improvement (ASI) system for character creation and leveling. ASI points are earned through class levels and can be distributed to ability scores, with a maximum score of 20.

---

## D&D 5e ASI Rules

### Standard ASI Progression
Most classes gain ASI at the following levels:
- Level 4
- Level 8
- Level 12
- Level 16
- Level 19

### Class Exceptions
- **Fighter:** Additional ASIs at levels 6 and 14
- **Rogue:** Additional ASI at level 10

### ASI Point Distribution
Each ASI grants **2 points** which can be distributed as:
- **+2 to one ability score**, OR
- **+1 to two different ability scores**

### Ability Score Cap
- Maximum ability score: **20** (not 30)
- No ability score can exceed 20 through ASI

### Multi-class ASI Rules
**Critical:** ASI is earned through **individual class levels**, NOT total character level.

**Examples:**
- Fighter 6 / Rogue 4 (total level 10):
  - Fighter ASIs: Levels 4, 6 = 2 ASIs = 4 points
  - Rogue ASIs: Level 4 = 1 ASI = 2 points
  - **Total: 6 ASI points available**

- Cleric 3 / Wizard 1 (total level 4):
  - Cleric ASIs: None (needs level 4)
  - Wizard ASIs: None (needs level 4)
  - **Total: 0 ASI points available**

- Rogue 10 / Fighter 6 (total level 16):
  - Rogue ASIs: Levels 4, 10 = 2 ASIs = 4 points
  - Fighter ASIs: Levels 4, 6 = 2 ASIs = 4 points
  - **Total: 8 ASI points available**

---

## Implementation Requirements

### Phase 1: Update Ability Score Maximum

**Change ability score cap from 30 to 20**

#### Backend Validation
**File:** `/api-site/modules/characters/domain/character_aggregate.py`

Update `AbilityScores` validation:
```python
class AbilityScores:
    def __post_init__(self):
        for ability, score in self.__dict__.items():
            if not (1 <= score <= 20):  # Changed from 30 to 20
                raise ValueError(f"{ability} must be between 1 and 20")
```

#### Frontend Controls
**File:** `/rollplay/app/character/components/NumericStepper.js`

Change default max:
```javascript
export default function NumericStepper({
  min = 1,
  max = 20,  // Changed from 30 to 20
  ...
})
```

**File:** `/rollplay/app/character/components/CharacterForm.js`

Update all NumericStepper calls:
```javascript
<NumericStepper
  label="STR"
  value={formData.ability_scores.strength}
  onChange={(val) => handleAbilityScoreChange('strength', val)}
  min={1}
  max={20}  // Changed from 30
/>
```

---

### Phase 2: Create ASI Calculation Utility

**Create:** `/rollplay/app/character/utils/asiCalculations.js`

```javascript
/**
 * Get ASI levels for a character class
 * @param {string} characterClass - Class name (e.g., "Fighter", "Rogue")
 * @returns {number[]} Array of levels when ASI is granted
 */
export const getASILevels = (characterClass) => {
  const standardLevels = [4, 8, 12, 16, 19]

  if (characterClass === 'Fighter') {
    return [...standardLevels, 6, 14].sort((a, b) => a - b)
  }

  if (characterClass === 'Rogue') {
    return [...standardLevels, 10].sort((a, b) => a - b)
  }

  return standardLevels
}

/**
 * Calculate total ASI points available for a character
 * @param {Array<{character_class: string, level: number}>} characterClasses
 * @returns {number} Total ASI points (each ASI = 2 points)
 */
export const calculateTotalASIPoints = (characterClasses) => {
  let totalPoints = 0

  for (const classInfo of characterClasses) {
    const asiLevels = getASILevels(classInfo.character_class)
    const earnedASIs = asiLevels.filter(level => level <= classInfo.level).length
    totalPoints += earnedASIs * 2  // Each ASI = 2 points
  }

  return totalPoints
}

/**
 * Calculate ASI points spent above base rolled scores
 * @param {Object} currentScores - Current ability scores
 * @param {Object} baseScores - Originally rolled base scores
 * @returns {number} Points spent
 */
export const calculateASIPointsSpent = (currentScores, baseScores) => {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

  let pointsSpent = 0
  for (const ability of abilities) {
    const increase = currentScores[ability] - baseScores[ability]
    if (increase > 0) {
      pointsSpent += increase
    }
  }

  return pointsSpent
}

/**
 * Validate ability scores against ASI budget
 * @param {Object} currentScores - Current ability scores
 * @param {Object} baseScores - Originally rolled base scores
 * @param {number} availablePoints - Total ASI points available
 * @returns {Object} Validation result
 */
export const validateASIBudget = (currentScores, baseScores, availablePoints) => {
  const pointsSpent = calculateASIPointsSpent(currentScores, baseScores)
  const remaining = availablePoints - pointsSpent

  // Check no score exceeds 20
  const abilities = Object.values(currentScores)
  const maxScore = Math.max(...abilities)

  return {
    valid: pointsSpent <= availablePoints && maxScore <= 20,
    pointsSpent,
    availablePoints,
    remaining,
    overBudget: pointsSpent > availablePoints,
    exceedsMax: maxScore > 20
  }
}
```

---

### Phase 3: Randomizer with ASI Distribution

**Update:** `/rollplay/app/character/components/AbilityScoreBuilder.js`

Add randomizer mode that:
1. Rolls base scores (4d6 drop lowest)
2. Stores base scores separately
3. Calculates available ASI points from character classes/levels
4. Allows user to manually distribute ASI points above base
5. Shows "Base Score + ASI" breakdown

**UI Mockup:**
```
┌────────────────────────────────────────────┐
│ Ability Score Entry Method                 │
│ [Manual] [Point-Buy] [Roll Dice] [Standard]│
├────────────────────────────────────────────┤
│ Roll Dice Mode                             │
│ [🎲 Reroll All]                            │
│                                            │
│ ASI Points: 4 used / 6 available           │
├────────────────────────────────────────────┤
│ STR: 14 (Base: 12 + 2 ASI)                │
│ DEX: 16 (Base: 16 + 0 ASI)                │
│ CON: 13 (Base: 11 + 2 ASI)                │
│ INT: 10 (Base: 10 + 0 ASI)                │
│ WIS: 15 (Base: 15 + 0 ASI)                │
│ CHA: 8  (Base: 8 + 0 ASI)                 │
└────────────────────────────────────────────┘
```

**Implementation:**
```javascript
import { calculateTotalASIPoints, validateASIBudget } from '../utils/asiCalculations'

const [baseScores, setBaseScores] = useState(null)
const [asiPoints, setAsiPoints] = useState(0)

// Calculate ASI points from character classes
useEffect(() => {
  if (characterClasses && characterClasses.length > 0) {
    const points = calculateTotalASIPoints(characterClasses)
    setAsiPoints(points)
  }
}, [characterClasses])

const handleRollDice = () => {
  const rolled = rollAllAbilityScores('4d6-drop-lowest')
  setBaseScores(rolled)
  onChange(rolled)  // Start with base scores, user can add ASI
}

// Validate on score change
const handleScoreChange = (ability, value) => {
  if (!baseScores) return

  const newScores = { ...scores, [ability]: value }
  const validation = validateASIBudget(newScores, baseScores, asiPoints)

  if (validation.valid) {
    onChange(newScores)
  } else {
    // Show error: "Exceeded ASI budget" or "Score exceeds maximum 20"
  }
}
```

---

### Phase 4: Manual Entry with ASI Budget

**Feature:** Show ASI point budget for manual score entry

Users can manually set scores, but system tracks how many "points" they've spent above a baseline.

**Not using base 10 as baseline** - User can set any valid scores, ASI budget is optional guidance.

**UI Mockup:**
```
┌────────────────────────────────────────────┐
│ Manual Entry Mode                          │
│                                            │
│ Suggested ASI Budget: 6 points available   │
│ (Based on Fighter 6)                       │
├────────────────────────────────────────────┤
│ STR: [12] (within recommended range)       │
│ DEX: [18] (using 2 ASI points if base 16) │
│ ...                                        │
└────────────────────────────────────────────┘
```

**Note:** This is informational only - users can set any valid scores (1-20). The ASI budget is a guide, not a hard constraint in manual mode.

---

### Phase 5: Point-Buy Mode (MEDIUM-2)

Standard 27-point buy system (scores 8-15) is independent of ASI.

Point-buy represents character creation before any leveling/ASI.

---

## Files Involved

### Backend
- `/api-site/modules/characters/domain/character_aggregate.py` - Update max to 20
- No other backend changes (ASI is frontend calculation based on class data)

### Frontend
- Create: `/rollplay/app/character/utils/asiCalculations.js`
- Update: `/rollplay/app/character/components/NumericStepper.js`
- Update: `/rollplay/app/character/components/CharacterForm.js`
- Update: `/rollplay/app/character/components/AbilityScoreBuilder.js`

---

## Dependencies

### CRITICAL: Requires MEDIUM-1 (Multi-class Support) First

ASI calculation requires knowing:
- Character classes (array)
- Level in each class

Cannot implement ASI system until multi-class support exists.

**Implementation Order:**
1. ✅ FEATURE-7: NumericStepper (DONE)
2. 🔲 MEDIUM-1: Multi-class Support (NEXT)
3. 🔲 ASI System (AFTER MEDIUM-1)
4. 🔲 MEDIUM-2: Point-Buy System (PARALLEL TO ASI)

---

## Testing Requirements

### ASI Calculation
- [ ] Standard class (Cleric 8) gets 2 ASIs (4, 8) = 4 points
- [ ] Fighter 6 gets 2 ASIs (4, 6) = 4 points
- [ ] Rogue 10 gets 2 ASIs (4, 10) = 4 points
- [ ] Multi-class correctly sums ASI (Fighter 6 / Rogue 4 = 6 points)
- [ ] Multi-class respects individual class levels (Cleric 3 / Wizard 1 = 0 points)

### Ability Score Validation
- [ ] Cannot exceed 20 in any ability score
- [ ] Backend rejects scores > 20
- [ ] Frontend prevents setting scores > 20

### Randomizer
- [ ] Roll dice generates valid scores (3-18)
- [ ] ASI points calculated from character classes
- [ ] User can distribute ASI above base rolls
- [ ] Cannot exceed ASI budget
- [ ] Reroll resets base scores and ASI distribution

### Manual Entry
- [ ] Shows ASI budget as guidance
- [ ] Allows any valid scores (1-20)
- [ ] Informational mode (not enforced)

---

## Success Metrics

### User Experience
- [ ] Clear display of ASI points available
- [ ] Easy to see base vs. ASI-modified scores
- [ ] Reroll dice maintains ASI distribution options
- [ ] Fighter/Rogue get correct additional ASIs
- [ ] Multi-class characters get accurate ASI totals

### Technical
- [ ] ASI calculation matches D&D 5e rules
- [ ] Max score 20 enforced backend + frontend
- [ ] Multi-class ASI correctly calculated per class
- [ ] No ASI points granted for classes below level 4

---

**End of ASI System Task File**
