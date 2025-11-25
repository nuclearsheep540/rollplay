# Character Creation & Ability Score System

**Domain:** Character Management & D&D Rules
**Priority:** MEDIUM
**Estimated Total Time:** 3-5 days
**Status:** Not Started

---

## Overview

Enhance the character creation system with D&D-compliant ability score entry methods and multi-class support. Improve the UX for entering ability scores with intuitive controls.

---

## FEATURE-7: Character Form +/- Increment Buttons for Ability Scores

**Priority:** MEDIUM
**Complexity:** Simple
**Estimated Time:** 1-2 hours
**Status:** Not Started

### Current Implementation
- **File:** `/rollplay/app/character/components/CharacterForm.js` lines 176-262
- Uses standard HTML `<input type="number">` controls
- Works but not intuitive for D&D ability scores

### Required Changes

#### 1. Create Reusable NumericStepper Component

**Create:** `/rollplay/app/character/components/NumericStepper.js`

```javascript
export default function NumericStepper({
  label,
  value,
  onChange,
  min = 1,
  max = 30,
  disabled = false
}) {
  const handleIncrement = () => {
    if (value < max) onChange(value + 1)
  }

  const handleDecrement = () => {
    if (value > min) onChange(value - 1)
  }

  const getModifier = (score) => {
    return Math.floor((score - 10) / 2)
  }

  const formatModifier = (mod) => {
    return mod >= 0 ? `+${mod}` : `${mod}`
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <div className="flex items-center gap-2">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="w-8 h-8 bg-slate-200 hover:bg-slate-300 disabled:opacity-50
                     disabled:cursor-not-allowed rounded font-bold text-slate-700
                     transition-colors"
        >
          −
        </button>

        {/* Value Display */}
        <div className="flex flex-col items-center min-w-[60px]">
          <span className="text-2xl font-bold text-slate-800">{value}</span>
          <span className="text-xs text-slate-500">
            {formatModifier(getModifier(value))}
          </span>
        </div>

        {/* Increment Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="w-8 h-8 bg-slate-200 hover:bg-slate-300 disabled:opacity-50
                     disabled:cursor-not-allowed rounded font-bold text-slate-700
                     transition-colors"
        >
          +
        </button>
      </div>
    </div>
  )
}
```

#### 2. Update CharacterForm to Use NumericStepper

**Update:** `/rollplay/app/character/components/CharacterForm.js`

Replace all 6 ability score inputs with `<NumericStepper />`:

```javascript
import NumericStepper from './NumericStepper'

// In the form JSX (around lines 176-262)
<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
  <NumericStepper
    label="Strength"
    value={formData.ability_scores.strength}
    onChange={(val) => handleAbilityScoreChange('strength', val)}
    min={1}
    max={30}
  />
  <NumericStepper
    label="Dexterity"
    value={formData.ability_scores.dexterity}
    onChange={(val) => handleAbilityScoreChange('dexterity', val)}
    min={1}
    max={30}
  />
  {/* ... repeat for all 6 ability scores */}
</div>
```

### Styling Notes
- Use Tailwind classes for consistency
- Show D&D modifier below score (e.g., "+3" for 16 STR)
- Buttons should be visually distinct and responsive
- Disabled state should be clear

### Files Involved
- Create: `/rollplay/app/character/components/NumericStepper.js`
- Update: `/rollplay/app/character/components/CharacterForm.js`

### Testing
- [ ] Increment/decrement buttons work
- [ ] Min/max bounds enforced (1-30)
- [ ] Modifier calculation correct
- [ ] Disabled state works
- [ ] Responsive on mobile

---

## MEDIUM-2: Ability Score Point-Buy System

**Priority:** MEDIUM
**Complexity:** Medium
**Estimated Time:** 1-2 days
**Status:** Not Started

### Current Implementation
- Manual numeric input for each ability score
- No point calculation or validation
- No D&D standard method support

### D&D 5e Point-Buy Rules

**Standard Array:** 15, 14, 13, 12, 10, 8 (no points, just assign)

**Point-Buy Rules:**
- Start with 27 points to spend
- Base score: 8 (costs 0 points)
- Point costs:
  - 8 = 0 points
  - 9 = 1 point
  - 10 = 2 points
  - 11 = 3 points
  - 12 = 4 points
  - 13 = 5 points
  - 14 = 7 points
  - 15 = 9 points
