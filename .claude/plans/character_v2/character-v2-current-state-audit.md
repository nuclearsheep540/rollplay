# Character v2 — Current State Audit (May 2025)

This is a faithful map of what's implemented, what's partial, and what's missing in the character creation and level-up system. The system is largely complete but has several gaps in prerequisite parsing, spell handling, and runtime choices.

---

## 1. Reference Data Parsing & Registry

### ✅ Implemented
- **Parser** (`api-site/scripts/parse_srd.py`): Full markdown AST-based extraction using mistune + BeautifulSoup.
- **Parser scope**: skills.json, feats.json, species.json, backgrounds.json, classes.json all parsed deterministically from vendor SRD.
- **Committed JSON**: All five files exist in `/api-site/modules/characters/seed_data/srd_5_2_1/` with schema_version=1.
- **Code normalization**: `to_code()` function implemented and applied consistently; regex enforced in Pydantic models.
- **Registry** (`api-site/shared/rulesets/registry.py`): Singleton loader, boots at FastAPI startup, validates schema_version + cross-refs.
- **Registry API**: `get_class()`, `get_species()`, `get_background()`, `get_feat()`, `get_skill()`, `list_*()` methods exist.
- **Pydantic models** (`api-site/shared/rulesets/models.py`): Authority for all schemas. File-wrapper models defined. All models use CodePattern validation.

### 🟡 Partially Implemented / Issues

