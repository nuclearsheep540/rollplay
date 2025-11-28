# D&D 2024 Rules Reference

This document captures the D&D 2024 Player's Handbook rules relevant to character creation in Rollplay.

**Source**: D&D 2024 Player's Handbook, Chapter 2: Creating a Character (Pages 33-45)

---

## ✅ Point-Buy System (CONFIRMED)

**Rule**: Standard 27-point buy system
- **Point Budget**: 27 points total
- **Score Range**: 8-15 only
- **Point Costs**:
  ```
  Score 8:  0 points
  Score 9:  1 point
  Score 10: 2 points
  Score 11: 3 points
  Score 12: 4 points
  Score 13: 5 points
  Score 14: 7 points
  Score 15: 9 points
  ```

**Page 38**: "Point Cost. You have 27 points to spend on your ability scores."

**Implementation Status**: ✅ Fully implemented in `pointBuyCalculations.js`

---

## ✅ Backgrounds (CONFIRMED - NEW IN 2024)

**What Backgrounds Provide**:
1. **Ability Score Bonuses** (one-time at character creation)
2. **Origin Feat** (one feat from the Origin category)

### Ability Score Bonuses

**Rule**: Every background provides one-time ability score increases at character creation

**Format** (choose one):
- Increase one score by +2 and another by +1
- Increase three different scores by +1 each

**Constraints**:
- Background lists **three specific abilities** - bonuses must go to those 3
- Applied AFTER point-buy/rolling/standard array
- Cannot raise a score above 20
- One-time bonus (not repeatable)

**Page 38**: "After assigning your ability scores, adjust them according to your background. Your background lists three abilities; increase one of those scores by 2 and a different one by 1, or increase all three by 1."

### Background → Ability Mappings (Chapter 4, Pages 176-184)

| Background | Ability Scores | Origin Feat |
|------------|----------------|-------------|
| **Acolyte** | Intelligence, Wisdom, Charisma | Magic Initiate (Cleric) |
| **Artisan** | Strength, Dexterity, Intelligence | Crafter |
| **Charlatan** | Dexterity, Constitution, Charisma | Skilled |
| **Criminal** | Dexterity, Constitution, Intelligence | Alert |
| **Entertainer** | Strength, Dexterity, Charisma | Musician |
| **Farmer** | Strength, Constitution, Wisdom | Tough |
| **Guard** | Strength, Intelligence, Wisdom | Alert |
| **Guide** | Dexterity, Constitution, Wisdom | Magic Initiate (Druid) |
| **Hermit** | Constitution, Wisdom, Charisma | Healer |
| **Merchant** | Constitution, Intelligence, Charisma | Lucky |
| **Noble** | Strength, Intelligence, Charisma | Skilled |
| **Sage** | Constitution, Intelligence, Wisdom | Magic Initiate (Wizard) |
| **Sailor** | Strength, Dexterity, Wisdom | Tavern Brawler |
| **Scribe** | Dexterity, Intelligence, Wisdom | Skilled |
| **Soldier** | Strength, Dexterity, Constitution | Savage Attacker |
| **Wayfarer** | Dexterity, Wisdom, Charisma | Lucky |

### Origin Feats

**Rule**: Each background grants one Origin feat at Level 1

**Available Origin Feats** (from Chapter 5):
- Alert, Crafter, Healer, Lucky, Magic Initiate, Musician, Savage Attacker, Skilled, Tavern Brawler, Tough

**Implementation Status**: ⚠️ PARTIALLY IMPLEMENTED
- ✅ Backend: background and origin_ability_bonuses fields created
- ✅ Frontend: OriginBonusAllocator component created
- ❌ **BLOCKED**: Need background → ability mappings (which 3 abilities each background grants)
- ❌ **NOT STARTED**: Origin feat selection system

---

## ✅ Dice Rolling (CONFIRMED)

**Rule**: Roll 4d6, drop the lowest die, sum the remaining three

**Page 38**: "Random Generation. Roll four d6s and record the total of the highest three dice. Do this five more times, so you have six numbers."

**Result Range**: 3-18 per ability score

**Implementation Status**: ✅ Fully implemented in `diceRolling.js`

---

## ✅ Standard Array (CONFIRMED)

**Rule**: Use the following six scores: 15, 14, 13, 12, 10, 8

**Page 38**: "Standard Array. Use the following six scores for your abilities: 15, 14, 13, 12, 10, 8."

**Implementation Status**: ❌ NOT IMPLEMENTED (not a priority)

---

## ✅ Feats System (CONFIRMED - Chapter 5, Pages 198-210)

### Feat Acquisition
**Sources of Feats**:
1. **Background**: Gives you one Origin feat at character creation (Level 1)
2. **Class Levels**: "At certain levels, your class gives you the Ability Score Improvement feat or the choice of another feat for which you qualify"
3. **Prerequisites**: Must meet feat prerequisites unless a feature allows you to bypass them