- Maximum starting score: 15 (before racial bonuses)
- Minimum starting score: 8

### Required Changes

#### 1. Create Ability Score Calculation Utility

**Create:** `/rollplay/app/character/utils/abilityScoreCalculations.js`

```javascript
// Point-buy cost table
const POINT_COSTS = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
}

export const calculatePointCost = (score) => {
  if (score < 8 || score > 15) return null
  return POINT_COSTS[score]
}

export const calculateTotalPoints = (scores) => {
  const { strength, dexterity, constitution, intelligence, wisdom, charisma } = scores
  const total = [strength, dexterity, constitution, intelligence, wisdom, charisma]
    .reduce((sum, score) => sum + (calculatePointCost(score) || 0), 0)
  return total
}

export const validatePointBuy = (scores) => {
  const total = calculateTotalPoints(scores)
  const allValid = Object.values(scores).every(score => score >= 8 && score <= 15)
  return {
    valid: total <= 27 && allValid,
    total,
    remaining: 27 - total,
    errors: []
  }
}

export const rollAbilityScore = (method = '4d6-drop-lowest') => {
  if (method === '4d6-drop-lowest') {
    const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
    rolls.sort((a, b) => a - b)
    rolls.shift() // Drop lowest
    return rolls.reduce((sum, roll) => sum + roll, 0)
  }

  if (method === '3d6') {
    const rolls = Array.from({ length: 3 }, () => Math.floor(Math.random() * 6) + 1)
    return rolls.reduce((sum, roll) => sum + roll, 0)
  }

  return 10 // Default
}

export const rollAllAbilityScores = (method = '4d6-drop-lowest') => {
  return {
    strength: rollAbilityScore(method),
    dexterity: rollAbilityScore(method),
    constitution: rollAbilityScore(method),
    intelligence: rollAbilityScore(method),
    wisdom: rollAbilityScore(method),
    charisma: rollAbilityScore(method)
  }
}

export const getStandardArray = () => [15, 14, 13, 12, 10, 8]
```

#### 2. Create Ability Score Builder Component

**Create:** `/rollplay/app/character/components/AbilityScoreBuilder.js`