#### Feat Prerequisites
- **Parser has the code** but **prerequisites are empty in committed JSON** (`prerequisites: []` on every feat).
- **Root cause**: Parser extracts prereqs via `_parse_prereq_line()` but the JSON output shows none. Either:
  - The vendored SRD markdown is not using the expected italic subheader format (e.g., feat headings in the markdown don't include `_Category (Prerequisite: ...)_`)
  - OR the parser's regex patterns don't match the actual SRD text
  - OR the parser silently returns `[]` when no match is found
- **Impact**: No feat eligibility filtering in the level-up modal. The UI presents all feats regardless of character prerequisites.
- **Regex patterns defined**:
  - `_PREREQ_LEVEL_RE`: matches `Level N+`
  - `_PREREQ_ABILITY_RE`: matches `Ability N+`
  - `_PREREQ_ABILITY_ANY_RE`: matches `Ability or Ability N+`
  - `_PREREQ_SPELLCASTING_RE`: matches `Spellcasting Feature`
- **Pydantic model ready**: `FeatPrerequisite` has `type`, `value`, `abilities`, `class_code` fields.

#### Species Sub-Choices (Lineages/Ancestries)
- **Parser preserves data**: `language_choices` field exists on `SpeciesDefinition` — `count` and `source` ("from").
- **Frontend handles it**: `SpeciesStep.js` reads `language_choices.count` and renders extra dropdowns for language picks.
- **Not parsed per species yet**: The JSON doesn't capture Dragonborn ancestor color-to-damage mappings or similar species-specific sub-choices. These are in the description text only, not modelled.
- **Verdict**: Basic language choice works; sub-choice mechanics (Dragonborn ancestry, etc.) are descriptions only.

#### Class-Specific Choices (Fighting Style, Subclass)
- **Parser status**: `ClassDefinition` has:
  - `primary_ability`: ✅ extracted
  - `hit_die`: ✅ extracted
  - `saving_throw_proficiencies`: ✅ extracted
  - `skill_choices`: ✅ extracted (count + source list)
  - `asi_levels`: ✅ derived from `"Ability Score Improvement"` in features
  - `features_by_level`: ✅ extracted with `class_specific` dict for heterogeneous columns
  - **Missing**: Fighting Style sub-choices (not exposed in JSON schema, would be class-feature-level)
  - **Missing**: Subclass/multiclass feature selection (explicitly out of scope in plan)

### ⛔ Missing
- **Feat prerequisite extraction validated**: The plan says "extract feat **prerequisites** from the italic subheader like `_Epic Boon Feat (Prerequisite: Level 19+, Spellcasting Feature)_`". This is **not being produced** — every feat has `prerequisites: []`.
- **Spell slot / spell list parsing**: Not in scope yet (out of scope for v2).
- **Equipment variants**: `starting_equipment_text` is text-only, no A-vs-B choice structure.

---

## 2. Domain Aggregate (Character)

### ✅ Fully Implemented

**CharacterAggregate** at `/api-site/modules/characters/domain/character_aggregate.py`:

**Core Fields**:
- `id`, `user_id`, `edition_id`, `edition_code`, `active_campaign` (FK to campaign)
- `character_name`, `species_code`, `background_code` (all code-based, not enums)
- `level`, `xp`, `hp_max`, `hp_current`, `hp_temp`, `ac`, `speed`, `size`, `languages`
- `death_save_successes`, `death_save_failures`, `inspiration`, `status_effects` (text array)
- `is_draft`, `creation_step`, `is_alive`, `is_deleted`
- `avatar_s3_key` (optional media asset link)

**Value Objects**:
- `AbilityScores(str, dex, con, int, wis, cha)` — immutable, 1..30 validation
- `ClassEntry(class_code, level, is_primary)` — supports multi-class
- `SkillProficiency(skill_code, source, expertise)` — source ∈ {CLASS, BACKGROUND, FEAT, SPECIES}
- `FeatAcquisition(feat_code, level, source)` — source ∈ {BACKGROUND_ORIGIN, ASI, OTHER}

**Methods**:
- **Draft lifecycle**: `create_draft()`, `finalize()`, `is_owned_by()`, `is_locked()`, `can_be_deleted()`
- **Runtime edits**: `take_damage()`, `heal()`, `apply_temp_hp()`, `award_xp()`, `set_inspiration()`
- **Death saves**: `roll_death_save_success()`, `roll_death_save_failure()`, `reset_death_saves()`, `is_dying()`
- **Status effects**: `add_status()`, `remove_status()`
- **Ability scores**: `set_ability_scores()`, `final_ability_score()`, `final_ability_scores_dict()` (applies origin bonuses)
- **Species traits**: `apply_species_traits(speed, size, languages)`
- **Level-up**: `apply_level_gain(class_code, hp_gained)`, `apply_asi(increases)`, `take_feat(feat_code, source)`, `add_skill_proficiency()`
- **Validation**: `can_level_up(ruleset)` checks XP vs next threshold

### 🟡 Partially Implemented

**Origin Ability Bonuses**: Stored separately from base scores in `origin_ability_bonuses` dict. The response exposes `final_ability_scores` (base + bonus), but the wizard needs to subtract bonuses to show the editable base. This works but requires the frontend to understand the split.

**Skills & Feats**: Both stored as lists of value objects. No deduplication enforcement at the aggregate level; the repository's UNIQUE constraints handle it. No expertise modifier baked into the aggregate methods (ruleset computes it).

### ⛔ Missing

**Spellcasting Fields**: No spell slots, cantrips known, spells prepared, or spells known. Out of scope per plan (explicitly noted).

**Subclass Selection**: No field to record which subclass the character chose. Out of scope per plan.

**Class-Specific Resource Pools**: No Rages, Ki Points, Sorcery Points, Lay on Hands pool, etc. The `class_specific` columns in the JSON capture the progression table values, but they're not modelled on the aggregate.

**Equipment Selection**: No A-vs-B equipment choice tracking. The JSON has starting_equipment_text but no choice model.

**Multiclass Spellcasting**: Spell slot calculations for multi-class spellcasters are not handled (out of scope).

---

## 3. Ruleset Strategies

### ✅ Fully Implemented (`api-site/shared/rulesets/dnd_2024.py`)

**Dnd2024Ruleset** concrete strategy exposes:

- `xp_for_level(level: int) → int` — XP thresholds for levels 1–20
- `level_for_xp(xp: int) → int` — reverse lookup
- `proficiency_bonus(level: int) → int` — prof bonus table
- `hit_die_for_class(class_code: str) → int` — d6/d8/d10/d12
- `asi_levels_for_class(class_code: str) → List[int]` — ASI milestone levels
- `pending_asi_count(character) → int` — counts ASIs unlocked but not yet spent
- `compute_skill_modifier(character, skill_code: str) → int` — (ability_mod + prof_bonus if proficient)
- `compute_save_modifier(character, ability_code: str) → int` — (ability_mod + prof_bonus if proficient)
- `compute_initiative(character) → int` — DEX mod + prof bonus if feat grants it (Alert feat support, but feat data is text-only)
- `level_up_hp_options(character, class_code) → {average, max_roll}` — HP roll ranges for the class's hit die

### 🟡 Partially Implemented

**Feat Bonus Logic**: Alert feat grants +prof to Initiative. The ruleset hardcodes this check by looking for `feat_code == "alert"` in the character's feats. This works but doesn't scale; if more feats grant mechanical bonuses, they'd need hardcoding too. (Spellcasting bonuses are out of scope and would require spell data.)

**Multi-Class Spell Slots**: Not handled. The strategy has no method to compute spell slots per spell level for multi-class casters.

### ⛔ Missing

**Feat Prerequisite Validation**: No method to check if a character qualifies for a given feat (prerequisites are empty anyway).

**Class Feature Grants**: No method to say "at level N, class X gains feature Y" beyond the raw `features_by_level` data. The audit trail records it, but there's no computed list of "active features."

---

## 4. Application Commands

### ✅ Fully Implemented

**`CreateCharacterDraft`**:
- POST request: `edition_code`, `name`
- Validates edition exists + is active
- Creates draft row with minimal fields
- Returns CharacterAggregate

**`UpdateCharacterDraft`** — Main wizard dispatcher with per-step handlers:

- **Step: `identity`** (maps to "species" in wizard)
  - Input: `species_code`, `chosen_languages`
  - Validates species exists
  - Applies traits: speed, size, default_languages + chosen extras
  - Stored: `species_code`, `speed`, `size`, `languages`

- **Step: `class`**
  - Input: `classes` array with `class_code`, `level`, `is_primary`, `chosen_skills` per entry
  - Validates: each class exists, no duplicates, total level ≤ 20, primary class skill count matches
  - Skill selection: first class grants full count, multi-class entries grant 0 (5.5e rule)
  - Saving throw profs granted only to primary class
  - Stored: `class_entries`, `level`, `skills` (CLASS source), `save_proficiencies`

- **Step: `background`**
  - Input: `background_code`, `ability_increases` array
  - Validates: background exists, increases sum to 3, distribution is +2/+1 or +1/+1/+1, abilities are in background's options
  - Skill grants: deduplicates if character already has a non-BACKGROUND proficiency in that skill
  - Feat grant: BACKGROUND_ORIGIN source
  - Stored: `background_code`, `origin_ability_bonuses`, `skills` (BACKGROUND source), `feats` (BACKGROUND_ORIGIN source)

- **Step: `ability_scores`**
  - Input: six ability scores, `method` (point-buy / standard-array / roll), `roll_details`
  - Validates: each ability 1..30
  - Applies on top of `origin_ability_bonuses` without clobbering them
  - Stored: `ability_scores`, `method`, `roll_details` (audit trail)

- **Step: `hp_ac`**
  - Input: `hp_max`, `ac`
  - No formula validation; values stored as-is
  - HP current set to hp_max
  - Stored: `hp_max`, `hp_current`, `ac`

- **Step: `rename`**
  - Input: `name`
  - Name-only update from the persistent header
  - Does NOT bump `creation_step`
  - Stored: `character_name`

**`FinalizeCharacterDraft`**:
- POST request: character_id, user_id
- Validates owner + draft status
- Flips `is_draft = false`
- Returns finalized CharacterAggregate

**`DiscardCharacterDraft`**:
- DELETE request: character_id, user_id
- Validates owner + draft status (refuses finalized characters)
- Hard-deletes the row

**`SetCharacterAvatar`**:
- PATCH request: character_id, user_id, asset_id (optional)
- Validates asset exists, belongs to user, is image-type
- Stores S3 key on character

**`DeleteCharacter`**:
- DELETE request: character_id, user_id
- Validates owner, refuses drafts (use DiscardDraft), refuses locked characters
- Soft-delete (sets is_deleted flag)

**`UpdateRuntimeState`**:
- PATCH request: character_id, user_id, partial updates dict
- Supported fields: `hp_current`, `hp_temp`, `xp`, `inspiration`, `status_effects`, `death_save_successes`, `death_save_failures`, `is_alive`
- HP logic: damage taken resets death saves to 0; healing > 0 clears dying flag
- XP logic: triggers `can_level_up()` check on response (no auto-level)
- Stored: individual fields updated per request

**`LevelUpCharacter`**:
- POST request: character_id, user_id, class_code, hp_choice, roll_value?, asi_choice?, feat_choice?, skill_choices?
- Validates: character eligible (xp threshold met), class exists in progression, hp_choice valid, ASI/feat mutually exclusive
- HP gain: average from ruleset OR roll + CON mod (min 1)
- ASI level detection: checks `ruleset.asi_levels_for_class(class_code)`
- ASI choice: two formats: `{increases: {ability: delta}}` with values {2} or {1, 1}
- Feat choice: validates feat exists; character prereqs are NOT validated (prerequisites are empty anyway)
- Skill grants: rare; appended to character.skills with CLASS source
- Audit trail: records all choices to `character_choices_log` table per choice_type (HP_ROLL, ASI, FEAT, SKILL)
- Stored: updated level + 1 on the chosen class entry, hp_current += hp_gained, feats/skills updated, choices logged

### 🟡 Partially Implemented

**UpdateCharacterDraft class step**: Does not handle Fighting Style sub-choices or other class feature variants. The `chosen_skills` payload is the only per-class picker implemented. Classes that grant feature choices at level 1 (e.g., Barbarian: Primal Knowledge skill options, Rogue: Expertise picks) are not yet in the wizard.

**LevelUpCharacter feat choice**: No prerequisite validation. Feats are presented to the user without filtering by character qualifications.

### ⛔ Missing

**Spell selection commands**: No command for choosing spells known / prepared / cantrips. Out of scope.

**Multi-class into new class**: LevelUpCharacter rejects leveling a class that's not already in the progression. Adding a new class mid-campaign is a separate flow (not implemented).

**Subclass selection command**: No command to pick or change a character's subclass. Out of scope.

---

## 5. API Endpoints

### ✅ Fully Implemented

**Draft Lifecycle**:
- `POST /api/characters/draft` — CreateCharacterDraft
- `PATCH /api/characters/draft/{id}` — UpdateCharacterDraft with `step` dispatcher
- `POST /api/characters/draft/{id}/finalize` — FinalizeCharacterDraft
- `DELETE /api/characters/draft/{id}` — DiscardCharacterDraft

**Character Management**:
- `GET /api/characters/me` — list user's characters (draft + finalized)
- `GET /api/characters/{id}` — single character response
- `PATCH /api/characters/{id}/avatar` — SetCharacterAvatar
- `DELETE /api/characters/{id}` — DeleteCharacter (soft-delete)

**Runtime**:
- `PATCH /api/characters/{id}/runtime` — UpdateRuntimeState with partial update dict
- `GET /api/characters/{id}/level-up` — LevelUpPreview; returns `available_classes`, `is_asi_level`, `hp_options`, `available_feats` (if ASI level)
- `POST /api/characters/{id}/level-up` — LevelUpCharacter

**Reference Data** (in `edition_endpoints.py`):
- `GET /api/editions` — list active editions
- `GET /api/editions/{edition_code}/classes` — list ClassDefinition
- `GET /api/editions/{edition_code}/species` — list SpeciesDefinition
- `GET /api/editions/{edition_code}/backgrounds` — list BackgroundDefinition
- `GET /api/editions/{edition_code}/feats?category={category}` — list FeatDefinition filtered by category
- `GET /api/editions/{edition_code}/skills` — list SkillDefinition

**Response Schemas**:
- `CharacterResponse`: full aggregate + `derived` (DerivedStats) computed via ruleset
- `DerivedStats`: proficiency_bonus, initiative, skills (with modifier + proficiency flag), saves (with modifier + proficiency flag), next_level_xp, pending_level_up, pending_asi_count
- `LevelUpPreview`: available_classes, is_asi_level (per class), hp_options, available_feats (if ASI level, filtered by category)

### 🟡 Partially Implemented

**LevelUpPreview**: Builds `available_feats` list but does NOT filter by prerequisites. Every feat in the given category is listed, regardless of character qualifications.

**CharacterResponse**: `pending_asi_count` is computed and returned, but there's no breakdown per class (e.g., "Barbarian has 2 pending ASIs, Rogue has 1"). The response gives a single count, which works for single-class but is ambiguous for multi-class.

### ⛔ Missing

**Party endpoint**: Plan says `GET /api/campaigns/{campaign_id}/party` should return finalized characters in the campaign. Not found in endpoints.py; may be in queries.py or missing entirely. Needed for DM read-only sheet view (Phase 5).

**Spell endpoints**: No endpoints for spell data (out of scope).

---

## 6. Frontend Wizard (`rollplay/app/(authenticated)/character/`)

### ✅ Fully Implemented

**CharacterWizard.js** (main container):
- Loads draft on mount via URL `?id=<draft_id>` or creates new draft
- Step logic: tracks `creation_step` from server; resume on refresh
- Normalizes legacy "identity" step to "species" in UI
- Auto-derives next incomplete step on mount
- Steps array: species → class → background → ability_scores → review
- Autosave: debounced (300ms) updates to each step via `PATCH /draft/{id}`
- Save state indicator: idle | saving | saved | error
- Avatar picker modal: triggered from the persistent header
- Finalize flow: submits to `/draft/{id}/finalize`, clears local state, redirects to dashboard

**SpeciesStep.js**:
- Displays species list from registry (searchable, tiles)
- Language choices: if species has `language_choices`, renders dropdowns for each extra language
- Validates: species picked, language count matches requirement
- Persists: species_code, chosen_languages via step='identity' (backend uses "identity" key)
- Handles clear/reset: re-opens picker

**ClassStep.js**:
- Multi-class support: renders selected classes above, picker below
- Per-class fields: level (1–20), skill picks (count enforced per class definition)
- Validation: primary class has full skill count, total level ≤ 20, no duplicates
- Multi-class rule: only primary class grants skills (secondary entries forced to 0)
- Add/remove buttons for multi-class
- Persists: classes array with {class_code, level, is_primary, chosen_skills[]}

**BackgroundStep.js**:
- Background tile selection
- Ability bonus distribution: presets (2/1 or 1/1/1), custom ability picker per bonus
- Displays origin feat (read-only) from registry
- Shows granted skill proficiencies (read-only)
- Validates: background picked, ability distribution sum to 3, distribution pattern valid
- Persists: background_code, ability_increases[] with {ability, increase}

**AbilityScoresStep.js**:
- Three methods: point-buy, standard array, manual entry
- PointBuyCalculator utility (existing component reused)
- Subtracts origin ability bonuses before rendering base scores for editing
- Stores method + roll_details (audit trail)
- Validates: each score 1..30 (or 3..18 point-buy)
- Persists: six ability scores + method + roll_details

**ReviewStep.js**:
- Read-only display of complete character
- Reuses CharacterSheet.js component
- Shows derived stats (skills, saves, HP, AC, prof bonus, initiative) via API response
- "Finalize" button submits to `/draft/{id}/finalize`

**WizardChrome.js**:
- Progress strip with current step highlighted
- Back/Next buttons
- Step footer: navigation + save state

### 🟡 Partially Implemented

**Class feature choices**: ClassStep renders the primary class's skill options but does NOT handle:
- Fighting Style selection (out of scope; no class-feature picker in wizard)
- Barbarian Primal Knowledge skill bonus (out of scope)
- Any class-specific level 1 choices beyond skill picks

**Species language defaults**: The wizard shows `language_choices` if present but does NOT yet load and display `default_languages` (basic languages all species get). Language picks are custom-only; the UI doesn't show "you also get Common" etc.

**Ability score method UX**: The wizard supports three methods but doesn't guide the user through them visually. The point-buy calculator is embedded but the review step doesn't clarify which method was used.

### ⛔ Missing

**Feat preview**: No feat descriptions shown in the wizard (even on ReviewStep). Feats are selected during level-up, not creation, so the step doesn't need them, but during level-up they should be visible.

**Equipment choice**: The background step shows `equipment_text` (read-only) but offers no A-vs-B choice. Out of scope.

**Subclass selection**: No step for multi-classing or subclass choice. Out of scope.

---

## 7. Level-Up Modal (`rollplay/app/game/components/LevelUpModal.js`)

### ✅ Fully Implemented

**LevelUpModal** (multi-step wizard, modal-style):
- Fetches `GET /api/characters/{id}/level-up` for preview data
- Step list (dynamic):
  1. **Class** — only if multi-class (skipped otherwise)
  2. **HP** — average vs roll
  3. **ASI** — only if this class's new level is an ASI level
  4. **Confirm** — review + submit

**Class step** (multi-class only):
- Dropdown to select which class is leveling up
- Defaults to first available class

**HP step**:
- Radio buttons: average OR roll
- Roll: text input for the die result, validated against hit die max
- Displays the hit die range

**ASI step** (ASI level only):
- Toggles between ASI (+2 / +1+1) and Feat picks
- ASI picker:
  - Mode: +2 to one ability OR +1 to each of two
  - Ability dropdowns (secondary hidden when +2 mode)
  - Computes and displays `increases` object
- Feat picker:
  - Dropdown of available feats (NOT filtered by prerequisites; from the preview)
  - Shows feat name but NOT description

**Confirm step**:
- Displays review of all choices
- Validation: all required fields filled, roll value in range if rolling

**Submit**:
- Calls `POST /api/characters/{id}/level-up` with:
  - `class_code`
  - `hp_choice` ("average" | "roll")
  - `roll_value` (optional)
  - `asi_choice` or `feat_choice` (optional, mutually exclusive, ASI level only)
- On success: closes modal, updates character in parent, calls `onComplete()` callback
- On error: displays error message, allows retry

### 🟡 Partially Implemented

**Feat list filtering**: The `available_feats` from the preview are displayed but NOT filtered. Feats without prerequisites might be listed along with feats requiring conditions the character doesn't meet. (Prerequisite data is empty anyway, so filtering is currently impossible.)

**Skill choices at level-up**: The command accepts `skill_choices` payload but the modal does NOT render a step for skill selection. Skill grants from class features (e.g., Barbarian Primal Knowledge at L3) would need to be added server-side to the level-up preview and then a UI step.

**Multi-class visual clarity**: When selecting a class to level, the modal doesn't show the class's current level alongside the pick.

### ⛔ Missing

**Feat descriptions**: Feat names are shown but no tooltip or sidebar with description. During level-up, the player must already know feats or tab out to look them up.

**Spell selection**: Spellcasters gaining spell slots / spells known have no UI for picking spells. Out of scope.

**Subclass feature grants**: No UI to display or select subclass features. Out of scope.

**Dynamic class feature list**: The confirm step doesn't list "you gain X feature at this level" (the preview has the data, but the UI doesn't show it).