### Feat Categories (Pages 199-211)
**Origin Feats** (11 total - gained from backgrounds):
- Alert, Crafter, Healer, Lucky, Magic Initiate*, Musician, Savage Attacker, Skilled*, Tavern Brawler, Tough

**General Feats** (50+ feats):
- Most feats fall into this category
- Prerequisite: Level 4+
- Many include +1 ability score increase
- Examples: Ability Score Improvement*, Actor, Athlete, Charger, Chef, Crossbow Expert, etc.

**Fighting Style Feats** (9 total):
- Prerequisite: Fighting Style Feature (class-specific)
- Examples: Archery, Defense, Dueling, Great Weapon Fighting, Two-Weapon Fighting, etc.

**Epic Boon Feats** (11 total):
- Prerequisite: Level 19+
- Can increase ability scores to maximum of 30 (breaking the normal 20 cap)
- Examples: Boon of Combat Prowess, Boon of Fortitude, Boon of Speed, etc.

### Key Feat Rules
**Taking Feats**:
- Can only take a feat once unless marked with asterisk (*) as "Repeatable"
- Repeatable feats: Ability Score Improvement, Elemental Adept, Magic Initiate, Skilled

**Ability Score Improvement Feat** (Page 202):
- General Feat (Prerequisite: Level 4+)
- Increase one ability score by 2, OR increase two ability scores by 1
- Cannot increase ability score above 20 (unless Epic Boon)
- **Repeatable**: Can take this feat more than once

**Class Prerequisites**:
- "If a prerequisite includes a class, you must have at least 1 level in that class to take the feat"

### What We Still DON'T Know (Requires Chapter 3)
- ❌ Which specific levels each class grants feats
- ❌ Whether all classes get feats at same levels
- ❌ Whether Fighter/Rogue get extra feats (as in 2014)

**Implementation Status**: ❌ NOT IMPLEMENTED
- Blocked on: Class progression tables from Chapter 3
- Need: Feat selection UI at appropriate levels
- Need: Feat prerequisite validation system

---

## 🔴 REMOVED: ASI System (Was Wrong for 2024)

**What We Incorrectly Implemented**:
- "ASI points" calculated from class levels
- Automatic ability score increases
- Treating ASI as guaranteed score boosts separate from feats

**2024 Reality**:
- Characters get **feats** at certain levels (not automatic ASI)
- Players **choose** between taking a feat OR using feat for ability score increase
- Only background bonuses are guaranteed ability score increases

**Status**: ✅ Removed from codebase (frontend + backend)

---

## Character Creation Workflow (2024)

### Step 1: Choose Class
- Select your character class
- Note primary ability

### Step 2: Determine Origin
- **Background**: Choose background (provides feat + ability bonuses)
- **Species**: Choose species (no longer provides ability bonuses in 2024)
- **Languages**: Common + 2 others

### Step 3: Determine Ability Scores
**Generate base scores** (choose one method):
- Point-Buy: 27 points, 8-15 range
- Roll: 4d6 drop lowest (3-18 range)
- Standard Array: 15, 14, 13, 12, 10, 8

**Apply background bonuses**:
- +2 to one ability, +1 to another
- OR +1 to three different abilities
- Cannot exceed 20

### Step 4: Choose Alignment
- Standard nine alignments

### Step 5: Fill in Details
- HP, AC, proficiencies, equipment

---

## Implementation Notes

### ✅ Currently Working
- Point-buy system (27 points, 8-15 range)
- Dice rolling (4d6 drop lowest)
- Multi-class support
- Manual ability score entry

### ⚠️ Needs Implementation
- Background selection UI
- Background ability score bonuses (+2/+1 or +1/+1/+1)
- Feat system (requires Chapter 3 data)

### ❌ Intentionally Not Implemented
- Standard Array (not a priority)
- Feat selection (blocked on Chapter 3 data)

---

## Future Work: Feats

**Blocked On**: Need Chapter 3 class progression tables

**What We Need**:
1. Which levels each class grants feats
2. List of available feats
3. Which feats provide ability score increases
4. Fighter/Rogue extra feat levels (if still exist in 2024)

**When Implementing**:
- Feat selection happens at specific class levels
- Player chooses: Take feat OR use for ability score increase
- Some feats may include ability score increases as part of their benefits
- Maximum ability score remains 20 (D&D 5e hard cap)

---

## References

- D&D 2024 Player's Handbook Chapter 2: Creating a Character
- Pages 33-45: Character creation steps
- Page 38: Point-buy costs, background bonuses, ability score generation
- Page 42: Level advancement, feat integration with ability scores