```javascript
import { useState } from 'react'
import NumericStepper from './NumericStepper'
import {
  calculateTotalPoints,
  validatePointBuy,
  rollAllAbilityScores,
  getStandardArray
} from '../utils/abilityScoreCalculations'

export default function AbilityScoreBuilder({ scores, onChange }) {
  const [mode, setMode] = useState('manual') // 'manual', 'point-buy', 'roll', 'standard'
  const [pointBuyInfo, setPointBuyInfo] = useState(null)

  const handleModeChange = (newMode) => {
    setMode(newMode)

    if (newMode === 'point-buy') {
      // Start with base scores of 8
      const baseScores = {
        strength: 8,
        dexterity: 8,
        constitution: 8,
        intelligence: 8,
        wisdom: 8,
        charisma: 8
      }
      onChange(baseScores)
      updatePointBuyInfo(baseScores)
    }

    if (newMode === 'roll') {
      const rolled = rollAllAbilityScores('4d6-drop-lowest')
      onChange(rolled)
    }

    if (newMode === 'standard') {
      // Show standard array, user assigns to abilities
      // This would need a drag-drop or assignment UI
    }
  }

  const updatePointBuyInfo = (scores) => {
    const info = validatePointBuy(scores)
    setPointBuyInfo(info)
  }

  const handleScoreChange = (ability, value) => {
    const newScores = { ...scores, [ability]: value }
    onChange(newScores)

    if (mode === 'point-buy') {
      updatePointBuyInfo(newScores)
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => handleModeChange('manual')}
          className={`px-3 py-1 rounded ${mode === 'manual' ? 'bg-purple-600 text-white' : 'bg-slate-200'}`}
        >
          Manual Entry
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('point-buy')}
          className={`px-3 py-1 rounded ${mode === 'point-buy' ? 'bg-purple-600 text-white' : 'bg-slate-200'}`}
        >
          Point-Buy
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('roll')}
          className={`px-3 py-1 rounded ${mode === 'roll' ? 'bg-purple-600 text-white' : 'bg-slate-200'}`}
        >
          Roll Dice
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('standard')}
          className={`px-3 py-1 rounded ${mode === 'standard' ? 'bg-purple-600 text-white' : 'bg-slate-200'}`}
        >
          Standard Array
        </button>
      </div>

      {/* Point-Buy Info Display */}
      {mode === 'point-buy' && pointBuyInfo && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded">
          <p className="text-sm font-semibold text-blue-900">
            Points Used: {pointBuyInfo.total} / 27
            {pointBuyInfo.remaining > 0 && (
              <span className="ml-2 text-blue-700">
                ({pointBuyInfo.remaining} remaining)
              </span>
            )}
          </p>
          {!pointBuyInfo.valid && (
            <p className="text-sm text-red-600 mt-1">
              ⚠️ Exceeded point limit
            </p>
          )}
        </div>
      )}

      {/* Ability Score Inputs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <NumericStepper
          label="Strength"
          value={scores.strength}
          onChange={(val) => handleScoreChange('strength', val)}
          min={mode === 'point-buy' ? 8 : 1}
          max={mode === 'point-buy' ? 15 : 30}
        />
        <NumericStepper
          label="Dexterity"
          value={scores.dexterity}
          onChange={(val) => handleScoreChange('dexterity', val)}
          min={mode === 'point-buy' ? 8 : 1}
          max={mode === 'point-buy' ? 15 : 30}
        />
        <NumericStepper
          label="Constitution"
          value={scores.constitution}
          onChange={(val) => handleScoreChange('constitution', val)}
          min={mode === 'point-buy' ? 8 : 1}
          max={mode === 'point-buy' ? 15 : 30}
        />
        <NumericStepper
          label="Intelligence"
          value={scores.intelligence}
          onChange={(val) => handleScoreChange('intelligence', val)}
          min={mode === 'point-buy' ? 8 : 1}
          max={mode === 'point-buy' ? 15 : 30}
        />
        <NumericStepper
          label="Wisdom"
          value={scores.wisdom}
          onChange={(val) => handleScoreChange('wisdom', val)}
          min={mode === 'point-buy' ? 8 : 1}
          max={mode === 'point-buy' ? 15 : 30}
        />
        <NumericStepper
          label="Charisma"
          value={scores.charisma}
          onChange={(val) => handleScoreChange('charisma', val)}
          min={mode === 'point-buy' ? 8 : 1}
          max={mode === 'point-buy' ? 15 : 30}
        />
      </div>

      {/* Roll Again Button */}
      {mode === 'roll' && (
        <button
          type="button"
          onClick={() => handleModeChange('roll')}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
        >
          🎲 Reroll All
        </button>
      )}
    </div>
  )
}
```

#### 3. Update CharacterForm

**Update:** `/rollplay/app/character/components/CharacterForm.js`

Replace existing ability score section with:

```javascript
import AbilityScoreBuilder from './AbilityScoreBuilder'

// In JSX
<AbilityScoreBuilder
  scores={formData.ability_scores}
  onChange={(newScores) => setFormData({ ...formData, ability_scores: newScores })}
/>
```

### Files Involved
- Create: `/rollplay/app/character/utils/abilityScoreCalculations.js`
- Create: `/rollplay/app/character/components/AbilityScoreBuilder.js`
- Update: `/rollplay/app/character/components/CharacterForm.js`
- Uses: `/rollplay/app/character/components/NumericStepper.js` (from FEATURE-7)

### Testing Requirements
- [ ] Point-buy calculations match D&D 5e rules
- [ ] Cannot exceed 27 points in point-buy mode
- [ ] Roll dice produces valid distributions (3-18)
- [ ] Standard array assignment works
- [ ] Switching modes preserves valid states
- [ ] Form submission validates ability scores

---

## MEDIUM-1: Character Multi-Class Support

**Priority:** MEDIUM
**Complexity:** Medium-High
**Estimated Time:** 1-2 days
**Status:** Not Started

### Current Issue
- **File:** `/api-site/modules/characters/domain/character_aggregate.py` line 119
- Single `character_class: CharacterClass` field
- D&D 5e allows multi-classing at level 3+
- Users cannot create multi-class characters