---

## 8. Runtime Character Sheet & Game Session

### ✅ Fully Implemented

**CharacterSheet.js** (read-only display):
- Header: name, species, background, edition, level, XP
- Vitals: HP current/max/temp, AC, Speed, Prof bonus, Initiative
- Classes: list with primary marker
- Ability scores: six scores with modifiers
- (In CharacterResponse.derived) Skills: all skills with proficiency flag, expertise flag, modifier
- (In CharacterResponse.derived) Saves: all six saves with proficiency flag, modifier
- Next level XP: displayed in header

**GameContent.js** integration:
- Imports `CharacterSheet` component
- Maintains `levelUpModalOpen` state
- Renders `LevelUpModal` with current character
- LevelUpModal callback updates character state after level-up
- Passes character to CharacterSheet for display

### 🟡 Partially Implemented

**Editable runtime fields** (CharacterSheet in game is read-only):
- HP +/- stepper: NOT in the current CharacterSheet component (which is read-only display)
- Temp HP input: NOT implemented
- XP entry: NOT implemented
- Status pills with add/remove: NOT implemented
- Death save checkboxes: NOT implemented
- Inspiration toggle: NOT implemented

The plan calls for a player-editable version of CharacterSheet in the game session's Character tab. The current implementation is display-only. There may be a separate editable component (GameCharacterSheet or similar) but it's not clear from the audit.

