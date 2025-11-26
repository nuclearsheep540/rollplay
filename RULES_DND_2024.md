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

## ✅ Background Bonuses (CONFIRMED - NEW IN 2024)

**Rule**: Every background provides one-time ability score increases at character creation

**Format** (choose one):
- Increase one score by +2 and another by +1
- Increase three different scores by +1 each

**Constraints**:
- Applied AFTER point-buy/rolling/standard array
- Cannot raise a score above 20
- One-time bonus (not repeatable)

**Page 38**: "After assigning your ability scores, adjust them according to your background. Your background lists three abilities; increase one of those scores by 2 and a different one by 1, or increase all three by 1."

**Implementation Status**: ⚠️ NOT YET IMPLEMENTED
- Backend: Need `origin_ability_bonus` field
- Frontend: Need background selection + bonus UI

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

## ⚠️ Feats and Ability Score Increases (PARTIAL INFO)

**What We Know**:
1. **Backgrounds provide feats at Level 1** (Page 36)
2. **Feats CAN increase ability scores** - they are not separate systems (Page 42)
3. **Class feature tables** (in Chapter 3) show when feats are granted

**What We DON'T Know** (requires Chapter 3 class tables):
- Which levels each class gets feats
- Whether Fighter gets extra feats (2014: levels 6, 14)
- Whether Rogue gets extra feat (2014: level 10)
- Specific feat options available

**Page 42**: "If you choose a feat that increases one or more of your ability scores, your ability modifier also changes if the new score is an even number."

**Implementation Status**: ❌ NOT IMPLEMENTED
- Requires full class progression data from Chapter 3
- Feat selection system needed
- Decision: Choose feat OR ability score increase

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