### D&D 5e Multi-Class Rules
- Minimum level to multi-class: 3
- Maximum classes: 3 (by convention, not hard limit)
- Must meet ability score prerequisites for new class

### Required Changes

#### 1. Database Migration

**Create:** `/api-site/alembic/versions/007_multiclass_support.py`

```python
def upgrade():
    # Change character_class (VARCHAR) to character_classes (JSONB array)
    op.add_column('characters', sa.Column('character_classes', postgresql.JSONB, nullable=True))

    # Migrate existing single class to array format
    op.execute("""
        UPDATE characters
        SET character_classes = jsonb_build_array(
            jsonb_build_object('class', character_class, 'level', level)
        )
        WHERE character_class IS NOT NULL
    """)

    # Make new column non-nullable
    op.alter_column('characters', 'character_classes', nullable=False)

    # Drop old column
    op.drop_column('characters', 'character_class')

def downgrade():
    # Add back single class column
    op.add_column('characters', sa.Column('character_class', sa.String(50), nullable=True))

    # Migrate first class back to single field
    op.execute("""
        UPDATE characters
        SET character_class = character_classes->0->>'class'
        WHERE jsonb_array_length(character_classes) > 0
    """)

    op.drop_column('characters', 'character_classes')
```

#### 2. Update Domain Model

**Update:** `/api-site/modules/characters/domain/character_aggregate.py`

```python
from dataclasses import dataclass
from typing import List

@dataclass
class CharacterClassInfo:
    """Value object for character class information"""
    character_class: CharacterClass
    level: int  # Levels in this specific class

    def __post_init__(self):
        if self.level < 1:
            raise ValueError("Class level must be at least 1")

class CharacterAggregate:
    def __init__(
        self,
        ...,
        character_classes: List[CharacterClassInfo],  # Changed from single class
        level: int,  # Total character level
        ...
    ):
        self.character_classes = character_classes
        self.level = level
        self._validate_multiclass()

    def _validate_multiclass(self):
        """Validate multi-class business rules"""
        if len(self.character_classes) == 0:
            raise ValueError("Character must have at least one class")

        if len(self.character_classes) > 3:
            raise ValueError("Character cannot have more than 3 classes")

        # Validate total class levels match character level
        total_class_levels = sum(c.level for c in self.character_classes)
        if total_class_levels != self.level:
            raise ValueError(f"Class levels ({total_class_levels}) must equal character level ({self.level})")

    def add_class(self, character_class: CharacterClass, starting_level: int = 1):
        """Add a new class to character (multi-classing)"""
        if self.level < 3:
            raise ValueError("Must be level 3 or higher to multi-class")

        if len(self.character_classes) >= 3:
            raise ValueError("Cannot have more than 3 classes")

        # Check if class already exists
        if any(c.character_class == character_class for c in self.character_classes):
            raise ValueError(f"Character already has {character_class.value} class")

        self.character_classes.append(
            CharacterClassInfo(character_class=character_class, level=starting_level)
        )
        self._validate_multiclass()

    def remove_class(self, character_class: CharacterClass):
        """Remove a class from character"""
        if len(self.character_classes) <= 1:
            raise ValueError("Cannot remove last class")

        self.character_classes = [
            c for c in self.character_classes if c.character_class != character_class
        ]
        self._validate_multiclass()

    def get_primary_class(self) -> CharacterClass:
        """Get primary class (highest level)"""
        if not self.character_classes:
            raise ValueError("No classes defined")
        return max(self.character_classes, key=lambda c: c.level).character_class
```

#### 3. Update Database Model

**Update:** `/api-site/modules/characters/model/character_model.py`

```python
from sqlalchemy.dialects.postgresql import JSONB

class Character(Base):
    __tablename__ = 'characters'

    # ... other fields ...

    character_classes = Column(JSONB, nullable=False)  # Changed from VARCHAR
    level = Column(Integer, nullable=False)  # Total level

    # ... rest of model ...
```

#### 4. Update Repository

**Update:** `/api-site/modules/characters/repositories/character_repository.py`