### ⛔ Missing

**Character tab in game session**: The plan calls for a "Character" tab in the active game session UI where:
- Players see and edit their own runtime stats (HP, XP, death saves, inspiration, statuses)
- DMs see read-only sheets for every party member

The current code has CharacterSheet integrated into GameContent, but there's no clear "tab" system or DM party view.

**Death save visualization**: Plan calls for 3 success / 3 failure checkboxes when HP = 0. Not implemented in CharacterSheet.

**Spell tracking**: No spells list, spell slots, cantrips, etc. Out of scope.

**Resource pool tracking**: No Rages, Ki Points, Sorcery Points, etc. Out of scope.

---

## 9. Starting at Higher Levels

### ⛔ Missing / Not Designed

**No support for starting above level 1**:
- Character creation wizard has no "starting level" input
- CreateCharacterDraft hardcodes draft to level 1
- LevelUpCharacter handles only +1 at a time
- The data model supports any level via `class_entries[].level`, but the flows don't use it

**Why it matters**: DMs often start campaigns at level 3, 5, etc. No way to create a pre-leveled character without manually calling LevelUpCharacter N times (which also spends XP).

**Workaround if needed**: DM could create at level 1, then call `PATCH /api/characters/{id}/runtime` with `{ xp: [threshold for level N] }`, which triggers `can_level_up()` check. Then LevelUpCharacter N times. Tedious but possible. Not tested.

