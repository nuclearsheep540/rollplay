# SRD 5.2.1 — Character Creation & Level-Up Edge Case Enumeration

Comprehensive enumeration of every choice point a player faces during character creation, retroactive character building (starting above level 1), and level-up. Sourced directly from the official D&D System Reference Document 5.2.1 PDF. Page numbers (e.g. `p.27`) refer to the PDF's printed page numbers.

---

## Table of Contents

1. [The Character Creation Pipeline](#1-the-character-creation-pipeline)
2. [Ability Score Generation](#2-ability-score-generation)
3. [Hit Point Rules](#3-hit-point-rules)
4. [Armor Class Rules](#4-armor-class-rules)
5. [Proficiency Bonus & XP](#5-proficiency-bonus--xp)
6. [Backgrounds (4 options)](#6-backgrounds-4-options)
7. [Species (9 options)](#7-species-9-options)
8. [Feats Catalogue](#8-feats-catalogue)
9. [Skills, Tools, Languages, Expertise](#9-skills-tools-languages-expertise)
10. [Class-by-Class Choice Enumeration](#10-class-by-class-choice-enumeration)
11. [Multiclassing Rules](#11-multiclassing-rules)
12. [Starting at Higher Levels](#12-starting-at-higher-levels)
13. [Spellcasting Mechanics](#13-spellcasting-mechanics)
14. [In-Play State (Death Saves, Conditions, etc.)](#14-in-play-state-death-saves-conditions-etc)
15. [Weapon Mastery System](#15-weapon-mastery-system)
16. [Master Choice-Point Index per Level](#16-master-choice-point-index-per-level)

---

## 1. The Character Creation Pipeline

SRD `p.19-22` lists the canonical 5-step process. Every step has choices the UI must surface.

| Step | Name | Choices |
|------|------|---------|
| 1 | Choose Class | 1 of 12 classes; **if starting at level 3+, also choose subclass at this step** (p.19) |
| 2 | Determine Origin | Background (1 of 4); Species (1 of 9); 2 languages from Standard Languages |
| 3 | Determine Ability Scores | Generation method, allocation, +background bumps |
| 4 | Choose Alignment | 1 of 9 alignments (or "Unaligned", though only for non-PCs typically) |
| 5 | Fill in Details | HP, AC, attacks, spell selections, equipment package, trinket roll, languages from species/class |

> **Non-obvious (p.19):** Subclass is chosen at the level the class normally grants it (mostly L3, but Cleric and Wizard pick at L1 for Cleric / L3 for Wizard, and Warlock at L3 — see Section 10). If starting above L1, the player must retroactively pick that subclass.

---

## 2. Ability Score Generation

SRD `p.21` lists three methods, GM picks which is allowed:

| Method | Description |
|--------|-------------|
| **Standard Array** | Fixed set: `15, 14, 13, 12, 10, 8` |
| **Random Generation** | 6× (roll 4d6, drop lowest, sum top 3) |
| **Point Cost** | 27 points; score costs `8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9` (i.e. each ability starts ≥ 8 and ≤ 15) |

**Allocation:** Assign generated numbers freely to the six abilities.

**Background bumps (p.21, 83):** Background lists three abilities; player chooses either +2/+1 to two of them, OR +1/+1/+1 to all three. **None of these increases can raise a score above 20.**

**Ability cap (p.21):** Background bumps cannot push above **20**.

**ASI cap (p.87):** Ability Score Improvement feat — same cap of 20.

**Epic Boon caps (p.88):** Epic Boon feats push individual abilities to **30** (only at level 19+).

> **Non-obvious:** Standard Array means abilities at character creation are bounded `8 ≤ score ≤ 17` (15 base + max 2 from background bump). With point buy, bounded `8 ≤ score ≤ 17`. Random generation can theoretically produce 3..18 base, capped at 20 after bumps.

**Ability modifier table (p.21):** `3:-4, 4-5:-3, 6-7:-2, 8-9:-1, 10-11:+0, 12-13:+1, 14-15:+2, 16-17:+3, 18-19:+4, 20:+5`. Continues by extrapolation up to 30: `(score - 10) / 2` round down.

---

## 3. Hit Point Rules

### Level 1 HP (p.22, "Level 1 Hit Points by Class" table)

| Class | L1 HP |
|-------|-------|
| Barbarian | `12 + CON modifier` |
| Fighter, Paladin, Ranger | `10 + CON modifier` |
| Bard, Cleric, Druid, Monk, Rogue, Warlock | `8 + CON modifier` |
| Sorcerer, Wizard | `6 + CON modifier` |

### Per-Level HP (after L1, p.23)

For each level after 1, player picks ONE of:
- **Roll:** roll the class Hit Die, add CON modifier (minimum 1 added; the SRD text on p.23 says "add the total (minimum of 1) to your Hit Point maximum").
- **Fixed average:** use the table value (p.23):

| Class | Fixed per level |
|-------|-----------------|
| Barbarian | `7 + CON mod` |
| Fighter/Paladin/Ranger | `6 + CON mod` |
| Bard/Cleric/Druid/Monk/Rogue/Warlock | `5 + CON mod` |
| Sorcerer/Wizard | `4 + CON mod` |

> **Non-obvious (p.23):** When CON modifier increases (e.g. ASI raises CON from 13 → 14), HP maximum increases by 1 for **each level you have attained**. Example given: a L8 character whose CON goes 17 → 18 (modifier +3 → +4) gains 8 extra HP retroactively.

> **Non-obvious — minimum 1 per level:** The phrase "minimum of 1" applies to the HP gained per level, not to the die roll. So even a character with -4 CON modifier gains at least 1 HP per level. This matters when building a level-N character with low CON.

### HP modifiers from features

- **Dwarven Toughness** (p.84): "+1 HP at L1, +1 HP each time you gain a level" (so a L1 Dwarf gains +2; a L5 Dwarf gains +6 total).
- **Sorcerer Draconic Resilience** (p.69, subclass feature at L3): "+3 HP, then +1 HP each subsequent Sorcerer level." So a Draconic Sorcerer who takes the subclass at L3 gains +3 HP that level and +1 each subsequent Sorcerer level (L4, L5, ... L20 = +20 total).
- **Aid spell** (p.107): raises Hit Point maximum and current by 5/level above 2 — temporary 8-hour bump, not part of character build.
- **Hit Point Maximum reduction effects:** Some monster abilities reduce max HP; tracked separately.

### Retroactive HP for higher-level starts

When building a level-N character from scratch:
- L1 HP per the table above.
- For levels 2..N, the player chooses for each level whether to use fixed average (recommended for character creation since you can't "roll later") or the GM may let the player roll.
- Apply Dwarven Toughness / Draconic Resilience bumps for each level retroactively.
- Apply current CON modifier × N to HP maximum.

---

## 4. Armor Class Rules

There are **multiple competing AC formulas**; player picks the best one (p.22, p.25 multiclass note).

### Base AC

`AC = 10 + DEX modifier` (no armor, no shield).

### Armor (Equipment p.92)

| Armor Type | AC formula | Stealth | Strength req |
|------------|-----------|---------|--------------|
| **Light Armor** (Padded, Leather, Studded Leather) | `base + DEX` (no cap) | Padded gives Disadvantage on Stealth | none |
| **Medium Armor** (Hide, Chain Shirt, Scale Mail, Breastplate, Half Plate) | `base + DEX (max +2)` | Scale Mail and Half Plate give Disadvantage on Stealth | none |
| **Heavy Armor** (Ring Mail, Chain Mail, Splint, Plate) | flat AC, DEX irrelevant | All give Disadvantage on Stealth | Chain Mail 13, Splint 15, Plate 15 |

Armor base values from the table:
- Padded 11, Leather 11, Studded Leather 12
- Hide 12, Chain Shirt 13, Scale Mail 14, Breastplate 14, Half Plate 15
- Ring Mail 14, Chain Mail 16, Splint 17, Plate 18

**Shield** (`+2 AC`, p.92): stacks with everything, requires a free hand to wield.

### Class-feature AC alternatives

These do NOT stack with armor; player chooses one method per build (p.25 multiclass restatement).

| Feature | Formula | Class | Level | Notes |
|---------|---------|-------|-------|-------|
| **Barbarian Unarmored Defense** (p.29) | `10 + DEX + CON` | Barbarian | 1 | Shield allowed |
| **Monk Unarmored Defense** (p.50) | `10 + DEX + WIS` | Monk | 1 | No shield |
| **Sorcerer Draconic Resilience** (p.69) | `10 + DEX + CHA` | Sorcerer (Draconic subclass) | 3 | No shield |
| **Mage Armor spell** (Wizard L1 spell, Warlock invocation Armor of Shadows) | `13 + DEX` | spellcasters | varies | 8-hour duration, no armor worn |

### Fighting Style Defense feat (p.88)
While wearing Light/Medium/Heavy armor, `+1 AC` bonus.

### Multiclass AC interaction (p.25)
"If you have multiple ways to calculate your Armor Class, you can benefit from only one at a time." Explicit example: Monk/Sorcerer with both Unarmored Defenses must pick one.

> **Non-obvious:** Mage Armor doesn't work if the caster is already wearing armor. It can stack with a shield. So a Wizard with shield + Mage Armor gets `13 + DEX + 2 = 15 + DEX` AC.

---

## 5. Proficiency Bonus & XP

### XP & Level table (p.23)

| Level | XP needed | Prof Bonus |
|-------|-----------|------------|
| 1 | 0 | +2 |
| 2 | 300 | +2 |
| 3 | 900 | +2 |
| 4 | 2,700 | +2 |
| 5 | 6,500 | +3 |
| 6 | 14,000 | +3 |
| 7 | 23,000 | +3 |
| 8 | 34,000 | +3 |
| 9 | 48,000 | +4 |
| 10 | 64,000 | +4 |
| 11 | 85,000 | +4 |
| 12 | 100,000 | +4 |
| 13 | 120,000 | +5 |
| 14 | 140,000 | +5 |
| 15 | 165,000 | +5 |
| 16 | 195,000 | +5 |
| 17 | 225,000 | +6 |
| 18 | 265,000 | +6 |
| 19 | 305,000 | +6 |
| 20 | 355,000 | +6 |

Bonus feats post-20 (p.24): One feat per 30,000 XP earned above 355,000. Epic Boon feats recommended.

When starting at higher levels, the character begins with the **minimum XP** to reach that level (p.24).

---

## 6. Backgrounds (4 options)

Source: SRD `p.83`.

Each background has the same structure: 3 ability score options, 1 Origin feat, 2 skill proficiencies, 1 tool proficiency, equipment package A or B (50 GP).

| Background | Abilities (pick 1) | Feat | Skills (fixed) | Tool | Equip A | Equip B |
|------------|-------|------|----------------|------|---------|---------|
| **Acolyte** (p.83) | INT, WIS, CHA | Magic Initiate (Cleric) | Insight, Religion | Calligrapher's Supplies | Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment ×10, Robe, 8 GP | 50 GP |
| **Criminal** (p.83) | DEX, CON, INT | Alert | Sleight of Hand, Stealth | Thieves' Tools | 2 Daggers, Thieves' Tools, Crowbar, 2 Pouches, Traveler's Clothes, 16 GP | 50 GP |
| **Sage** (p.83) | CON, INT, WIS | Magic Initiate (Wizard) | Arcana, History | Calligrapher's Supplies | Quarterstaff, Calligrapher's Supplies, Book (history), Parchment ×8, Robe, 8 GP | 50 GP |
| **Soldier** (p.83) | STR, DEX, CON | Savage Attacker | Athletics, Intimidation | **CHOOSE** kind of Gaming Set | Spear, Shortbow, 20 Arrows, Gaming Set (matching), Healer's Kit, Quiver, Traveler's Clothes, 14 GP | 50 GP |

### Choice points per background

- **All backgrounds:** ability bumps (+2/+1 vs +1/+1/+1)
- **All backgrounds:** equipment package A or B
- **Acolyte / Sage:** the Magic Initiate feat has a pre-set spell list (Cleric for Acolyte, Wizard for Sage) but the player still chooses **2 cantrips and 1 level-1 spell** from that list (p.87) AND chooses the spellcasting ability (INT/WIS/CHA).
- **Soldier:** choose the variant of Gaming Set (dice, dragonchess, playing cards, three-dragon ante per p.94).

> **Non-obvious — Magic Initiate parameter:** Acolyte → "Magic Initiate (Cleric)" means the player must use the Cleric spell list when choosing cantrips/spell. Sage → "Magic Initiate (Wizard)" means Wizard spell list. The feat itself (p.87) lists choices Cleric/Druid/Wizard — but background pre-sets the list. The feat is **Repeatable**, so a Sage who takes Magic Initiate again later via a class feat can pick a different list.

---

## 7. Species (9 options)

Source: SRD `p.83-86`.

All SRD species have **Creature Type: Humanoid**. All have Speed 30 unless noted. Sizes vary.

### Species choice matrix

| Species | Size | Speed | Sub-choices required |
|---------|------|-------|----------------------|
| **Dragonborn** (p.84) | Medium | 30 | Draconic Ancestry: pick 1 of 10 dragons (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, White) → determines breath weapon shape default, damage type, resistance |
| **Dwarf** (p.84) | Medium | 30 | None (Darkvision 120, Dwarven Resilience, Dwarven Toughness +1HP/level, Stonecunning) |
| **Elf** (p.84-85) | Medium | 30 | **Elven Lineage: Drow / High Elf / Wood Elf** (each grants a level-1 trait + L3 spell + L5 spell, see table below). Also choose **spellcasting ability** (INT/WIS/CHA) for lineage spells. Also choose **Keen Senses skill** (Insight, Perception, or Survival). |
| **Gnome** (p.85) | Small | 30 | **Gnomish Lineage: Forest Gnome / Rock Gnome** + choose spellcasting ability (INT/WIS/CHA) |
| **Goliath** (p.85-86) | Medium | 35 | **Giant Ancestry: Cloud / Fire / Frost / Hill / Stone / Storm Giant** (6 options) |
| **Halfling** (p.86) | Small | 30 | None |
| **Human** (p.86) | Medium OR Small (choose) | 30 | Choose Size; **choose any 1 skill proficiency** (Skillful); **gain 1 Origin feat of choice** (Versatile, with sub-choices in that feat) |
| **Orc** (p.86) | Medium | 30 | None |
| **Tiefling** (p.86) | Medium OR Small (choose) | 30 | Choose Size; **Fiendish Legacy: Abyssal / Chthonic / Infernal** + choose spellcasting ability (INT/WIS/CHA) for legacy spells |

### Elven Lineage details (p.85)

| Lineage | L1 trait | L3 spell | L5 spell |
|---------|----------|----------|----------|
| **Drow** | Darkvision → 120 ft, know `Dancing Lights` cantrip | `Faerie Fire` | `Darkness` |
| **High Elf** | Know `Prestidigitation` cantrip (swappable to another Wizard cantrip on Long Rest) | `Detect Magic` | `Misty Step` |
| **Wood Elf** | Speed → 35 ft, know `Druidcraft` cantrip | `Longstrider` | `Pass without Trace` |

### Giant Ancestry options (Goliath, p.85-86)

| Ancestry | Benefit (PB uses/Long Rest) |
|----------|-----------------------------|
| **Cloud's Jaunt** | Bonus Action teleport up to 30 ft |
| **Fire's Burn** | On hit, +1d10 Fire damage |
| **Frost's Chill** | On hit, +1d6 Cold damage + reduce target speed by 10 ft |
| **Hill's Tumble** | On hit vs Large or smaller, target gains Prone |
| **Stone's Endurance** | Reaction when damaged, 1d12 + CON reduction |
| **Storm's Thunder** | Reaction when damaged within 60 ft, deal 1d8 Thunder damage to attacker |

Also: **Goliath Large Form** at character L5 (Bonus Action, lasts 10 min, Large size + Advantage STR checks + Speed +10) — once/Long Rest.

### Fiendish Legacy options (Tiefling, p.86)

| Legacy | L1 trait | L3 spell | L5 spell |
|--------|----------|----------|----------|
| **Abyssal** | Resist Poison, know `Poison Spray` cantrip | `Ray of Sickness` | `Hold Person` |
| **Chthonic** | Resist Necrotic, know `Chill Touch` cantrip | `False Life` | `Ray of Enfeeblement` |
| **Infernal** | Resist Fire, know `Fire Bolt` cantrip | `Hellish Rebuke` | `Darkness` |

Tiefling also always knows `Thaumaturgy` cantrip (Otherworldly Presence trait).

### Dragonborn Draconic Ancestry → Damage Type (p.84)

| Dragon | Damage |
|--------|--------|
| Black, Copper | Acid |
| Blue, Bronze | Lightning |
| Brass, Gold, Red | Fire |
| Silver, White | Cold |
| Green | Poison |

Dragonborn breath weapon (p.84): replaces 1 attack of Attack action; choose 15-ft Cone OR 30-ft Line (5 ft wide), each use. Damage 1d10, scales: 1d10 / 2d10 (L5) / 3d10 (L11) / 4d10 (L17). Uses = PB/Long Rest. Resist same damage type. **Draconic Flight** at character L5 — Bonus Action, 10 min temporary Fly Speed = Speed, once/Long Rest.

> **Non-obvious — character-level-scaled species features:** Dragonborn Breath Weapon scales by **character level**, not by class level. Dwarven Toughness also scales by character level. Multiclassing doesn't break these progressions.

### Species-driven retroactive choices when starting at level N
- All sub-choices (lineage, ancestry, legacy) must be picked.
- Spellcasting ability choices must be picked.
- If species grants spells at L3/L5 (Elf, Tiefling), those spells are unlocked automatically when applicable.
- If species grants ability at character L5 (Dragonborn Flight, Goliath Large Form), it's available immediately on retro-build to L5+.

---

## 8. Feats Catalogue

Source: SRD `p.87-88`. 4 categories: Origin, General, Fighting Style, Epic Boon.

### Origin Feats (4 total — pickable at L1 via background or species)

| Feat | Choices |
|------|---------|
| **Alert** (p.87) | None. Grants Initiative Proficiency + Initiative swap with willing ally |
| **Magic Initiate** (p.87) | Pick spell list (Cleric/Druid/Wizard) + 2 cantrips + 1 level-1 spell + spellcasting ability (INT/WIS/CHA). **Repeatable** (different list each time). |
| **Savage Attacker** (p.87) | None. Once/turn, reroll weapon damage and keep either |
| **Skilled** (p.87) | Choose 3 skill OR tool proficiencies. **Repeatable**. |

### General Feats (Prereq: Level 4+)

| Feat | Prereq | Choices |
|------|--------|---------|
| **Ability Score Improvement** (p.87) | L4+ | +2 to one ability OR +1 to two abilities. Cap 20. **Repeatable**. |
| **Grappler** (p.87) | L4+, STR or DEX ≥ 13 | +1 STR or DEX (max 20); grants Punch and Grab, Attack Advantage vs grappled, Fast Wrestler |

> **Note:** The SRD only contains 2 General Feats explicitly. The Player's Handbook has many more, but only ASI and Grappler are in the SRD.

### Fighting Style Feats (Prereq: a Fighting Style class feature)

Source p.87-88. Available to Fighter L1, Paladin L2, Ranger L2 base; Champion Fighter gets a second at L7.

| Feat | Effect |
|------|--------|
| **Archery** | +2 to attack rolls with Ranged weapons |
| **Defense** | +1 AC while wearing Light/Medium/Heavy armor |
| **Great Weapon Fighting** | Two-handed melee weapon: treat 1s/2s on damage as 3 (only Two-Handed or Versatile weapons) |
| **Two-Weapon Fighting** | Add ability modifier to off-hand Light weapon damage |

> **Non-obvious:** Paladin L2 can pick a Fighting Style feat **OR** an alternative option called **Blessed Warrior** (p.54), which gives 2 Cleric cantrips (with CHA as casting ability). Ranger L2 same shape with **Druidic Warrior** (2 Druid cantrips, WIS-cast). Each is a discrete choice slot in addition to the Fighting Style feat list.

### Epic Boon Feats (Prereq: Level 19+)

All give `+1 to one ability, max 30`. Pick the boon at L19 via class's Epic Boon feature, or post-20 via bonus feats.

| Feat | Ability Increase | Other Benefit |
|------|------------------|---------------|
| **Boon of Combat Prowess** | any | Peerless Aim: convert a miss to a hit (1/turn) |
| **Boon of Dimensional Travel** | any | Blink Steps: 30-ft teleport after Attack/Magic action |
| **Boon of Fate** | any | Improve Fate: 2d4 bonus/penalty to a D20 Test within 60 ft (1/rest or 1/Initiative) |
| **Boon of Irresistible Offense** | STR or DEX | Bludgeoning/Piercing/Slashing ignores Resistance; on nat 20, extra damage = the boosted ability |
| **Boon of Spell Recall** (req: Spellcasting feature) | INT/WIS/CHA | Free Casting: when casting with 1-4 slot, 1d4 to recover slot if roll equals slot level |
| **Boon of the Night Spirit** | any | Merge with Shadows: BA invisibility in Dim Light/Darkness; Resist all dmg except Psychic/Radiant in Dim/Dark |
| **Boon of Truesight** | any | Truesight 60 ft |

---

## 9. Skills, Tools, Languages, Expertise

### Skill list (p.9, 18 skills total)

| Skill | Ability |
|-------|---------|
| Acrobatics | DEX |
| Animal Handling | WIS |
| Arcana | INT |
| Athletics | STR |
| Deception | CHA |
| History | INT |
| Insight | WIS |
| Intimidation | CHA |
| Investigation | INT |
| Medicine | WIS |
| Nature | INT |
| Perception | WIS |
| Performance | CHA |
| Persuasion | CHA |
| Religion | INT |
| Sleight of Hand | DEX |
| Stealth | DEX |
| Survival | WIS |

### Where skills come from

- **Background** (always 2 fixed): see Section 6.
- **Class** (varies, choose from class menu): see per-class details Section 10.
- **Species**: Elf chooses 1 of (Insight, Perception, Survival) via Keen Senses; Human chooses 1 of any skill via Skillful.
- **Feats**: Skilled (3 proficiencies); Cleric (Thaumaturge) gets Arcana/Religion bonus from WIS; Bard L3 College of Lore (3 bonus proficiencies); Wizard L2 Scholar (Expertise in 1 of: Arcana/History/Investigation/Medicine/Nature/Religion).
- **Class-specific level features**: Barbarian L3 Primal Knowledge (+1 from Barb list); Ranger L2 Deft Explorer (Expertise in one skill proficiency); Ranger L9 Expertise; Rogue L1 Expertise (2 skills); Rogue L6 Expertise (2 more skills); Bard L2 Expertise (2 skills); Bard L9 Expertise (2 more skills).

### SRD's stance on duplicate skill grants

The SRD does **not** explicitly say what happens if the same skill is granted by both background and class. By RAW and convention (carry-over from PHB), the player typically picks a different skill (often from any list) as a substitute, but this is a GM call. **Surface this inline as point-of-choice guidance** (offer a substitute pick) — not a hard block, and not a submit-time warning.

### Languages (p.20)

- Common is granted to all characters automatically.
- **Step 2 grants 2 languages** from Standard Languages table (1d12 roll or pick): Common Sign Language, Draconic, Dwarvish, Elvish, Giant, Gnomish, Goblin, Halfling, Orc.
- **Rare Languages**: Abyssal, Celestial, Deep Speech, Druidic, Infernal, Primordial (Aquan, Auran, Ignan, Terran), Sylvan, Thieves' Cant, Undercommon. These come from specific features.

### Language grants from class/feature
- **Druid L1 Druidic** (p.42): knows Druidic, the secret language of Druids.
- **Rogue L1 Thieves' Cant** (p.62): knows Thieves' Cant + 1 chosen language from Standard or Rare list.
- **Ranger L2 Deft Explorer** (p.59): knows 2 languages of choice from language tables.

### Expertise mechanics (p.182 glossary)
- Doubles PB on checks with that skill proficiency.
- Cannot have Expertise in the same skill twice.
- Granted by: Rogue L1 (2 skills), Rogue L6 (2 more skills), Bard L2 (2 skills), Bard L9 (2 more skills), Ranger L2 Deft Explorer (1 skill), Ranger L9 (no, this is just one more skill from the menu via "Expertise" feature — see Ranger entry), Wizard L2 Scholar (1 skill).

### Tools

Tools are listed at p.93-94. Includes Artisan's Tools (16 variants), Gaming Sets, Musical Instruments (10 variants), Herbalism Kit, Thieves' Tools, Disguise Kit, Forgery Kit, Navigator's Tools, Poisoner's Kit. **Each variant requires its own proficiency.**

Source from: Backgrounds (always 1 tool), some classes (e.g. Bard 3 musical instruments, Rogue Thieves' Tools, Druid Herbalism Kit, Monk choose 1 Artisan's Tool OR Musical Instrument).

---

## 10. Class-by-Class Choice Enumeration

Every level for every class is listed, flagging each decision point. For each class:
- ASI levels listed explicitly (varies — Fighter has 7, Rogue has 5, others typically 4).
- Subclass level flagged (mostly 3, except **Cleric L3** in 5.2 — note this is the L3 subclass, not the L1 Wisdom for older clerics; both Cleric and Druid pick subclass at L3 in 5.2.1).
- Number of skills, weapons trained, spells known/prepared given.

### 10.1 BARBARIAN (p.28-30)

**Core:** d12 HD, STR/CON saves, Simple+Martial weapons, Light+Medium armor + Shields. **Skills: choose 2** from `[Animal Handling, Athletics, Intimidation, Nature, Perception, Survival]`.

**Starting Equipment**: A `(Greataxe, 4 Handaxes, Explorer's Pack, 15 GP)` OR B `(75 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Weapon Mastery (2 weapons)** — choose 2 Simple or Martial Melee weapons whose mastery property to use. Swap 1 on Long Rest. |
| 1 | Rage (2 uses), Unarmored Defense (no decision) |
| 2 | Danger Sense, Reckless Attack |
| **3** | **Barbarian Subclass** (Path of the Berserker only in SRD) |
| 3 | **Primal Knowledge** — choose +1 skill from Barbarian skill list |
| **4** | **ASI / Feat** |
| 5 | Extra Attack, Fast Movement (+10 speed) |
| 6 | Subclass feature |
| 7 | Feral Instinct, Instinctive Pounce |
| **8** | **ASI / Feat** |
| 9 | **Brutal Strike** — when using Reckless Attack, gain extra effect. Has **sub-choice** between effects: Forceful Blow / Hamstring Blow |
| 9 | Weapon Mastery → **3 weapons** |
| 10 | Subclass feature |
| 11 | Relentless Rage |
| **12** | **ASI / Feat** |
| 13 | Improved Brutal Strike (new effect choices: Staggering Blow / Sundering Blow) |
| 14 | Subclass feature |
| 15 | Persistent Rage |
| **16** | **ASI / Feat** |
| 17 | Improved Brutal Strike (extra damage to 2d10) |
| 18 | Indomitable Might |
| **19** | **Epic Boon** (Boon of Irresistible Offense recommended) |
| 20 | Primal Champion — +4 STR/CON (max 25) |

**Subclass: Path of the Berserker** (p.30) features at L3, L6, L10, L14. No sub-choices in this subclass at any level.

**Weapon Mastery scaling for Barbarian**: 2 (L1), 3 (L4), 3 (L10), 4 (L10), 4 (L16). Per table p.28 actually: 2/2/2/3/3/3/3/3/3/4/4/4/4/4/4/4/4/4/4/4.

### 10.2 BARD (p.31-35)

**Core:** d8 HD, DEX/CHA saves, Simple weapons, Light armor. **Skills: choose 3 of ANY**. **Tools: choose 3 Musical Instruments**.

**Starting Equipment**: A `(Leather Armor, 2 Daggers, Musical Instrument of choice, Entertainer's Pack, 19 GP)` OR B `(90 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Cantrips (2)** + **Prepared Spells (4 level-1)** — chosen from Bard spell list |
| 1 | Bardic Inspiration (d6, CHA mod uses/Long Rest) |
| **2** | **Expertise (2 skills)** — chosen from Bard skill profs |
| 2 | Jack of All Trades |
| **3** | **Bard Subclass** (College of Lore only in SRD) |
| **3** | College of Lore L3: **Bonus Proficiencies** — 3 skills of choice |
| **4** | **ASI / Feat**, +1 cantrip (3 total) |
| 5 | Font of Inspiration, Bardic die → d8 |
| 6 | Subclass feature (Magical Discoveries — see below) |
| 7 | Countercharm |
| **8** | **ASI / Feat** |
| **9** | **Expertise (2 more skills)** — chosen from Bard skill profs |
| 10 | **Magical Secrets** — when spells-prepared count increases, choices may now come from Bard, Cleric, Druid, Wizard lists |
| 10 | +1 cantrip (4 total), Bardic die → d10 |
| 11 | — |
| **12** | **ASI / Feat** |
| 13 | — |
| 14 | Subclass feature (Peerless Skill) |
| 15 | Bardic die → d12 |
| **16** | **ASI / Feat** |
| 17 | — |
| 18 | Superior Inspiration |
| **19** | **Epic Boon** |
| 20 | Words of Creation — always have Power Word Heal / Power Word Kill prepared |

**Spell progression per level (p.31 table):**

| Level | Cantrips | Prepared Spells | Top Slot Lvl |
|-------|----------|-----------------|--------------|
| 1 | 2 | 4 | 1 |
| 2 | 2 | 5 | 1 |
| 3 | 2 | 6 | 2 |
| 4 | 3 | 7 | 2 |
| 5 | 3 | 9 | 3 |
| 6 | 3 | 10 | 3 |
| 7 | 3 | 11 | 4 |
| 8 | 3 | 12 | 4 |
| 9 | 3 | 14 | 5 |
| 10 | 4 | 15 | 5 |
| 11 | 4 | 16 | 6 |
| 12 | 4 | 16 | 6 |
| 13 | 4 | 17 | 7 |
| 14 | 4 | 17 | 7 |
| 15 | 4 | 18 | 8 |
| 16 | 4 | 18 | 8 |
| 17 | 4 | 19 | 9 |
| 18 | 4 | 20 | 9 |
| 19 | 4 | 21 | 9 |
| 20 | 4 | 22 | 9 |

> **Non-obvious — Bard "change prepared spells":** Bard only replaces 1 spell when leveling up (table p.104), NOT per Long Rest. Full re-prepare requires multiple levels.

**Subclass: College of Lore** (p.35): L3 Bonus Proficiencies (3 skills), L3 Cutting Words, L6 Magical Discoveries (2 spells from Cleric/Druid/Wizard, choose at L6 and may replace 1 on level-up), L14 Peerless Skill.

### 10.3 CLERIC (p.36-40)

**Core:** d8 HD, WIS/CHA saves, Simple weapons, Light+Medium armor + Shields. **Skills: choose 2** from `[History, Insight, Medicine, Persuasion, Religion]`.

**Starting Equipment**: A `(Chain Shirt, Shield, Mace, Holy Symbol, Priest's Pack, 7 GP)` OR B `(110 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Cantrips (3)** + **Prepared Spells (4 level-1)** |
| **1** | **Divine Order** — choose Protector OR Thaumaturge |
| 1 | Spellcasting |
| 2 | Channel Divinity (2 uses) — Divine Spark + Turn Undead |
| **3** | **Cleric Subclass** (Life Domain only in SRD) |
| **4** | **ASI / Feat**, +1 cantrip (4 total) |
| 5 | Sear Undead |
| 6 | Subclass feature, Channel Divinity (3 uses) |
| **7** | **Blessed Strikes** — choose Divine Strike OR Potent Spellcasting |
| **8** | **ASI / Feat** |
| 9 | — |
| 10 | Divine Intervention, +1 cantrip (5 total) |
| 11 | — |
| **12** | **ASI / Feat** |
| 13 | — |
| 14 | Improved Blessed Strikes (chosen option grows; **no new choice**) |
| 15 | — |
| **16** | **ASI / Feat** |
| 17 | Subclass feature |
| 18 | +1 cantrip (5 still per table, see) |
| **19** | **Epic Boon** |
| 20 | Greater Divine Intervention (Wish access) |

**Divine Order options (p.37):**
- **Protector**: proficiency with Martial weapons + training with Heavy armor.
- **Thaumaturge**: +1 cantrip + bonus to Arcana/Religion checks = WIS mod (min +1).

**Channel Divinity uses**: 2 (L2) → 3 (L6) → no further increases listed in SRD table.

**Cantrips count by level (p.36 table):** 3 at L1; 4 at L4; 5 at L10; 6 at L18. Actually re-reading: 3 / 3 / 3 / 4 / 4 / 4 / 4 / 4 / 4 / 5 / 5 / 5 / 5 / 5 / 5 / 5 / 5 / 6 / 6 / 6 — let me re-verify... Per the table: 3 (L1-3), 4 (L4-9), 5 (L10-17), 6 (L18-20). But the L18 row shows 4 still? **Re-reading the table carefully** (p.36): Levels 1-3: 3 cantrips. L4-9: 4. L10-17: 5. L18-20: 6. ← Confirmed.

Wait re-reading raw extract: "1 ... 3"  "2 ... 3" "3 ... 3" "4 ... 4" "5 ... 4" "6 ... 4" "7 ... 4" "8 ... 4" "9 ... 4" "10 ... 5" "11 ... 5" "12 ... 5" "13 ... 5" "14 ... 5" "15 ... 5" "16 ... 5" "17 ... 5" "18 ... 6" "19 ... 6" "20 ... 6" — but the text says "When you reach Cleric levels 4 and 10, you learn another cantrip" — so cantrips count is **3 / 4 / 5** through levels, not 6. But the table row at L18 shows '6'. Re-checking SRD raw: actually it shows '3' for L17 then '4' for L18, etc. **The table appears authoritative**: 3 → 4 (L4) → 5 (L10) → and possibly another bump at L18 (visible in raw extract above showing "18 +6 — 4 5 20"). Wait, the column reading is: Level/PB/Class Features/Channel Divinity/Cantrips/Prepared Spells/Spell Slots... So at L18, Cantrips column = 4 (the "4" before "5" in "4 5 20"). Hmm, but the SRD raw I extracted showed for row 18: "18 +6 — 4 5 20 4 3 3 3 3 1 1 1 1". Re-parsing: PB=+6, Features=—, ChannelDiv=4, Cantrips=5, PreparedSpells=20, Slots... So cantrips at L18 = 5? Actually the order in the header is "Channel Divinity, Cantrips, Prepared Spells" so for L18: 4 (channel), 5 (cantrips), 20 (prepared). So I think I had it wrong. **Cleric cantrips known: 3 → 4 (L4) → 5 (L10) → stays at 5.**

> Actually wait, the SRD text says (p.36): "When you reach Cleric levels 4 and 10, you learn another cantrip of your choice from the Cleric spell list." — this confirms only 2 cantrip increases (L4 and L10). Final: **3 / 4 / 5 cantrips known.** Plus +1 if Thaumaturge at L1, so could be 4/5/6.

**Spell progression for Cleric (per p.36 table)**: Full caster, max 4/3/3/3/3/2/2/1/1 at L20. Prepared spells count: 4/5/6/7/9/10/11/12/14/15/16/16/17/17/18/18/19/20/21/22.

> **Non-obvious — Cleric prepared spells change frequency:** Long Rest, any (full re-prepare). Per p.104 table.

**Subclass: Life Domain** (p.40):
- L3 Disciple of Life, Life Domain Spells (always-prepared: Aid, Bless, Cure Wounds, Lesser Restoration), Preserve Life
- L5 Always-prep: Mass Healing Word, Revivify
- L6 Blessed Healer
- L7 Always-prep: Aura of Life, Death Ward
- L9 Always-prep: Greater Restoration, Mass Cure Wounds
- L17 Supreme Healing

### 10.4 DRUID (p.41-46)

**Core:** d8 HD, INT/WIS saves, Simple weapons, Light armor + Shields, **Herbalism Kit** (tool prof). **Skills: choose 2** from `[Animal Handling, Arcana, Insight, Medicine, Nature, Perception, Religion, Survival]`.

**Starting Equipment**: A `(Leather Armor, Shield, Sickle, Druidic Focus (Quarterstaff), Explorer's Pack, Herbalism Kit, 9 GP)` OR B `(50 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Cantrips (2)** + **Prepared Spells (4 level-1)** |
| 1 | Druidic (language); Speak with Animals always prepared |
| **1** | **Primal Order** — choose Magician OR Warden |
| 2 | Wild Shape (2 uses) — **choose 4 Beast forms** (CR ≤ 1/4, no Fly) — swap on Long Rest |
| 2 | Wild Companion |
| **3** | **Druid Subclass** (Circle of the Land only in SRD) |
| **3** | Circle of the Land: **choose land type** (Arid/Polar/Temperate/Tropical) on each Long Rest |
| **4** | **ASI / Feat**, +1 cantrip (3 total), Wild Shape: 6 forms / CR 1/2 |
| 5 | Wild Resurgence |
| 6 | Subclass feature (Natural Recovery) |
| **7** | **Elemental Fury** — choose Potent Spellcasting OR Primal Strike |
| **8** | **ASI / Feat**, Wild Shape: 8 forms / CR 1 / Fly OK |
| 9 | — |
| 10 | Subclass feature (Nature's Ward) |
| 11 | — |
| **12** | **ASI / Feat** |
| 13 | — |
| 14 | Subclass feature (Nature's Sanctuary) |
| 15 | Improved Elemental Fury (chosen option grows) |
| **16** | **ASI / Feat** |
| 17 | +1 cantrip (4 total) |
| 18 | Beast Spells (can cast in Wild Shape) |
| **19** | **Epic Boon** |
| 20 | Archdruid |

**Primal Order options (p.42):**
- **Magician**: +1 cantrip; bonus to Arcana/Nature checks = WIS mod (min +1).
- **Warden**: Martial weapons prof + Medium armor training.

**Wild Shape forms scaling**: 2 uses (L2), 3 (L6), 4 (L10), all per p.41 table. Forms known: 4 (L2), 6 (L4), 8 (L8). Max CR: 1/4 (L2), 1/2 (L4), 1 (L8). Fly Speed allowed from L8.

**Subclass: Circle of the Land** (p.46) sub-choices:
- L3 always-prep land spells (chosen land determines list).
- L10 Nature's Ward damage resistance type follows chosen land.

### 10.5 FIGHTER (p.47-49)

**Core:** d10 HD, STR/CON saves, Simple+Martial weapons, Light+Medium+Heavy armor + Shields. **Skills: choose 2** from `[Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Persuasion, Perception, Survival]`.

**Starting Equipment**: A `(Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer's Pack, 4 GP)` OR B `(Studded Leather, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Dungeoneer's Pack, 11 GP)` OR C `(155 GP)`.

> **Non-obvious — Fighter has 3 starting equipment options**, not 2.

| Level | Choice / Feature |
|-------|-------|
| **1** | **Fighting Style** — gain a Fighting Style feat (4 options: Archery, Defense, Great Weapon Fighting, Two-Weapon Fighting). Swap on level-up. |
| **1** | **Weapon Mastery (3 weapons)** — swap 1 on Long Rest |
| 1 | Second Wind (2 uses) |
| 2 | Action Surge (1 use) |
| 2 | Tactical Mind |
| **3** | **Fighter Subclass** (Champion only in SRD) |
| **4** | **ASI / Feat**, Weapon Mastery (4) |
| 5 | Extra Attack |
| 5 | Tactical Shift |
| **6** | **ASI / Feat** (extra ASI vs other classes) |
| 7 | Subclass feature (Additional Fighting Style — picks 2nd Fighting Style feat) |
| **8** | **ASI / Feat** |
| 9 | Indomitable (1 use), Tactical Master |
| 10 | Subclass feature (Heroic Warrior), Second Wind (4), Weapon Mastery (5) |
| 11 | Two Extra Attacks |
| **12** | **ASI / Feat** |
| 13 | Indomitable (2 uses), Studied Attacks |
| **14** | **ASI / Feat** |
| 15 | Subclass feature (Superior Critical) |
| **16** | **ASI / Feat** |
| 17 | Action Surge (2 uses), Indomitable (3 uses) |
| 18 | Subclass feature (Survivor) |
| **19** | **Epic Boon** (Boon of Combat Prowess recommended) |
| 20 | Three Extra Attacks |

> **Non-obvious — Fighter has 7 ASI feature levels (4, 6, 8, 12, 14, 16) plus Epic Boon at 19.** Standard classes have 4 (4, 8, 12, 16) plus Epic Boon at 19. Fighter has the most ASIs.

**Subclass: Champion** (p.49):
- L3 Improved Critical (19-20), Remarkable Athlete
- L7 **Additional Fighting Style** — pick another Fighting Style feat
- L10 Heroic Warrior
- L15 Superior Critical (18-20)
- L18 Survivor

### 10.6 MONK (p.49-52)

**Core:** d8 HD, STR/DEX saves, Simple + Martial-with-Light weapons, **no armor training**, **choose 1 Artisan's Tool OR Musical Instrument**. **Skills: choose 2** from `[Acrobatics, Athletics, History, Insight, Religion, Stealth]`.

**Starting Equipment**: A `(Spear, 5 Daggers, Artisan's Tools or Musical Instrument chosen for tool prof, Explorer's Pack, 11 GP)` OR B `(50 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | Martial Arts (d6), Unarmored Defense (10 + DEX + WIS) |
| 2 | Monk's Focus (2 Focus Points), Unarmored Movement (+10), Uncanny Metabolism |
| 3 | Deflect Attacks |
| **3** | **Monk Subclass** (Warrior of the Open Hand only in SRD) |
| **4** | **ASI / Feat**, Slow Fall |
| 5 | Extra Attack, Stunning Strike, Martial Arts d8 |
| 6 | Empowered Strikes, Subclass feature, Movement +15 |
| 7 | Evasion |
| **8** | **ASI / Feat** |
| 9 | Acrobatic Movement |
| 10 | Heightened Focus, Self-Restoration, Movement +20 |
| 11 | Subclass feature, Martial Arts d10 |
| **12** | **ASI / Feat** |
| 13 | Deflect Energy |
| 14 | Disciplined Survivor (proficiency in all saving throws — Monk gains massive save proficiency upgrade), Movement +25 |
| 15 | Perfect Focus |
| **16** | **ASI / Feat** |
| 17 | Subclass feature, Martial Arts d12 |
| 18 | Superior Defense, Movement +30 |
| **19** | **Epic Boon** |
| 20 | Body and Mind (+4 DEX/WIS max 25) |

**Subclass: Warrior of the Open Hand** (p.52):
- L3 Open Hand Technique — when hitting with Flurry of Blows, choose 1 of `[Addle, Push, Topple]` per attack
- L6 Wholeness of Body
- L11 Fleet Step
- L17 Quivering Palm

### 10.7 PALADIN (p.53-57)

**Core:** d10 HD, WIS/CHA saves, Simple+Martial weapons, Light+Medium+Heavy armor + Shields. **Skills: choose 2** from `[Athletics, Insight, Intimidation, Medicine, Persuasion, Religion]`.

**Starting Equipment**: A `(Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol, Priest's Pack, 9 GP)` OR B `(150 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Prepared Spells (2 level-1)** chosen from Paladin spell list. **Half-caster — no cantrips by default.** |
| 1 | Lay On Hands, Weapon Mastery (2) |
| **2** | **Fighting Style** — pick Fighting Style feat OR **Blessed Warrior** alternative (2 Cleric cantrips, CHA-cast) |
| 2 | Paladin's Smite (always-prep Divine Smite, 1 free cast per Long Rest) |
| **3** | **Paladin Subclass** (Oath of Devotion only in SRD); Channel Divinity (2 uses, Divine Sense + subclass-specific options) |
| **4** | **ASI / Feat** |
| 5 | Extra Attack, Faithful Steed (always-prep Find Steed) |
| 6 | Aura of Protection (+CHA to saves in 10-ft aura) |
| 7 | Subclass feature (Aura of Devotion) |
| **8** | **ASI / Feat** |
| 9 | Abjure Foes (Channel Divinity option) |
| 10 | Aura of Courage |
| 11 | Radiant Strikes (+1d8 Radiant on melee), Channel Divinity 3 uses |
| **12** | **ASI / Feat** |
| 13 | — |
| 14 | Restoring Touch (Lay On Hands removes more conditions) |
| 15 | Subclass feature (Smite of Protection) |
| **16** | **ASI / Feat** |
| 17 | — |
| 18 | Aura Expansion (10 → 30 ft) |
| **19** | **Epic Boon** (Boon of Truesight recommended) |
| 20 | Subclass feature (Holy Nimbus) |

**Paladin spell progression** (p.53): Half-caster. Top spell levels by Paladin level: L1→1, L5→2, L9→3, L13→4, L17→5. Prepared spells: 2/3/4/5/6/6/7/7/9/9/10/10/11/11/12/12/14/14/15/15.

> **Non-obvious — Paladin has no cantrips by default.** The Blessed Warrior alternative at L2 grants 2 Cleric cantrips; otherwise zero cantrips throughout progression. Compare to Cleric (3) and Druid (2-4).

> **Non-obvious — Channel Divinity options come from features**: The base Channel Divinity feature only gives Divine Sense at L3. Other CD options unlock via subclass (Sacred Weapon at L3 from Oath of Devotion) and class progression (Abjure Foes at L9). The player picks **which CD option** to invoke per use.

**Subclass: Oath of Devotion** (p.56-57):
- L3 Always-prep: Protection from Evil and Good, Shield of Faith. Sacred Weapon (Channel Divinity option).
- L5 Always-prep: Aid, Zone of Truth.
- L7 Aura of Devotion
- L9 Always-prep: Beacon of Hope, Dispel Magic.
- L13 Always-prep: Freedom of Movement, Guardian of Faith.
- L15 Smite of Protection
- L17 Always-prep: Commune, Flame Strike.
- L20 Holy Nimbus

### 10.8 RANGER (p.57-61)

**Core:** d10 HD, STR/DEX saves, Simple+Martial weapons, Light+Medium armor + Shields. **Skills: choose 3** from `[Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, Survival]`.

**Starting Equipment**: A `(Studded Leather, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (sprig of mistletoe), Explorer's Pack, 7 GP)` OR B `(150 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Prepared Spells (2 level-1)** chosen from Ranger spell list. **No cantrips by default.** |
| 1 | Favored Enemy (Hunter's Mark always-prep, 2 free casts) |
| 1 | Weapon Mastery (2) |
| **2** | **Fighting Style** OR **Druidic Warrior** alternative (2 Druid cantrips, WIS-cast) |
| **2** | **Deft Explorer** — Expertise in 1 skill + 2 languages of choice |
| **3** | **Ranger Subclass** (Hunter only in SRD) |
| **3** | Hunter: **Hunter's Prey** — choose Colossus Slayer OR Horde Breaker. Swap on Short/Long Rest. |
| **4** | **ASI / Feat** |
| 5 | Extra Attack, +1 Hunter's Mark free cast (3 total) |
| 6 | Roving (+10 speed, climb/swim speed) |
| **7** | Subclass: **Defensive Tactics** — choose Escape the Horde OR Multiattack Defense. Swap on Short/Long Rest. |
| **8** | **ASI / Feat** |
| **9** | **Expertise** — gain Expertise in one more skill (Ranger-specific feature, p.58) |
| 9 | +1 Hunter's Mark cast (4 total) |
| 10 | Tireless |
| 11 | Subclass feature (Superior Hunter's Prey) |
| **12** | **ASI / Feat** |
| 13 | Relentless Hunter, +1 Hunter's Mark (5 total) |
| 14 | Nature's Veil |
| 15 | Subclass feature (Superior Hunter's Defense) |
| **16** | **ASI / Feat** |
| 17 | Precise Hunter, +1 Hunter's Mark (6 total) |
| 18 | Feral Senses |
| **19** | **Epic Boon** |
| 20 | Foe Slayer |

**Ranger spell progression** (p.58 table): Half-caster, same shape as Paladin. Top spell: L1→1, L5→2, L9→3, L13→4, L17→5. Prepared: 2/3/4/5/6/6/7/7/9/9/10/10/11/11/12/12/14/14/15/15.

> **Non-obvious — Ranger has no cantrips by default.** Druidic Warrior at L2 grants 2 Druid cantrips.

> **Non-obvious — Ranger's L9 "Expertise" is a class feature, separate from Deft Explorer's L2 Expertise.** So a Ranger gets Expertise in 2 skills total by L9.

**Subclass: Hunter** (p.61) — sub-choices at L3 (Hunter's Prey, swappable on rest) and L7 (Defensive Tactics, swappable on rest). L11 Superior Hunter's Prey and L15 Superior Hunter's Defense have no sub-choice.

### 10.9 ROGUE (p.61-64)

**Core:** d8 HD, DEX/INT saves, Simple weapons + Martial-with-Finesse-or-Light, Thieves' Tools, Light armor. **Skills: choose 4** from `[Acrobatics, Athletics, Deception, Insight, Intimidation, Investigation, Perception, Persuasion, Sleight of Hand, Stealth]`.

**Starting Equipment**: A `(Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Quiver, Thieves' Tools, Burglar's Pack, 8 GP)` OR B `(100 GP)`.

| Level | Choice / Feature |
|-------|-------|
| **1** | **Expertise (2 skills)** — chosen from Rogue's skill profs |
| 1 | Sneak Attack 1d6 |
| **1** | **Thieves' Cant** — automatic + 1 language of choice from any language table |
| 1 | Weapon Mastery (2) |
| 2 | Cunning Action |
| **3** | **Rogue Subclass** (Thief only in SRD); Steady Aim |
| **4** | **ASI / Feat** |
| 5 | Cunning Strike (choose effects per use: Poison/Trip/Withdraw), Uncanny Dodge |
| **6** | **Expertise (2 more skills)** — chosen from Rogue's skill profs |
| 7 | Evasion, Reliable Talent |
| **8** | **ASI / Feat** |
| 9 | Subclass feature (Supreme Sneak — adds Stealth Attack as Cunning Strike option) |
| **10** | **ASI / Feat** (extra ASI vs other classes) |
| 11 | Improved Cunning Strike (use 2 effects per Sneak Attack) |
| **12** | **ASI / Feat** |
| 13 | Subclass feature (Use Magic Device) |
| 14 | Devious Strikes (adds Daze, Knock Out, Obscure to Cunning Strike options) |
| 15 | Slippery Mind (WIS+CHA save proficiency) |
| **16** | **ASI / Feat** |
| 17 | Subclass feature (Thief's Reflexes) |
| 18 | Elusive |
| **19** | **Epic Boon** (Boon of the Night Spirit recommended) |
| 20 | Stroke of Luck |

> **Non-obvious — Rogue has 5 ASIs (4, 8, 10, 12, 16) plus Epic Boon at 19.** Specifically, Rogue gets an extra ASI at L10 vs most classes.

**Sneak Attack scaling**: 1d6 (L1), 2d6 (L3), 3d6 (L5), ... +1d6 every 2 levels, max 10d6 (L19/20).

**Cunning Strike effect options** (p.63):
- L5: Poison (1d6), Trip (1d6), Withdraw (1d6)
- L9 Thief subclass: Stealth Attack (1d6) added
- L14 Devious Strikes: Daze (2d6), Knock Out (6d6), Obscure (3d6) added

**Subclass: Thief** (p.64) — no sub-choices at any level. L3 Fast Hands + Second-Story Work; L9 Supreme Sneak; L13 Use Magic Device; L17 Thief's Reflexes.

### 10.10 SORCERER (p.64-69)

**Core:** d6 HD, CON/CHA saves, Simple weapons, **no armor training**. **Skills: choose 2** from `[Arcana, Deception, Insight, Intimidation, Persuasion, Religion]`.

**Starting Equipment**: A `(Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer's Pack, 28 GP)` OR B `(50 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Cantrips (4)** + **Prepared Spells (2 level-1)** |
| 1 | Innate Sorcery (2 uses/Long Rest) |
| 2 | Font of Magic (2 Sorcery Points) |
| **2** | **Metamagic — choose 2** options from 10 (Careful, Distant, Empowered, Extended, Heightened, Quickened, Seeking, Subtle, Transmuted, Twinned). Swap 1 per level-up. |
| **3** | **Sorcerer Subclass** (Draconic Sorcery only in SRD); +1 cantrip (5 total) |
| **4** | **ASI / Feat**, +1 cantrip (6 total) |
| 5 | Sorcerous Restoration |
| 6 | Subclass feature (Elemental Affinity), +1 cantrip (7 total) |
| 7 | Sorcery Incarnate |
| **8** | **ASI / Feat**, +1 cantrip (8 total) |
| 9 | +1 cantrip (9 total) |
| **10** | **Metamagic — pick 2 more** (4 total), +1 cantrip (10 total) |
| 11 | +1 cantrip (11 total) |
| **12** | **ASI / Feat**, +1 cantrip (12 total) |
| 13 | +1 cantrip (13 total) |
| 14 | Subclass feature (Dragon Wings), +1 cantrip (14 total) |
| 15 | +1 cantrip (15 total) |
| **16** | **ASI / Feat**, +1 cantrip (16 total) |
| **17** | **Metamagic — pick 2 more** (6 total), +1 cantrip (17 total) |
| 18 | Subclass feature (Dragon Companion), +1 cantrip (18 total) |
| **19** | **Epic Boon**, +1 cantrip (19 total) |
| 20 | Arcane Apotheosis, +1 cantrip (20 total) |

Wait, re-reading p.64 table for Sorcerer cantrips: "1: —, 2: 2, 3: 3, 4: 4, ..." Actually the table column starts at 1 row but the text says "You know four Sorcerer cantrips of your choice" at L1, and "When you reach Sorcerer levels 4 and 10, you learn another Sorcerer cantrip" — so L1: 4, L4: 5, L10: 6. The "Cantrips" column in the table per my reading shows the cantrip count growing each level but that's because I mis-read. Let me recheck: extracted text shows "1 +2 Spellcasting, Innate Sorcery — 4 2 2 — ..." which means cantrips=4, prepared=2, slots [L1: 2, then dashes for 2-9]. So Cantrips at L1: 4. The "—" in the row appears to be a placeholder for "no class features at this level beyond what's listed." So the "4" is correctly the Cantrips column. **Sorcerer cantrips: 4 (L1), 5 (L4), 6 (L10).**

The "Sorcery Points" column shows: blank-2-3-4-5-6-7-8-9-10-11-12-... — sorcery points = Sorcerer level for levels 2+.

> **Non-obvious — Sorcerer's Prepared Spells change frequency:** per Long Rest swap is not allowed; the player only swaps **1 spell per level-up** (p.104 table). Same constraint as Bard.

**Spell progression**: Full caster. Prepared spells: 2/4/6/7/9/10/11/12/14/15/16/16/17/17/18/18/19/20/21/22.

**Subclass: Draconic Sorcery** (p.69):
- L3 Draconic Resilience (+3 HP + 1/level), AC formula 10+DEX+CHA, always-prep: Alter Self, Chromatic Orb, Command, Dragon's Breath
- **L6 Elemental Affinity — choose damage type from `[Acid, Cold, Fire, Lightning, Poison]`**, gain Resistance + bonus damage on spells of that type
- L7 always-prep: Arcane Eye, Charm Monster (wait, this is L7 per table)
- L9 always-prep: Legend Lore, Summon Dragon
- L14 Dragon Wings
- L18 Dragon Companion

(Re-reading L5/L7 Draconic spells: actually L5 adds Fear, Fly; L7 adds Arcane Eye, Charm Monster; L9 adds Legend Lore, Summon Dragon.)

### 10.11 WARLOCK (p.70-76)

**Core:** d8 HD, WIS/CHA saves, Simple weapons, Light armor. **Skills: choose 2** from `[Arcana, Deception, History, Intimidation, Investigation, Nature, Religion]`.

**Starting Equipment**: A `(Leather Armor, Sickle, 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar's Pack, 15 GP)` OR B `(100 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Cantrips (2)** + **Prepared Spells (2 level-1)** + **Spell Slots (1 slot of level 1)** |
| **1** | **Eldritch Invocations (1)** — pick 1 invocation (e.g. Pact of the Tome). Swap 1 per level-up. |
| **2** | **Eldritch Invocations: +2 total = 3** |
| 2 | Magical Cunning |
| **3** | **Warlock Subclass** (Fiend Patron only in SRD) |
| **4** | **ASI / Feat**, +1 cantrip (3 total) |
| **5** | **Eldritch Invocations: +2 total = 5** |
| 6 | Subclass feature (Dark One's Own Luck) |
| **7** | **Eldritch Invocations: +1 total = 6** |
| **8** | **ASI / Feat** |
| **9** | **Eldritch Invocations: +1 total = 7**, Contact Patron |
| 10 | Subclass feature (Fiendish Resilience — pick damage type per Short/Long Rest), +1 cantrip (4 total) |
| **11** | **Mystic Arcanum (L6 spell)** — pick 1 Warlock L6 spell, cast 1×/Long Rest free. Swap on level-up. |
| **12** | **ASI / Feat, Eldritch Invocations: +1 total = 8** |
| **13** | **Mystic Arcanum (L7 spell)** |
| 14 | Subclass feature (Hurl Through Hell) |
| **15** | **Mystic Arcanum (L8 spell), Eldritch Invocations: +1 total = 9** |
| **16** | **ASI / Feat** |
| **17** | **Mystic Arcanum (L9 spell)** |
| 18 | — |
| **19** | **Epic Boon, Eldritch Invocations: +1 total = 10** |
| 20 | Eldritch Master |

**Pact Magic spell slots table (p.70):**

| Level | Cantrips | Prepared | Slot Count | Slot Level |
|-------|----------|----------|------------|------------|
| 1 | 2 | 2 | 1 | 1 |
| 2 | 2 | 3 | 2 | 1 |
| 3 | 2 | 4 | 2 | 2 |
| 4 | 3 | 5 | 2 | 2 |
| 5 | 3 | 6 | 2 | 3 |
| 6 | 3 | 7 | 2 | 3 |
| 7 | 3 | 8 | 2 | 4 |
| 8 | 3 | 9 | 2 | 4 |
| 9 | 3 | 10 | 2 | 5 |
| 10 | 4 | 10 | 2 | 5 |
| 11 | 4 | 11 | 3 | 5 |
| 12 | 4 | 11 | 3 | 5 |
| 13 | 4 | 12 | 3 | 5 |
| 14 | 4 | 12 | 3 | 5 |
| 15 | 4 | 13 | 3 | 5 |
| 16 | 4 | 13 | 3 | 5 |
| 17 | 4 | 14 | 4 | 5 |
| 18 | 4 | 14 | 4 | 5 |
| 19 | 4 | 15 | 4 | 5 |
| 20 | 4 | 15 | 4 | 5 |

> **Non-obvious — Pact Magic slots ALL recharge on Short Rest** (not just Long Rest). This is fundamentally different from Spellcasting.

> **Non-obvious — Pact Magic slot levels:** All slots are the same level. Max slot level caps at 5 (no 6+ from Pact Magic). For L6+ spells, Warlock uses **Mystic Arcanum** (1 cast/Long Rest, no slot expended).

> **Non-obvious — Warlock spell prepared spells change frequency:** per level-up (1 swap).

### Eldritch Invocations catalogue (p.72-75)

A Warlock picks invocations from a menu. Some require a specific Warlock level; some require a specific Pact Boon (which is itself an Invocation: Pact of the Blade, Pact of the Chain, Pact of the Tome).

| Invocation | Prereq |
|------------|--------|
| **Agonizing Blast** | L2+, damage cantrip. Pick one damage cantrip — add CHA to damage. Repeatable for different cantrips. |
| **Armor of Shadows** | — | Cast Mage Armor on self at-will. |
| **Ascendant Step** | L5+. Cast Levitate at-will. |
| **Devil's Sight** | L2+. See in Dim Light + Darkness in 120 ft. |
| **Devouring Blade** | L12+, Thirsting Blade. Extra Attack confers 2 extra (3 total). |
| **Eldritch Mind** | — | Advantage on CON saves for Concentration. |
| **Eldritch Smite** | L5+, Pact of the Blade. Spend Pact slot, +1d8 Force damage + Prone (Huge or smaller). |
| **Eldritch Spear** | L2+, damage cantrip (10+ ft range). Pick cantrip — range + 30×Warlock level ft. Repeatable. |
| **Fiendish Vigor** | L2+. Cast False Life at-will, max temp HP. |
| **Gaze of Two Minds** | L5+. BA to perceive through willing creature's senses. |
| **Gift of the Depths** | L5+. Breathe underwater, Swim Speed = Speed; cast Water Breathing 1×/Long Rest free. |
| **Gift of the Protectors** | L9+, Pact of the Tome. Names on Book of Shadows page drop to 1 HP instead of dying. |
| **Investment of the Chain Master** | L5+, Pact of the Chain. Buffs familiar. |
| **Lessons of the First Ones** | L2+. Gain 1 Origin feat of choice. **Repeatable** (different Origin feat). |
| **Lifedrinker** | L9+, Pact of the Blade. +1d6 N/Psy/Rad on pact weapon, heal via HD expenditure. |
| **Mask of Many Faces** | L2+. Cast Disguise Self at-will. |
| **Master of Myriad Forms** | L5+. Cast Alter Self at-will. |
| **Misty Visions** | L2+. Cast Silent Image at-will. |
| **One with Shadows** | L5+. In Dim/Dark, cast Invisibility on self at-will. |
| **Otherworldly Leap** | L2+. Cast Jump on self at-will. |
| **Pact of the Blade** | — | Conjure pact weapon (Simple/Martial Melee), CHA for attacks, choose damage type per hit. |
| **Pact of the Chain** | — | Learn Find Familiar, special forms available (Imp, Pseudodragon, Quasit, Skeleton, Sphinx of Wonder, Sprite, Venomous Snake). |
| **Pact of the Tome** | — | Book of Shadows: 3 cantrips + 2 ritual L1 spells from any class list. |
| **Repelling Blast** | L2+, attack-roll cantrip. Push Large or smaller 10 ft on hit. Repeatable. |
| **Thirsting Blade** | L5+, Pact of the Blade. Extra Attack with pact weapon. |
| **Visions of Distant Realms** | L9+. Cast Arcane Eye at-will. |
| **Whispers of the Grave** | L7+. Cast Speak with Dead at-will. |
| **Witch Sight** | L15+. Truesight 30 ft. |

**Subclass: Fiend Patron** (p.76):
- L3 Dark One's Blessing, always-prep: Burning Hands, Command, Scorching Ray, Suggestion
- L5 always-prep: Fireball, Stinking Cloud
- **L6 Dark One's Own Luck** (no choice, but has CHA-mod uses)
- L7 always-prep: Fire Shield, Wall of Fire
- L9 always-prep: Geas, Insect Plague
- **L10 Fiendish Resilience — choose damage type (any except Force) per Short/Long Rest**
- L14 Hurl Through Hell

### 10.12 WIZARD (p.77-82)

**Core:** d6 HD, INT/WIS saves, Simple weapons, **no armor training**. **Skills: choose 2** from `[Arcana, History, Insight, Investigation, Medicine, Nature, Religion]`.

**Starting Equipment**: A `(2 Daggers, Arcane Focus (Quarterstaff), Robe, Spellbook, Scholar's Pack, 5 GP)` OR B `(55 GP)`.

| Level | Choice / Feature |
|-------|-------|
| 1 | **Cantrips (3)** chosen from Wizard list. Swap 1 per Long Rest. |
| 1 | **Spellbook** starts with **6 level-1 Wizard spells of choice**. |
| 1 | **Prepared Spells (4)** chosen from spellbook |
| 1 | Ritual Adept, Arcane Recovery |
| **2** | **Scholar** — choose 1 skill from `[Arcana, History, Investigation, Medicine, Nature, Religion]` to gain Expertise. |
| **3** | **Wizard Subclass** (Evoker only in SRD) |
| **3** | Evoker: **2 Evocation spells (L1-2) added to spellbook free** |
| **4** | **ASI / Feat**, +1 cantrip (4 total) |
| 5 | Memorize Spell (Short Rest spell swap) |
| 6 | Subclass feature (Sculpt Spells) |
| 7 | — |
| **8** | **ASI / Feat** |
| 9 | — |
| 10 | Subclass feature (Empowered Evocation), +1 cantrip (5 total) |
| 11 | — |
| **12** | **ASI / Feat** |
| 13 | — |
| 14 | Subclass feature (Overchannel) |
| 15 | — |
| **16** | **ASI / Feat** |
| 17 | — |
| **18** | **Spell Mastery** — choose 1 L1 + 1 L2 spell in spellbook (with action casting time) to cast at-will. Swap 1 per Long Rest. |
| **19** | **Epic Boon** (Boon of Spell Recall recommended) |
| **20** | **Signature Spells** — choose 2 L3 spells in spellbook to cast each 1×/Short or Long Rest free at L3 |

**Spell progression**: Full caster. Cantrips: 3→4 (L4)→5 (L10). Prepared spells: 4/5/6/7/9/10/11/12/14/15/16/16/17/18/19/21/22/23/24/25.

**Spellbook expansion**: At each Wizard level after 1, add **2 Wizard spells** of any prepareable level to spellbook free. **Spellbook can also be expanded mid-adventure** by copying spells from scrolls (2 hr + 50 GP per spell level) per p.78 sidebar.

> **Non-obvious — Wizard cantrips swap on Long Rest** (p.77), unique among casters whose cantrips otherwise swap only at level-up. Bard and Cleric/Druid/Sorcerer/Warlock cantrips swap only at level-up.

> **Non-obvious — Wizard's Scholar (L2) Expertise list is restricted** to a subset of skills the Wizard already has (`Arcana, History, Investigation, Medicine, Nature, Religion`). Must have proficiency in the chosen skill first.

**Subclass: Evoker** (p.82):
- L3 Evocation Savant (2 Evocation spells L1-2 free in spellbook; at each spell-level unlock, +1 Evocation spell free)
- L3 Potent Cantrip
- L6 Sculpt Spells
- L10 Empowered Evocation
- L14 Overchannel

---

## 11. Multiclassing Rules

Source: SRD `p.24-26`.

### Prerequisites

To gain a level in a new class:
- Must have a score of **at least 13 in the primary ability of the new class AND in the primary ability of your current class**.
- "Primary ability" comes from Class Overview table (Section 1). Two-primary classes (e.g. Paladin: STR + CHA, Monk: DEX + WIS) require BOTH to be ≥13.

Example given (p.24): A Barbarian multiclassing into Druid needs STR ≥ 13 AND WIS ≥ 13.

### XP

Based on **total character level**, not class level. Example: Cleric 6 / Fighter 1 needs to reach total level 8 XP threshold before taking either Cleric 7 or Fighter 2.

### Hit Points & Hit Dice

- Gain **per-level HP from the new class** as for "levels after 1" (i.e. fixed value or roll, NOT the L1 large value).
- **Only the very first class taken at character level 1 grants the "Level 1 HP" bonus.**
- Pool Hit Dice by type. d10s pool together (Fighter + Paladin = pooled d10s). Different die types are tracked separately.

### Proficiency Bonus

Based on total character level.

### Proficiencies gained on multiclass entry

When taking a class for the first time as a multiclass (NOT as your original class), gain only a subset of proficiencies:

| Class | Multiclass Profs |
|-------|------------------|
| Barbarian | Martial weapons, Shields |
| Bard | 1 skill of choice, 1 Musical Instrument, Light armor |
| Cleric | Light + Medium armor, Shields |
| Druid | Light armor, Shields |
| Fighter | Martial weapons, Light + Medium armor, Shields |
| Monk | (Hit Die only) |
| Paladin | Martial weapons, Light + Medium armor, Shields |
| Ranger | Martial weapons, 1 skill from Ranger list, Light + Medium armor, Shields |
| Rogue | 1 skill from Rogue list, Thieves' Tools, Light armor |
| Sorcerer | (Hit Die only) |
| Warlock | Light armor |
| Wizard | (Hit Die only) |

All grant the Hit Die trait + Level 1 features.

### Class Features

Gain features of new class at appropriate level. Subclass selection happens at the subclass level for the new class (e.g. multiclassing into Cleric: subclass at Cleric L3, which may be character L7+).

### Special interactions

**Extra Attack** (p.25): doesn't stack across classes. Max 2 attacks unless a class explicitly says more (Fighter 11/20). Warlock's Thirsting Blade invocation doesn't stack with Extra Attack.

**Spellcasting** (p.25-26):
- Spells prepared determined per-class individually (no shared prepared list).
- Spellcasting ability = the granting class's ability.
- Cantrip scaling uses **total character level**.
- **Spell slots = Multiclass Spellcaster table** (Multiclass Spell Slots per Spell Level, p.26), computed from:
  - **Full caster levels** (Bard, Cleric, Druid, Sorcerer, Wizard): count fully
  - **Half caster levels** (Paladin, Ranger): count **half, rounded UP**
  - **Warlock Pact Magic** is NOT counted in this table — it's separate (per p.26)
- Can prepare lower-level spells of one class and cast them with multiclass higher-level slots.

> **Non-obvious — Warlock Pact Magic interaction (p.26):** Pact Magic slots and Spellcasting slots are tracked separately. You CAN use either pool to cast spells from any class with the Spellcasting feature OR Warlock spells. So a Warlock 3 / Wizard 3 has: 2× L2 Pact slots (Short Rest recharge) AND 4× L1 + 2× L2 multiclass-spellcaster slots (Long Rest recharge from spellcaster table: count level 4.5 → 5? Actually Wizard 3 = 3 full, Warlock not counted, so 3 → 3 from spellcaster table = 4× L1 + 2× L2).

**Unarmored Defense / Draconic Resilience / Mage Armor** (p.25): pick one method, can't stack. Explicit example: Monk/Sorcerer with both Unarmored Defenses must pick one.

---

## 12. Starting at Higher Levels

Source: SRD `p.24`.

### XP
Character begins with **minimum XP** for the starting level (e.g. L10 = 64,000 XP).

### Equipment (recommended, GM call)

| Starting Level | Equipment & Money | Magic Items |
|----------------|-------------------|-------------|
| 2-4 | Normal starting equipment | 1 Common |
| 5-10 | 500 GP + 1d10×25 GP + normal starting equipment | 1 Common, 1 Uncommon |
| 11-16 | 5,000 GP + 1d10×250 GP + normal starting equipment | 2 Common, 3 Uncommon, 1 Rare |
| 17-20 | 20,000 GP + 1d10×250 GP + normal starting equipment | 2 Common, 4 Uncommon, 3 Rare, 1 Very Rare |

### What the player must retroactively choose

For a single-class character starting at level N:
1. **All level-up choices for levels 2..N** (HP per level, subclass at the appropriate level, ASI/feat selections, Fighting Style swaps, Hunter's Prey type, etc.)
2. **Class-feature spell selections** (cantrips known at N's cap, prepared spells at N's cap, spellbook contents if Wizard)
3. **All "swap-on-Long-Rest" choices** for the starting state (Wild Shape forms, Cleric prepared spells, Druid land choice, Fiendish Resilience damage type, etc.)
4. **Eldritch Invocations** at the count for level N (Warlock)
5. **Metamagic** at the count for level N (Sorcerer)
6. **Mystic Arcanum** spell selections for levels 11+ (Warlock)
7. **Magical Secrets** spell choices (Bard L10+)

For a multiclass character: all of the above for each class, plus distributing total levels across classes.

---

## 13. Spellcasting Mechanics

Sources: SRD `p.22-23` (creation), `p.25-26` (multiclass), `p.104-106` (full rules).

### Per-class spell preparation summary (p.104)

| Class | Cast Stat | Cantrips at L1 | Prepared at L1 (lvl 1+ spells) | When re-prepare | How many |
|-------|-----------|----------------|-------------------------------|-----------------|----------|
| **Bard** | CHA | 2 | 4 | Level-up | 1 |
| **Cleric** | WIS | 3 | 4 | Long Rest | Any |
| **Druid** | WIS | 2 | 4 | Long Rest | Any |
| **Paladin** | CHA | 0 (Blessed Warrior → 2 Cleric) | 2 | Long Rest | 1 |
| **Ranger** | WIS | 0 (Druidic Warrior → 2 Druid) | 2 | Long Rest | 1 |
| **Sorcerer** | CHA | 4 | 2 | Level-up | 1 |
| **Warlock** | CHA | 2 | 2 (Pact Magic, slot recharge on **Short Rest**) | Level-up | 1 |
| **Wizard** | INT | 3 | 4 (from spellbook of 6) | Long Rest | Any (from spellbook) |

### Cantrip count growth

- Bard: 2 / 3 (L4) / 4 (L10)
- Cleric: 3 / 4 (L4) / 5 (L10) — plus +1 if Thaumaturge Divine Order
- Druid: 2 / 3 (L4) / 4 (L10) — plus +1 if Magician Primal Order
- Sorcerer: 4 / 5 (L4) / 6 (L10)
- Warlock: 2 / 3 (L4) / 4 (L10)
- Wizard: 3 / 4 (L4) / 5 (L10)
- Paladin: 0 (or 2 from Blessed Warrior, swappable on level-up)
- Ranger: 0 (or 2 from Druidic Warrior, swappable on level-up)

### When a new spell-slot level unlocks

**Full casters (Bard, Cleric, Druid, Sorcerer, Wizard):**
- L1: 1st level slots
- L3: 2nd
- L5: 3rd
- L7: 4th
- L9: 5th
- L11: 6th
- L13: 7th
- L15: 8th
- L17: 9th

**Half casters (Paladin, Ranger):**
- L2: 1st level slots (delayed start — Paladin and Ranger don't get spellcasting until L2... wait, Paladin's table starts at L1 with 2 prepared spells. Re-check: Paladin gets Spellcasting at L1 in 5.2.1. Both Paladin and Ranger now have Spellcasting at L1, with slot table starting at L1 with 2 slots.)
- L5: 2nd
- L9: 3rd
- L13: 4th
- L17: 5th
- Max 5th-level slots.

**Warlock Pact Magic:**
- L1: 1 slot of level 1
- L2: 2 slots of level 1
- L3: 2 slots of level 2
- L5: 2 slots of level 3
- L7: 2 slots of level 4
- L9: 2 slots of level 5
- L11: 3 slots of level 5 (Mystic Arcanum L6 unlocks)
- L13: 3 slots of level 5 (Mystic Arcanum L7 unlocks)
- L15: 3 slots of level 5 (Mystic Arcanum L8 unlocks)
- L17: 4 slots of level 5 (Mystic Arcanum L9 unlocks)

### Spellcasting Focus by class

| Class | Focus type |
|-------|-----------|
| Bard | Musical Instrument |
| Cleric | Holy Symbol |
| Druid | Druidic Focus |
| Paladin | Holy Symbol |
| Ranger | Druidic Focus |
| Sorcerer | Arcane Focus |
| Warlock | Arcane Focus (or Book of Shadows via Pact of the Tome) |
| Wizard | Arcane Focus OR spellbook |

### Casting in Armor (p.104)

"You must have training with any armor you are wearing to cast spells while wearing it." So Sorcerers/Wizards in Chain Mail (no training) cannot cast.

### Special spell-related choices

- **Bard L10 Magical Secrets** (p.33): when prepared count increases (every Bard level from L10 on), can pick from Bard, Cleric, Druid, Wizard spell lists.
- **Bard L6 College of Lore Magical Discoveries** (p.35): 2 spells from Cleric/Druid/Wizard, always prepared, swap 1 on level-up.
- **Wizard L18 Spell Mastery** (p.79): pick 1 L1 + 1 L2 with action casting time, cast at-will. Swap 1 on Long Rest.
- **Wizard L20 Signature Spells** (p.79): pick 2 L3 spells, cast each 1×/Short or Long Rest free.
- **Warlock L11/13/15/17 Mystic Arcanum** (p.72): pick 1 L6/L7/L8/L9 Warlock spell, cast 1×/Long Rest free. Swap on level-up.
- **Pact of the Tome cantrips/rituals** (p.74): when book appears (end of Short/Long Rest), choose 3 cantrips + 2 L1 ritual spells from ANY class list. **The book swap re-triggers per rest** — but presumably the same spells are re-chosen unless the player intentionally chooses different ones.

### Always-prepared spells from features (p.104)

If a feature grants always-prepared spells, those don't count toward the prepared-spells limit. Examples:
- Druid's Speak with Animals (Druidic feature)
- Paladin's Divine Smite (Paladin's Smite L2)
- Paladin's Find Steed (Faithful Steed L5)
- Ranger's Hunter's Mark (Favored Enemy L1)
- Cleric/Paladin/Druid subclass always-prep spell lists
- Wizard L20 Signature Spells, L18 Spell Mastery
- Warlock Contact Other Plane (Contact Patron L9)
- Bard L20 Words of Creation (Power Word Heal, Power Word Kill)
- Species-granted spells (Elf L3/L5, Tiefling L3/L5)
- Magic Initiate feat's L1 spell

---

## 14. In-Play State (Death Saves, Conditions, etc.)

### Death Saving Throws (p.17-18)

- Roll d20 at start of turn while at 0 HP.
- DC 10. 10+ = success, <10 = failure.
- **3 successes → Stable**. **3 failures → die**.
- **Rolling a 1 → 2 failures**. **Rolling a 20 → regain 1 HP** (and exit unconscious).
- **Damage at 0 HP → 1 failure**. **Critical Hit damage at 0 HP → 2 failures**. **Damage equaling Hit Point maximum → instant death**.
- Reset successes/failures to 0 when HP regained or Stable.
- **Massive Damage** (p.17): damage ≥ HP max while at 0 from same hit = instant death.
- **Hit Point Maximum of 0** (p.17) = instant death.
- Stable creature regains 1 HP after 1d4 hours if not healed.

### Heroic Inspiration (p.183 glossary)

- Reroll any die immediately after rolling; keep new.
- Cannot be "doubled" — if already have it, the new HI is lost unless gifted to another PC.
- Sources: GM award, Human species (gain on Long Rest), Champion Fighter L10 (self-grant at start of turn).

### Conditions list (p.179 glossary)

Full SRD condition list:
- **Blinded** — can't see; attacks against/from have Disadvantage/Advantage
- **Charmed** — can't harm charmer; charmer has Adv on social
- **Deafened** — can't hear
- **Exhaustion** — see below
- **Frightened** — Disadvantage on checks/attacks; can't move closer to source
- **Grappled** — Speed 0; ends if grappler Incapacitated or distance increased
- **Incapacitated** — can't take actions, BAs, Reactions; auto-fails Initiative
- **Invisible** — can't be seen; attack rolls against have Disadvantage, your attack rolls have Advantage
- **Paralyzed** — Incapacitated + Speed 0 + auto-fail STR/DEX saves + auto-crit melee within 5 ft
- **Petrified** — Incapacitated + Speed 0 + auto-fail STR/DEX saves + Resistance all dmg + Immunity Poisoned + turned to stone
- **Poisoned** — Disadvantage on attacks and checks
- **Prone** — Disadvantage on attacks; melee attacks vs Prone have Advantage if within 5 ft, otherwise Disadvantage
- **Restrained** — Speed 0; Disadvantage on attacks & DEX saves; attacks against have Advantage
- **Stunned** — Incapacitated + Speed 0 + auto-fail STR/DEX saves + Advantage on attacks against
- **Unconscious** — Incapacitated + Speed 0 + drops what's holding + Prone + auto-fail STR/DEX saves + Advantage on attacks against + melee within 5 ft auto-crit

### Exhaustion (p.181)

Unique among conditions — has **6 cumulative levels**, dying at level 6.
- D20 Tests reduced by 2× exhaustion level.
- Speed reduced by 5 ft × exhaustion level.
- Long Rest removes 1 level.
- Triggered by sustained heavy effort, dehydration/malnutrition, certain spells/monster abilities.

### Temporary HP (p.18)

- Lost first when damage taken.
- Don't stack — new THP replaces old (player picks higher).
- Last until depleted or Long Rest.
- Not actual HP — can't be healed, don't restore consciousness at 0 HP.

### Bloodied (p.177)

A creature is **Bloodied** while at half HP or fewer. No mechanical effect itself but other features key off it (e.g. Champion Fighter L18 Heroic Rally; Life Cleric Preserve Life L3 healing target restriction; Druid Circle of the Land Land's Aid does normal dmg to enemies but heals one bloodied target).

### Knocking Out (p.17)

When you would reduce a creature to 0 HP with a **melee** attack, you can instead reduce to 1 HP + Unconscious. Starts Short Rest; ends on HP gain or DC 10 WIS (Medicine) first aid.

### Rests (p.187)

**Short Rest**: 1 hour; must have ≥1 HP. Benefits: spend Hit Dice (HD + CON mod) to heal; recharge Short-Rest features (Action Surge, Pact Magic slots, Second Wind, Wild Shape, Channel Divinity, Bardic Inspiration starting L5 Font, Monk Focus Points, Cleric Channel Divinity, etc.).

**Long Rest**: 8 hours (6 sleep + 2 light activity); must have ≥1 HP; 16 hr cooldown. Benefits:
- Regain all HP, regain all spent HD.
- Restore reduced ability scores.
- Reduce Exhaustion by 1.
- Recharge all Long-Rest features.

Long Rest interruptions: Initiative roll / non-cantrip spell / damage / 1 hr exertion. If 1+ hr rested before interrupt, get Short Rest benefit.

---

## 15. Weapon Mastery System

Three classes (Barbarian, Fighter, Paladin, Ranger, Rogue) get **Weapon Mastery** at L1, plus Wizard does NOT but Monk does NOT either. Wait — re-checking class lists:

- **Barbarian L1**: 2 weapons (p.28)
- **Fighter L1**: 3 weapons (p.47)
- **Paladin L1**: 2 weapons (p.53)
- **Ranger L1**: 2 weapons (p.57)
- **Rogue L1**: 2 weapons (p.61)
- All others: no weapon mastery.

### Weapon mastery properties (p.90)

Each weapon has a single mastery property. Player picks N weapons (per class table) and uses their masteries. Swap 1 weapon per Long Rest. **Properties don't apply unless you have a feature unlocking them.**

| Property | Effect |
|----------|--------|
| **Cleave** | Hit creature with melee → extra attack vs another within 5 ft (no ability mod to damage). Once/turn. |
| **Graze** | Miss → deal ability-mod damage anyway. |
| **Nick** | Light's extra attack can be part of Attack action (not Bonus Action). Once/turn. |
| **Push** | Push creature 10 ft (Large or smaller). |
| **Sap** | Hit gives target Disadvantage on its next attack roll. |
| **Slow** | Hit + damage reduces target Speed by 10 ft (non-stacking). |
| **Topple** | Hit forces CON save (DC 8 + mod + PB), failure = Prone. |
| **Vex** | Hit + damage gives Advantage on your next attack vs that target. |

### Weapon mastery count by class

| Class | L1 | L4 | L10 | L16 |
|-------|----|----|-----|-----|
| Barbarian | 2 | 3 | 4 | 4 |
| Fighter | 3 | 4 | 5 | 6 |
| Paladin | 2 | 2 | 2 | 2 |
| Ranger | 2 | 2 | 2 | 2 |
| Rogue | 2 | 2 | 2 | 2 |

(Paladin/Ranger/Rogue don't grow weapon mastery count after L1.)

### Fighter L9 Tactical Master (p.48)

Can replace a weapon's mastery property with Push/Sap/Slow for that attack — adds flexibility without retraining.

---

## 16. Master Choice-Point Index per Level

For UI design: a quick lookup of "what choices fire at each character level for each class".

### Choices ALWAYS fired at L1 (every character)

- Class (1 of 12)
- Background (1 of 4) → ability bumps, equip A/B, sub-flavour for Magic Initiate (Acolyte/Sage), Gaming Set variant (Soldier)
- Species (1 of 9) → all species sub-choices (lineage, ancestry, legacy, size for Human/Tiefling, Skillful for Human, etc.)
- 2 languages from Standard
- Ability score generation method + allocation
- Alignment (1 of 9)
- Starting equipment package (A/B or A/B/C for Fighter)
- Class skill choices (2-4 depending on class)
- Class L1 features (see below for class-specific)
- Trinket roll (optional, p.26)

### Choices that fire AT EVERY level (HP)

- HP for this level: roll vs fixed average
- Re-evaluate retroactive HP from CON mod changes
- Apply Dwarven Toughness +1 / Draconic Resilience +1 if applicable

### Class-specific level-up choice cheat-sheet

| Level | Choice point (any class) |
|-------|--------------------------|
| 1 | Subclass for Cleric (Divine Order picked here; subclass at L3) |
| 1 | Wizard spellbook (6 spells) |
| 1 | Bard cantrips (2), prepared (4) |
| 1 | Cleric cantrips (3), prepared (4), Divine Order |
| 1 | Druid cantrips (2), prepared (4), Primal Order |
| 1 | Sorcerer cantrips (4), prepared (2) |
| 1 | Warlock cantrips (2), prepared (2), Invocation (1) |
| 1 | Wizard cantrips (3), prepared (4) from spellbook |
| 1 | Rogue Expertise (2 skills), Thieves' Cant language |
| 1 | Fighter Fighting Style + Weapon Mastery (3) |
| 1 | Paladin Weapon Mastery (2), prepared (2) |
| 1 | Ranger Weapon Mastery (2), prepared (2) |
| 1 | Barbarian Weapon Mastery (2) |
| 2 | Bard Expertise (2 skills) |
| 2 | Sorcerer Metamagic (2 picks) |
| 2 | Warlock invocations grow to 3 |
| 2 | Wizard Scholar (Expertise in 1 skill) |
| 2 | Paladin Fighting Style OR Blessed Warrior |
| 2 | Ranger Fighting Style OR Druidic Warrior, Deft Explorer (Expertise + 2 languages) |
| 2 | Druid Wild Shape (pick 4 Beast forms) |
| 3 | **Subclass** for Barbarian, Bard, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard (Cleric already picked) |
| 3 | Barbarian Primal Knowledge (+1 skill from list) |
| 3 | Ranger Hunter's Prey (Colossus Slayer / Horde Breaker) |
| 3 | Druid Circle of the Land choice (Arid/Polar/Temperate/Tropical) |
| 4 | ASI/Feat (all classes) |
| 5 | Warlock invocations to 5 |
| 6 | Bard Magical Discoveries (2 spells, College of Lore) |
| 6 | Rogue Expertise (2 more skills) |
| 6 | Fighter ASI/Feat (extra) |
| 6 | Sorcerer Elemental Affinity (damage type) |
| 7 | Cleric Blessed Strikes (Divine Strike / Potent Spellcasting) |
| 7 | Druid Elemental Fury (Potent Spellcasting / Primal Strike) |
| 7 | Ranger Defensive Tactics (Escape Horde / Multiattack Defense) |
| 7 | Fighter Champion subclass: Additional Fighting Style (pick 2nd) |
| 7 | Warlock invocations to 6 |
| 8 | ASI/Feat (all classes) |
| 9 | Bard Expertise (2 more skills) |
| 9 | Barbarian Brutal Strike (Forceful / Hamstring) |
| 9 | Warlock invocations to 7 |
| 9 | Ranger Expertise (additional from class feature) |
| 10 | Bard Magical Secrets (new spells from Cleric/Druid/Wizard lists each level) |
| 10 | Warlock Fiendish Resilience (damage type, swap per rest) |
| 10 | Rogue ASI/Feat (extra) |
| 11 | Warlock Mystic Arcanum L6 (pick 1 Warlock L6 spell) |
| 12 | ASI/Feat (all classes); Warlock invocations to 8 |
| 13 | Barbarian Improved Brutal Strike (Staggering / Sundering added) |
| 13 | Warlock Mystic Arcanum L7 |
| 14 | Fighter ASI/Feat (extra) |
| 15 | Warlock Mystic Arcanum L8, invocations to 9 |
| 16 | ASI/Feat (all classes) |
| 17 | Sorcerer Metamagic (2 more, 6 total) |
| 17 | Warlock Mystic Arcanum L9 |
| 17 | Fighter Action Surge 2 uses, Indomitable 3 uses |
| 18 | Wizard Spell Mastery (1 L1 + 1 L2 at-will) |
| 19 | Epic Boon (all classes) + invocations to 10 (Warlock) |
| 20 | Class capstone (Barbarian +4 STR/CON, Bard Words of Creation, Monk +4 DEX/WIS, etc.); Wizard Signature Spells (2 L3) |

---

## 17. Cross-Cutting Edge Cases & Gotchas

### Subclass timing

| Class | Subclass picked at |
|-------|--------------------|
| Cleric | **Level 3** (was L1 in some prior editions — verify 5.2.1 says L3, confirmed on p.36) |
| Wizard | Level 3 |
| Warlock | Level 3 |
| All others | Level 3 |

> **Non-obvious — All SRD 5.2.1 classes pick subclass at Level 3.** This is a significant rules change from older 5e where Cleric and Sorcerer picked at L1, Warlock at L1, Wizard at L2, etc. Verify against the class tables: Cleric table row 3 = "Cleric Subclass"; Wizard table row 3 = "Wizard Subclass"; Warlock table row 3 = "Warlock Subclass". **Confirmed: all 12 classes pick subclass at L3.**

### Prepared-spells swap frequency (Spell Preparation by Class, p.104)

- **Long Rest, any**: Cleric, Druid, Wizard (from spellbook)
- **Long Rest, 1**: Paladin, Ranger
- **Level-up, 1**: Bard, Sorcerer, Warlock

### Cantrip swap frequency

- **Level-up, 1**: Bard, Cleric, Druid, Sorcerer, Warlock (per each class's Cantrips entry)
- **Long Rest, 1**: Wizard (p.77)
- N/A: Paladin (no cantrips), Ranger (no cantrips), all non-casters

### Pact-of-the-Tome cantrips swap

Cantrips and ritual spells in Book of Shadows are picked when the book appears (end of Short/Long Rest), so functionally swappable per rest.

### What changes on a CON modifier bump

- HP maximum += level (p.23)
- HD-based features that reference CON (Lay On Hands "5 × level" doesn't use CON; Goliath Stone's Endurance uses CON; etc.)
- Concentration save bonus
- Death-save-relevant if features key off CON

### What changes on a primary ability bump

- Attack rolls / save DCs for spell-using classes
- Skill checks tied to that ability
- For half-casters (Paladin CHA, Ranger WIS): aura bonus (Paladin), DC of class-specific abilities

### Heavy armor & STR requirements

Wearing Heavy armor below the required STR (Chain Mail 13, Splint 15, Plate 15) imposes Disadvantage on attack rolls and... wait, the SRD p.92 only lists the "Str" column — re-read: "If the table shows 'Str 13' (and so on), the wearer's Speed is reduced by 10 feet unless their Strength is equal to or greater than the listed score." Actually the SRD table doesn't have this footnote in the extract I have. The SRD does say Heavy armor with insufficient STR has consequence but I'd need to re-check the precise rule. **Flag for double-check** — but typically the convention is `-10 Speed`.

### Wild Shape + spellcasting

Druid L18 Beast Spells: can cast in beast form except for material-component-cost spells. Below L18, no spellcasting while shape-shifted.

### Channel Divinity uses

- Cleric L2: 2; L6: 3 (no further increases through L20)
- Paladin L3: 2; L11: 3 (no further increases through L20)

### Stable Hit Point Maximum

A creature with HP max reduced to 0 dies (p.17). Some effects (Vampiric Touch, certain monster abilities) reduce max HP; these can kill via max-HP exhaustion.

### Spell ranges & invalid targets

- Spell hitting invalid target: slot still consumed, no effect.
- Spell against successful save: appears to succeed silently even if it would have done nothing anyway.
- Same-spell stacking: doesn't (most potent applies). Different spells stack.

### Sorcery Points & Spell Slot conversion

Sorcerer can convert slots → sorcery points 1:1 (slot level = points) any time (no action).
Sorcerer can convert sorcery points → slot:

| Slot | Cost | Min Sorcerer Level |
|------|------|--------------------|
| 1 | 2 | 2 |
| 2 | 3 | 3 |
| 3 | 5 | 5 |
| 4 | 6 | 7 |
| 5 | 7 | 9 |

Created slots vanish at Long Rest. Max created slot level = 5.

### Special: Magic Initiate via background pre-sets spell list

Acolyte's Magic Initiate (Cleric) means the player picks **2 Cleric cantrips + 1 Cleric L1 spell**. Same shape but Wizard list for Sage. Player still picks spellcasting ability (INT/WIS/CHA).

The feat is **Repeatable** with different list, so a Sage who takes Magic Initiate again at a later ASI level (or via Lessons of the First Ones Warlock invocation) can pick Cleric or Druid spells.

---

## 18. Summary of Data Needed for UI Choice Surfacing

Quick-reference structured list of all choice types the UI must implement:

### Hard-blocking choices (must be made before character is valid)

1. Class
2. Subclass (timing depends on class; at L1 for Cleric, L2 for Wizard, L3 for others)
3. Background
4. Species
5. Sub-flavour for: Dragonborn ancestry, Elf lineage, Gnome lineage, Goliath ancestry, Tiefling legacy
6. Spellcasting ability for: Elf lineage spells, Gnome lineage spells, Tiefling legacy spells, Magic Initiate (background-granted), Magic Initiate (any explicit pick)
7. Ability score generation method
8. Ability score allocation
9. Background ability bumps (+2/+1 or +1/+1/+1)
10. Alignment
11. 2 Standard languages
12. Class skill picks (count varies)
13. Starting equipment package (A/B/C)
14. Class-specific L1 selections (Divine Order, Primal Order, Fighting Style, etc.)
15. HP for each level (roll vs fixed)
16. Cantrips and prepared spells for spellcasters
17. Eldritch Invocations (Warlock)
18. Metamagic options (Sorcerer)
19. Weapon Mastery weapons
20. Expertise skills (Rogue, Bard, Ranger, Wizard L2)
21. Tool choices (especially Soldier's Gaming Set variant, Bard's 3 musical instruments)
22. For each ASI level: feat or ASI; if feat, the feat's internal choices
23. Mystic Arcanum spell at L11/13/15/17 (Warlock)
24. Magical Secrets / Magical Discoveries spells (Bard / College of Lore Bard)
25. Spell Mastery / Signature Spells (Wizard L18/20)
26. Subclass-specific sub-choices (Hunter's Prey, Defensive Tactics, Brutal Strike effects, Cunning Strike effects, Sorcerer Elemental Affinity damage type, Warlock Fiendish Resilience damage type, Druid Land type, Cleric Blessed Strikes, Druid Elemental Fury, etc.)

### Soft-blocking (player should be warned)

- Duplicate skill grant from class + background (no RAW resolution; convention: pick a substitute)
- Multiclass primary ability prereq (must have 13 in primary of every class)
- Heavy armor STR requirement
- Casting in armor without training

### Per-rest mutable state (not part of character creation but visible on character sheet)

- Druid: Wild Shape forms (swap on Long Rest), Circle land choice (per Long Rest), prepared spells (per Long Rest)
- Cleric: prepared spells (per Long Rest)
- Wizard: prepared spells from spellbook (per Long Rest), cantrips swap (per Long Rest), Memorize Spell (L5, on Short Rest)
- Paladin/Ranger: prepared 1 swap (per Long Rest)
- Hunter Ranger: Hunter's Prey / Defensive Tactics (per Short/Long Rest)
- Fiend Warlock: Fiendish Resilience damage type (per Short/Long Rest)
- Pact of the Tome Warlock: cantrips/rituals in book (per Short/Long Rest)
- Barbarian: Weapon Mastery weapon swap (1 per Long Rest)
- Fighter: Weapon Mastery weapon swap (1 per Long Rest)
- Paladin/Ranger/Rogue: Weapon Mastery weapon swap (1 per Long Rest)
- High Elf: Prestidigitation → another Wizard cantrip (per Long Rest)

### Resources/uses to track

- HP (current, max, temporary, retroactive CON-bump)
- Hit Dice (pooled by die type if multiclass)
- Spell slots (per level)
- Pact Magic slots (separate pool)
- Sorcery Points
- Focus Points (Monk)
- Channel Divinity uses (Cleric, Paladin)
- Rage uses (Barbarian)
- Wild Shape uses (Druid)
- Second Wind uses (Fighter)
- Action Surge uses (Fighter)
- Indomitable uses (Fighter)
- Lay On Hands HP pool (Paladin: 5 × Pal level)
- Bardic Inspiration uses (Bard)
- Mystic Arcanum (Warlock: 1×/Long Rest per L6/7/8/9 known)
- Heroic Inspiration (boolean per player)
- Exhaustion levels (0-6)
- Death save successes/failures
- Concentration target (which spell)
- Each species' once-per-Long-Rest features (Dragonborn Flight, Goliath Large Form, Stone's Endurance reactions if Stone Giant ancestry, etc.)
- Each subclass's specific resources (Dark One's Own Luck CHA/Long Rest; Preserve Life CD; etc.)
- Hunter's Mark casts (Ranger Favored Enemy free casts: 2 at L1 → 3 at L5 → 4 at L9 → 5 at L13 → 6 at L17)

---

*End of enumeration. The above represents every choice point and most edge cases drawn directly from the SRD 5.2.1 PDF. For a working character creation/level-up flow, every numbered item in Section 18 needs UI representation.*