```python
def _model_to_aggregate(self, model: CharacterModel) -> CharacterAggregate:
    # Parse JSONB character_classes array
    character_classes = [
        CharacterClassInfo(
            character_class=CharacterClass(cls_data['class']),
            level=cls_data['level']
        )
        for cls_data in model.character_classes
    ]

    return CharacterAggregate(
        # ... other fields ...
        character_classes=character_classes,
        level=model.level,
        # ... rest of fields ...
    )

def _aggregate_to_model(self, aggregate: CharacterAggregate, model: CharacterModel):
    # Serialize character_classes to JSONB
    model.character_classes = [
        {
            'class': cls_info.character_class.value,
            'level': cls_info.level
        }
        for cls_info in aggregate.character_classes
    ]
    model.level = aggregate.level
    # ... rest of fields ...
```

#### 5. Update API Schemas

**Update:** `/api-site/modules/characters/schemas/character_schemas.py`

```python
from typing import List
from pydantic import BaseModel, Field

class CharacterClassResponse(BaseModel):
    character_class: str
    level: int

class CharacterResponse(BaseModel):
    id: str
    name: str
    character_classes: List[CharacterClassResponse]  # Changed from single class
    level: int  # Total character level
    # ... other fields ...

    class Config:
        from_attributes = True

class CreateCharacterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    character_classes: List[CharacterClassResponse] = Field(..., min_items=1, max_items=3)
    level: int = Field(..., ge=1, le=20)
    # ... other fields ...
```

#### 6. Update Frontend

**Update:** `/rollplay/app/character/components/CharacterForm.js`

Changes needed:
1. Replace single class select with multi-select
2. Show list of selected classes with levels
3. Add/remove class buttons
4. Validate level 3 requirement for multi-classing
5. Show warning if trying to add 2nd class before level 3

**UI Mockup:**
```
┌────────────────────────────────────┐
│ Classes                            │
│ ┌────────────────────────────────┐ │
│ │ Fighter (Level 5)        [Remove]│
│ │ Rogue (Level 2)          [Remove]│
│ └────────────────────────────────┘ │
│ [+ Add Class]                      │
│                                    │
│ Total Level: 7                     │
└────────────────────────────────────┘
```

### Files Involved

**Backend:**
- Create: `/api-site/alembic/versions/007_multiclass_support.py`
- Update: `/api-site/modules/characters/domain/character_aggregate.py`
- Update: `/api-site/modules/characters/model/character_model.py`
- Update: `/api-site/modules/characters/repositories/character_repository.py`
- Update: `/api-site/modules/characters/schemas/character_schemas.py`
- Update: `/api-site/modules/characters/api/endpoints.py`

**Frontend:**
- Update: `/rollplay/app/character/components/CharacterForm.js`
- Consider creating: `/rollplay/app/character/components/MultiClassSelector.js`

### Testing Requirements
- [ ] Migration converts existing single-class characters
- [ ] Cannot add 2nd class before level 3
- [ ] Cannot exceed 3 classes
- [ ] Class levels sum to total character level
- [ ] Frontend validates and displays correctly
- [ ] Backend rejects invalid multi-class configurations

---

## Implementation Order

**Sequential dependencies:**

1. **FEATURE-7 first** (NumericStepper) - Used by MEDIUM-2
2. **MEDIUM-2 next** (Point-Buy System) - Standalone, uses NumericStepper
3. **MEDIUM-1 last** (Multi-Class) - Most complex, requires migration

**Estimated Timeline:**
- Day 1: FEATURE-7 (NumericStepper component)
- Days 2-3: MEDIUM-2 (Point-Buy System with all modes)
- Days 4-5: MEDIUM-1 (Multi-Class support with migration)

---

## Success Metrics

### User Experience
- [ ] Ability scores easy to adjust with +/- buttons
- [ ] D&D modifier displayed clearly
- [ ] Point-buy mode prevents exceeding 27 points
- [ ] Roll dice produces realistic D&D distributions
- [ ] Multi-class characters can be created
- [ ] Multi-class UI is intuitive

### Technical
- [ ] Backend validates ability scores (1-30)
- [ ] Backend validates point-buy rules
- [ ] Migration handles existing characters
- [ ] Multi-class data integrity maintained
- [ ] All D&D business rules enforced

---

**End of Character Creation Task File**