---

## 10. Other Observations

### Notable TODOs / Incompleteness

1. **Feat prerequisites parsed but empty**: The regex patterns and parsing logic exist in `parse_srd.py`, but the committed JSON shows `prerequisites: []` on every feat. This suggests either the SRD markdown doesn't use the expected format, or the regexes don't match the actual text. Needs investigation.

2. **Character editing after finalize**: The plan says "editing a finalized character is limited to identity (name) for now." The `UpdateCharacterDraft` command checks `character.is_locked()` and refuses edits if the character is claimed by a campaign. However, there's no endpoint or frontend UI for post-finalize edits. Likely out of scope.

3. **Edition-specific schemas / migrations**: The architecture supports dropping new editions by adding directories under `seed_data/`, but no migrations are needed. The schema is universal; the `editions` table just adds a row. In practice, adding a new edition requires:
   - Parsing new SRD markdown (script run)
   - Dropping new JSON files
   - Adding an `editions` row
   - Optionally a new `RulesetStrategy` subclass if math diverges
   - Registering the strategy in `_STRATEGY_FACTORIES`
   This is low-friction as designed.

4. **Copy-paste duplication across backend**:
   - The `ABILITY_CODES` constant is defined in the aggregate and imported everywhere
   - The modifier formula `(score - 10) // 2` is duplicated in the ruleset and frontend
   - Not a blocker, but maintenance risk

5. **S3 avatar integration**: The CharacterAggregate has `avatar_s3_key` and the endpoint has SetCharacterAvatar. The review step and game sheet attempt to load presigned URLs. S3 service integration looks complete but untested.

6. **Audit trail (`character_choices_log`)**: The LevelUpCharacter command writes audit entries per choice (HP_ROLL, ASI, FEAT, SKILL). The schema supports this (JSONB choice_data). No frontend UI to display the audit trail, but the data is being recorded.

7. **Language choice implementation gap**: The SpeciesStep renders language picker dropdowns for `language_choices.count` entries. But the source list (`language_choices.source` / `from` alias) is never displayed or filtered in the UI. Players pick arbitrary languages. The backend validates they're non-empty but doesn't validate against the source list. Minor issue but UX-unfriendly.

8. **Saving throw proficiency storage**: Stored as a set of ability codes on the character, not via a join table. Works but means only one set per character (primary class grants). If multi-class allows secondary classes to grant save profs, this model would need rework. Currently doesn't happen (backend enforces primary-only).

---

## Summary: Top 10 Most Significant Gaps

1. **Feat prerequisites are unparsed** — Every feat has `prerequisites: []`. The parser code exists but doesn't produce non-empty results. Blocks prerequisite validation in level-up.

2. **No spell system** — Spellcasting, spell slots, spells known/prepared, cantrips: all out of scope, all missing. Critical for spellcasters.

3. **No subclass selection** — Characters cannot pick subclasses (Eldritch Knight, Oath of Devotion, etc.). Explicitly out of scope but a major gap for a complete character.

4. **No starting at higher levels** — Wizard and creation flow assume level 1. DMs must manually level-up N times or write a workaround. Common request.

5. **Level-up modal doesn't show feat descriptions** — When picking a feat at ASI level, only the name is shown. No tooltip or sidebar. UX blocker for informed choice.

6. **No party view for DMs** — Plan calls for `GET /api/campaigns/{id}/party` and DM read-only sheet tabs. Endpoint not found; frontend not implemented.

7. **No runtime character sheet edits** — The plan calls for player edits to HP, XP, inspiration, status effects, death saves in the game session. CharacterSheet is display-only; no edit controls.

8. **Class feature choices not modeled** — Barbarian Primal Knowledge, Rogue Expertise, etc.: no picker in the wizard or level-up flow. Described in JSON but not selectable.

9. **Fighting Style selection missing** — Clerics, Fighters, Paladins: no UI to pick Fighting Style. Described in JSON but not linked to class selection.

10. **Origin ability bonuses confusing** — Background grants +3 split across three abilities. These are stored separately and the response exposes final scores. The wizard must subtract bonuses to show editable base. Works but requires frontend awareness of the split; easy to misunderstand.

---

## Verdict

The character v2 system is **substantially complete** for draft creation, finalization, and basic level-up. The data model, parser, registry, and wizard are solid. The **missing pieces are mostly additive** — spells, subclasses, higher-level starts — and don't break what's there.

The **feat prerequisites gap is the most urgent to close**: either the parser needs fixing (regex tuning, SRD format investigation), or the feature needs to be descoped (remove prerequisites field, acknowledge no validation). Currently it's a half-done feature that creates false hope.

The **party view and runtime edits are straightforward** to add once the character tab is wired into the game session UI.

The **spell system is substantial work** and out of scope for this audit — but its absence is a known limitation.
