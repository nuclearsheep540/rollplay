# Character v2 — Rebuild Character Creation, Runtime Sheet, and Edition-Aware Data

## Context

The current character creation flow is weak:

- The form lives at `/character/create` with its own layout, separate from the dashboard chrome — it feels like a different app.
- The data model captures very little: name, race (hardcoded enum), level, background (string), ability scores, HP, AC. No skills, no skill sources, no feats, no species traits, no XP, no death saves, no statuses.
- Race / class / background are pinned to **hardcoded Python enums** ([character_aggregate.py:89-145](api-site/modules/characters/domain/character_aggregate.py#L89)) — adding content requires code changes and there is no edition awareness.
- In active sessions there is no character sheet UI. Players can't see their own stats; DMs can't see party members.
- Level-up has no flow at all; ASIs aren't modelled.

This plan rebuilds character creation, the underlying data model, and adds a runtime "Character" tab — all on a foundation that uses the official **D&D SRD 5.2.1** as the source of rules content (vendored + parsed once into JSON), with a schema designed to support additional editions in the future by duplication, not inheritance.

## Goal

1. Replace the current character creation form with a multi-step, autosaving wizard living inside the authenticated dashboard layout.
2. Expand the character data model to cover skills (with sources), feats, species traits (speed, size, languages), XP, death saves, Heroic Inspiration, and free-text status effects.
3. Vendor the [downfallx/dnd-5e-srd-markdown](https://github.com/downfallx/dnd-5e-srd-markdown) repository (CC BY 4.0) and parse it into committed JSON files that the app loads into an in-memory ruleset registry at startup.
4. Add an `editions` PostgreSQL lookup and lock each character to a single edition for life. New editions are added by dropping new JSON files into a new directory — no schema changes, no inheritance.
5. Add a "Character" tab to the active game session: players see and edit their own runtime stats (HP, XP, death saves, inspiration, statuses); DMs see read-only sheets for every party member.
6. Add a level-up wizard that triggers when XP crosses the threshold, walks the player through HP gain and (at the right milestones) Ability Score Improvement or feat selection.
7. Drop all existing character rows. We do not migrate the thin schema forward.

## Scope

**In scope:**
- Classes (all 12 from SRD 5.2.1), multi-class support
- Species (5.2.1 species list)
- Backgrounds (granting Origin Feat + ability score increases + skill + tool proficiencies)
- Feats (Origin + General + Fighting Style + Epic Boon categories — descriptions only, no mechanical effects modelled)
- Skills (sourced from class choice / background / feats)
- Ability scores + saving throw proficiencies + saving throw verification
- HP, AC, XP, level, death saves, Heroic Inspiration, free-text status effects
- Species traits: speed, size, languages
- Level-up with ASI / feat choice at class-appropriate milestones

**Out of scope (explicitly):**
- Actions
- Spells / spellcasting
- Inventory / equipment beyond starting choice text
- Subclasses (Berserker for Barbarian etc.) — parser leaves them un-extracted; can be added later as a JSON file addition + UI step
- Homebrew / user-defined content
- Mid-game edition swap (a character is locked to its creation edition)

**Stays the same:**
- The campaign ↔ character linking flow (how a character gets attached to a campaign).

## Architecture

### 1. Reference data lives in JSON, not PostgreSQL

Static D&D rules content (classes, species, backgrounds, feats, skills) is parsed once from the vendored SRD markdown into JSON files under `api-site/modules/characters/seed_data/<edition_code>/`. Files are committed to the repo. The app loads them into an in-memory `RulesetRegistry` at startup. Character rows reference content by **stable string codes** (e.g. `class_code = "barbarian"`), not by FK.

The DB holds:
- A tiny `editions` lookup table (FK target for `characters.edition_id` and `campaigns.edition_id`)
- The existing `dnd_abilities` lookup (universal across editions — STR/DEX/CON/INT/WIS/CHA)
- All character data + the user's choices

The JSON holds:
- Everything edition-specific

### 2. Editions are duplicated, not inherited

When a new edition (say SRD 6.x) ships, we:
- Add a new row to `editions`
- Drop a new directory `seed_data/srd_6_x/` with a fresh set of JSON files (most will be near-copies of 5.2.1 with edits, produced by re-running the parser against a different vendored SRD)
- Optionally write a new `Dnd2030Ruleset(Dnd2024Ruleset)` class if rules math overlaps

No `parent_edition_id`, no membership joins, no override resolution. Each edition is a complete, self-contained set of files. Updating 5.5e content never accidentally touches 6e content.

### 3. Rules logic lives in Python strategy classes

Per-edition math (XP→level table, proficiency bonus by level, ASI level milestones per class, saving throw calculation, skill check formula) lives in `RulesetStrategy` subclasses keyed by edition code. The registry resolves a character's edition_id to the right strategy.

### 4. Character creation is multi-step with server-side autosave

A character row is created in **draft** state when the wizard starts. Every step persists incrementally via `PATCH /characters/draft/:id`. Final submission flips `is_draft = false`. Players can leave and return to a half-finished character.

---

## Phase 0 — Vendor & Parse the SRD

Goal: produce committed JSON files that the app can read at startup. No app code changes in this phase.

### 0.1 — Vendor the SRD repo

Add as a git submodule:
```
git submodule add https://github.com/downfallx/dnd-5e-srd-markdown api-site/vendor/srd_5_2_1
```

License: **CC BY 4.0**. Attribution requirement satisfied via a footer line added in Phase 3 (frontend).

### 0.2 — Parsing approach & code normalization

**Parser stack: markdown AST, not regex on raw text.** Use [`mistune`](https://github.com/lepture/mistune) (or `markdown-it-py`) to parse each source file into an AST. The AST gives us structured tokens — headings, paragraphs, lists, raw HTML blocks. The parser walks the AST and only falls back to regex inside known token types (e.g. inside a paragraph already identified as a background field block). Far more robust than line-by-line regex on raw text.

**Embedded HTML tables** (used heavily for class progression and the species/skills tables) are returned by the markdown parser as raw HTML blocks. Feed those into [`BeautifulSoup`](https://www.crummy.com/software/BeautifulSoup/) to parse rows generically — read the table header row and produce a key→value dict per data row. Never hardcode column positions.

**Code normalization rule** (cross-cutting — must be consistent across all files):

```python
def to_code(name: str) -> str:
    # "Magic Initiate (Cleric)" → "magic_initiate_cleric"
    # "Sleight of Hand" → "sleight_of_hand"
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")
```

Once a code is committed to a published JSON file it is a permanent contract — renaming a display name is fine; renaming a code is a breaking change. Same discipline as DB enum values.

The parser produces **deterministic output** (sorted keys at every level, lists sorted by code) so JSON diffs are clean when re-run.

### 0.3 — Parsing risk tiers — where the work actually is

The SRD content falls into three tiers. The parser is structured per-file with the harder ones getting more careful attention and test coverage.

| Tier | File / target | Source | Why |
|---|---|---|---|
| 🟢 Easy | `skills.json` | `playing-the-game.md` lines 484-588 | One clean HTML table with `Skill / Ability / Example Uses` columns. 18 rows. Parse the table, done. **Verified.** |
| 🟢 Easy | `backgrounds.json` | `character-origins.md` | Highly regular: `**Ability Scores:** ...`, `**Feat:** ...`, `**Skill Proficiencies:** ...`, `**Tool Proficiency:** ...`, `**Equipment:** ...` per background. Walk h4 headings, extract bold-label fields per section. |
| 🟡 Medium | `feats.json` | `feats.md` | Categories are h3 headings (`### Origin Feats`, `### General Feats`...). Each feat is h4 with italic subheader encoding category + prereqs: `_General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)_`. **Prereq parsing has variants** — `Level N+`, `Ability N+`, `Ability or Ability N+`, `Spellcasting feature`, conjunctions. Build a grammar for the prereq line; assert each parsed feat's prereqs match a known pattern. |
| 🟡 Medium | `species.json` | `character-origins.md` | Consistent `**Creature Type:**`, `**Size:**`, `**Speed:**` lines, then traits as `_Trait Name._` italic-header paragraphs. **Some species embed HTML tables for sub-choices** (Dragonborn's Draconic Ancestors color → damage type). Traits stored as `{name, description}` blobs — no mechanical-effect modelling, just preserve text. |
| 🔴 Hard | `classes.json` | `classes.md` | See breakdown below — this is where most of the parsing risk lives. |

**Class parsing — the gnarly bits, per class (×12):**

1. **Core Traits table** (consistent format across all 12 classes — low risk): 2-column key/value HTML table with `Primary Ability`, `Hit Point Die`, `Saving Throw Proficiencies`, `Skill Proficiencies`, `Weapon Proficiencies`, `Armor Training`, `Starting Equipment`. Generic key→value extraction works.

2. **Class progression table** (heterogeneous per class — **the real work**):
   - Header row defines columns. Universal columns: `Level`, `Proficiency Bonus`, `Class Features`.
   - Class-specific columns vary wildly: Barbarian has `Rages`, `Rage Damage`, `Weapon Mastery`; Wizard has `Cantrips Known`, `Spell Slots`, `1st`, `2nd`, ..., `9th`; Monk has `Martial Arts`, `Ki Points`, `Unarmored Movement`; Rogue has `Sneak Attack`.
   - **Strategy**: read the header row dynamically, produce `{level: {proficiency_bonus, features[], class_specific{<header>: <value>}}}`. Don't hardcode column → field mappings anywhere.
   - **Spellcaster tables are wide** (Wizard goes to 9th-level spell slots → 14+ columns). Validate the table parser handles wide tables without truncation.

3. **"Class Features" cell splitting** — contents are comma-separated feature names like `"Rage, Unarmored Defense, Weapon Mastery"`. Naive `.split(",")` works for 5.5e SRD core but spot-check for D&D feature names containing commas. Strip whitespace.

4. **Feature description association** — the table lists feature *names* per level; full descriptions appear as h4 headings later in the class section. Parser matches table-listed feature names to their description blocks via `to_code()` on both sides. **Risk**: edge cases where the table-listed name and the description heading differ slightly (capitalization, "the" prefix). **Mitigation**: fail loudly on any unmatched feature — never silently skip.

5. **ASI level detection — derived, not stated.** The SRD has no explicit `asi_levels` field. ASIs appear in the `Class Features` column as the literal feature name `"Ability Score Improvement"`. Parser **scans** the progression table for that string and produces `asi_levels: [4, 8, 12, 16, 19]`. **Risk**: if the SRD ever rephrases (e.g. "Ability Score Increase"), detection silently misses. **Mitigation**: assert `len(asi_levels) >= 4` for any class with 20 levels (Fighter has 7; Rogue has 6; most have 5). Failing this assertion blocks the parse.

6. **"Becoming a [Class]" multiclass prose** — store as `multiclass_text` markdown blob. Out of scope to parse into structured fields.

7. **Subclasses section** — skipped entirely in v1. Parser stops at the first subclass heading per class.

**Cross-file validation pass** (runs after all five JSON files are produced, before commit):

- Every `origin_feat_code` in `backgrounds.json` must exist in `feats.json`. Dangling refs abort the parse.
- Every skill code referenced from `classes.json.skill_choices.from` and `backgrounds.json.skill_proficiencies` must exist in `skills.json`.
- Every ability name referenced (in saves, primary ability, skill governing-ability) must be one of the six canonical abilities.
- Code uniqueness within each file's namespace.

**Cross-cutting risks:**

- **Trailing whitespace / non-breaking spaces** in SRD text — strip aggressively before code normalization.
- **Schema version mismatch** — each JSON file carries `schema_version`. If the parser's output format changes, increment the version; the runtime registry refuses to load mismatched versions (so we can't ship a parser change without re-running and re-committing).

### 0.4 — Spike: parse one hard case before committing

Before writing the full parser, do a **one-day spike**: parse just the Barbarian section of `classes.md` end-to-end. Produce a Barbarian fragment of `classes.json` that matches the schema in 0.6. The spike validates:
- Markdown AST approach handles the heading structure as expected
- Embedded HTML table parser extracts heterogeneous columns correctly
- Feature name → description association via `to_code()` works
- ASI level derivation finds `[4, 8, 12, 16, 19]`
- Output is deterministic when re-run

**If the spike succeeds**: extrapolate the same pattern to all 12 classes + the other files.

**If the spike fails** (e.g. some structural quirk in the SRD makes AST walking unreliable): pivot to one of —
- Different markdown library (`markdown-it-py` ↔ `mistune`)
- **Hand-curate `classes.json` only** — the other four files are easy enough to parse; the 12 classes get hand-encoded if the parser can't be made to work in reasonable time. Volume is manageable (12 classes × ~20 levels of progression).

Spike output lives on a feature branch and is reviewed before committing to the full parse job in 0.5.

### 0.5 — Full parser

New file: `api-site/scripts/parse_srd.py`

Reads the markdown files from the vendored submodule and emits structured JSON to `api-site/modules/characters/seed_data/srd_5_2_1/`. Run manually when the SRD updates; output is committed to the repo.

Files produced (in order — earlier files validated before later files which reference them):
1. `skills.json` — skill list with governing ability mapping (parsed from `playing-the-game.md`)
2. `feats.json` — all feats grouped by category (parsed from `feats.md`)
3. `species.json` — species + traits (parsed from `character-origins.md`)
4. `backgrounds.json` — backgrounds with their origin feat reference (parsed from `character-origins.md`)
5. `classes.json` — class metadata + per-level progression (parsed from `classes.md`)
6. **Validation pass** — cross-file references checked per 0.3 risks list. Any failure aborts before files are written to disk.

Per-file unit tests assert structural invariants on the output (e.g. all 12 classes present, every class has ≥4 ASI levels, every background's feat code resolves).

### 0.6 — Pydantic models as the schema authority

The reference data JSON shape is **defined by Pydantic models**, not by hand-written JSON schemas in this document. The models live in `api-site/shared/rulesets/models.py` and serve four roles in one definition:

1. **Schema authority** — the canonical "what does a Class/Species/Background/Feat/Skill look like" definition for the whole project.
2. **Parser output validation** — Phase 0.7 tests every parsed entry against these models.
3. **Runtime registry typing** — Phase 1.3 loads JSON via `Model.model_validate(...)` so the registry stores typed instances, not dicts.
4. **API response shapes** — Phase 2.1 reference data endpoints return these models directly (no separate `schemas.py` DTO mirroring).

```python
# api-site/shared/rulesets/models.py

from pydantic import BaseModel, Field
from typing import Literal, Optional

AbilityCode = Literal["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
CodePattern = r"^[a-z0-9_]+$"

class SkillDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    ability: AbilityCode

class FeatPrerequisite(BaseModel):
    type: Literal["level", "ability", "ability_any", "class", "spellcasting"]
    value: Optional[int] = None
    abilities: Optional[list[AbilityCode]] = None
    class_code: Optional[str] = Field(default=None, pattern=CodePattern)

class FeatDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    category: Literal["origin", "general", "fighting_style", "epic_boon"]
    prerequisites: list[FeatPrerequisite] = []
    repeatable: bool = False
    description: str = Field(min_length=1)

class SpeciesTrait(BaseModel):
    name: str
    description: str = Field(min_length=1)

class LanguageChoices(BaseModel):
    count: int = Field(ge=1)
    source: str = Field(alias="from")   # alias because "from" is a Python keyword

class SpeciesDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    creature_type: str
    size: Literal["Small", "Medium", "Large"]
    speed: int = Field(ge=0)
    default_languages: list[str]
    language_choices: Optional[LanguageChoices] = None
    traits: list[SpeciesTrait]

class BackgroundDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    ability_scores: list[AbilityCode] = Field(min_length=3, max_length=3)
    origin_feat_code: str = Field(pattern=CodePattern)
    skill_proficiencies: list[str] = Field(min_length=2, max_length=2)
    tool_proficiency: str
    equipment_text: str

class ClassFeature(BaseModel):
    name: str
    description: str = Field(min_length=1)

class ClassLevel(BaseModel):
    proficiency_bonus: int = Field(ge=2, le=6)
    features: list[ClassFeature]
    class_specific: dict[str, str | int]   # heterogeneous columns preserved

class SkillChoices(BaseModel):
    count: int = Field(ge=0)
    source: list[str] = Field(alias="from")

class ClassDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    primary_ability: AbilityCode
    hit_die: Literal[6, 8, 10, 12]
    saving_throw_proficiencies: list[AbilityCode] = Field(min_length=2, max_length=2)
    skill_choices: SkillChoices
    armor_training: list[str]
    weapon_proficiencies: list[str]
    starting_equipment_text: str
    asi_levels: list[int] = Field(min_length=4)   # every class has ≥4 ASI levels in 5.5e
    features_by_level: dict[str, ClassLevel]
    multiclass_text: Optional[str] = None

# File-wrapper models — top-level JSON shape per file

class _EditionFile(BaseModel):
    schema_version: int = 1
    edition: str

class SkillsFile(_EditionFile):
    skills: list[SkillDefinition]

class FeatsFile(_EditionFile):
    feats: list[FeatDefinition]

class SpeciesFile(_EditionFile):
    species: list[SpeciesDefinition]

class BackgroundsFile(_EditionFile):
    backgrounds: list[BackgroundDefinition]

class ClassesFile(_EditionFile):
    classes: list[ClassDefinition]
```

**Notes:**
- `schema_version` is incremented in lockstep with the model definitions if the shape changes; the runtime registry refuses to load mismatched versions.
- `CodePattern = r"^[a-z0-9_]+$"` enforces the `to_code()` normalization rule from 0.2 at every code field — anything that fails this regex fails validation.
- `class_specific: dict[str, str | int]` is intentionally permissive — it's where heterogeneous class progression columns land (Rages, Spell Slots, Ki Points, etc.), and we don't want to enumerate every possible column across 12 classes. Type checking only enforces "string or int values" which is enough.
- `Optional` fields use `None` defaults, so absent JSON keys validate cleanly.

### 0.7 — Attribution & license

- `api-site/modules/characters/seed_data/srd_5_2_1/README.md` — short note explaining where the JSON came from, the CC BY 4.0 license, link to the source repo and to WotC's SRD.
- Frontend attribution added in Phase 3 (small footer line).

### 0.8 — Parametrized validation tests (Phase 0 gate)

**This is the final step of Phase 0. When this passes, Phase 0 is done and we move to Phase 1.** Until it passes, the parser output isn't trusted and nothing downstream can start.

New file: `api-site/modules/characters/tests/seed_data/test_srd_5_2_1.py`

For every parsed entry in every JSON file, run it through its Pydantic model in a parametrized test. Per-entity test IDs make failures instantly identifiable.

```python
# api-site/modules/characters/tests/seed_data/test_srd_5_2_1.py

import json
import pytest
from pathlib import Path
from shared.rulesets.models import (
    SkillsFile, FeatsFile, SpeciesFile, BackgroundsFile, ClassesFile,
    SkillDefinition, FeatDefinition, SpeciesDefinition,
    BackgroundDefinition, ClassDefinition,
)

SEED_DIR = Path(__file__).resolve().parents[2] / "seed_data" / "srd_5_2_1"

def _entries(filename: str, list_key: str):
    with open(SEED_DIR / filename) as f:
        return json.load(f)[list_key]


# --- Per-entity model validation ---

@pytest.mark.parametrize("entry", _entries("skills.json", "skills"), ids=lambda e: e["code"])
def test_skill_model(entry):
    SkillDefinition.model_validate(entry)

@pytest.mark.parametrize("entry", _entries("feats.json", "feats"), ids=lambda e: e["code"])
def test_feat_model(entry):
    FeatDefinition.model_validate(entry)

@pytest.mark.parametrize("entry", _entries("species.json", "species"), ids=lambda e: e["code"])
def test_species_model(entry):
    SpeciesDefinition.model_validate(entry)

@pytest.mark.parametrize("entry", _entries("backgrounds.json", "backgrounds"), ids=lambda e: e["code"])
def test_background_model(entry):
    BackgroundDefinition.model_validate(entry)

@pytest.mark.parametrize("entry", _entries("classes.json", "classes"), ids=lambda e: e["code"])
def test_class_model(entry):
    ClassDefinition.model_validate(entry)


# --- Wrapper file validation ---

@pytest.mark.parametrize("filename,model", [
    ("skills.json", SkillsFile),
    ("feats.json", FeatsFile),
    ("species.json", SpeciesFile),
    ("backgrounds.json", BackgroundsFile),
    ("classes.json", ClassesFile),
])
def test_file_wrapper_validates(filename, model):
    with open(SEED_DIR / filename) as f:
        model.model_validate(json.load(f))


# --- Cross-file integrity (codes resolve across files) ---

def test_every_background_origin_feat_resolves():
    feat_codes = {f["code"] for f in _entries("feats.json", "feats")}
    for bg in _entries("backgrounds.json", "backgrounds"):
        assert bg["origin_feat_code"] in feat_codes, \
            f"Background '{bg['code']}' references unknown feat '{bg['origin_feat_code']}'"

def test_every_background_skill_resolves():
    skill_codes = {s["code"] for s in _entries("skills.json", "skills")}
    for bg in _entries("backgrounds.json", "backgrounds"):
        for skill in bg["skill_proficiencies"]:
            assert skill in skill_codes, \
                f"Background '{bg['code']}' references unknown skill '{skill}'"

def test_every_class_skill_choice_resolves():
    skill_codes = {s["code"] for s in _entries("skills.json", "skills")}
    for cls in _entries("classes.json", "classes"):
        for skill in cls["skill_choices"]["from"]:
            assert skill in skill_codes, \
                f"Class '{cls['code']}' skill choice references unknown skill '{skill}'"


# --- Structural invariants (coverage sanity) ---

def test_all_twelve_classes_present():
    codes = {c["code"] for c in _entries("classes.json", "classes")}
    assert len(codes) == 12, f"Expected 12 classes, got {len(codes)}: {codes}"

def test_every_class_has_twenty_levels():
    for cls in _entries("classes.json", "classes"):
        levels = cls["features_by_level"]
        assert set(levels.keys()) == {str(i) for i in range(1, 21)}, \
            f"Class '{cls['code']}' has incomplete level progression"
```

**Why parametrize, not loop:** pytest treats each entry as an independent test case. Output on failure pinpoints the problem:
```
test_class_model[barbarian] PASSED
test_class_model[bard] PASSED
test_class_model[wizard] FAILED — features_by_level.5.class_specific: invalid value type for "Spell Slots"
```

**When these tests run:** part of the standard pytest suite, so every PR that touches the parser or the JSON files re-validates the whole corpus. Failure blocks the PR.

**Phase 0 gate / acceptance criteria:** every parametrized test in this file passes against the full parsed JSON. No skips, no xfails. The PR delivering Phase 0 includes the vendored submodule, the parser, the committed JSON, the Pydantic models, the attribution README, and these tests in one bundle — all green together or not at all. **Only when this test file is green do we start Phase 1.**

---

## Phase 1 — Backend: schema rewrite, registry, ruleset strategies

Goal: replace the character schema, drop old characters, load JSON into an in-memory registry at startup, expose ruleset math via strategies.

### 1.1 — Alembic migration

**One destructive migration.** Generate via `docker exec api-site-dev alembic revision --autogenerate -m "character_v2_schema"` (CLAUDE.md: never hand-write migrations).

The migration must:

1. **Drop all character data** (the user explicitly approved this):
   - `DELETE FROM character_class_entries`
   - `DELETE FROM character_ability_scores`
   - `DELETE FROM characters`
2. **Drop the `dnd_classes` lookup table** — classes are now in JSON, no FK needed.
3. **Keep `dnd_abilities`** — universal across editions, used by `character_ability_scores`.
4. **Create `editions` table:**
   ```sql
   editions (
     id SERIAL PRIMARY KEY,
     code VARCHAR(50) UNIQUE NOT NULL,
     name VARCHAR(100) NOT NULL,
     version VARCHAR(20) NOT NULL,
     is_active BOOLEAN DEFAULT TRUE
   )
   ```
   Seed: one row, `('dnd_2024', 'D&D 2024 (5.5e)', '5.2.1', true)`.
5. **Recreate `characters` with the v2 shape:**
   ```sql
   characters (
     id UUID PRIMARY KEY,
     user_id UUID FK → users.id NOT NULL,
     edition_id INT FK → editions.id NOT NULL,
     active_in_campaign_id UUID FK → campaigns.id ON DELETE SET NULL,

     character_name VARCHAR(50) NOT NULL,
     species_code VARCHAR(50) NOT NULL,
     background_code VARCHAR(50) NOT NULL,

     level INT NOT NULL DEFAULT 1,
     xp INT NOT NULL DEFAULT 0,

     hp_max INT NOT NULL,
     hp_current INT NOT NULL,
     hp_temp INT NOT NULL DEFAULT 0,
     ac INT NOT NULL,

     death_save_successes SMALLINT NOT NULL DEFAULT 0,
     death_save_failures SMALLINT NOT NULL DEFAULT 0,
     inspiration BOOLEAN NOT NULL DEFAULT FALSE,
     status_effects TEXT[] NOT NULL DEFAULT '{}',
     is_alive BOOLEAN NOT NULL DEFAULT TRUE,

     speed INT NOT NULL,
     size VARCHAR(10) NOT NULL,
     languages TEXT[] NOT NULL DEFAULT '{}',

     is_draft BOOLEAN NOT NULL DEFAULT TRUE,
     creation_step VARCHAR(30),

     created_at TIMESTAMP NOT NULL,
     updated_at TIMESTAMP NOT NULL,
     is_deleted BOOLEAN NOT NULL DEFAULT FALSE
   )
   ```
6. **Recreate `character_class_entries`:**
   ```sql
   character_class_entries (
     id UUID PRIMARY KEY,
     character_id UUID FK → characters.id ON DELETE CASCADE,
     class_code VARCHAR(50) NOT NULL,
     level INT NOT NULL,
     is_primary BOOLEAN NOT NULL DEFAULT FALSE,
     UNIQUE (character_id, class_code)
   )
   ```
7. **New: `character_skill_proficiencies`:**
   ```sql
   character_skill_proficiencies (
     id UUID PRIMARY KEY,
     character_id UUID FK → characters.id ON DELETE CASCADE,
     skill_code VARCHAR(50) NOT NULL,
     source VARCHAR(20) NOT NULL,    -- CLASS | BACKGROUND | FEAT | SPECIES
     expertise BOOLEAN NOT NULL DEFAULT FALSE,
     UNIQUE (character_id, skill_code)
   )
   ```
8. **New: `character_feat_acquisitions`:**
   ```sql
   character_feat_acquisitions (
     id UUID PRIMARY KEY,
     character_id UUID FK → characters.id ON DELETE CASCADE,
     feat_code VARCHAR(50) NOT NULL,
     acquired_at_level INT NOT NULL,
     source VARCHAR(20) NOT NULL,    -- BACKGROUND_ORIGIN | ASI | OTHER
     UNIQUE (character_id, feat_code, acquired_at_level)
   )
   ```
9. **New: `character_choices_log`** — audit trail of decisions made during creation and level-up:
   ```sql
   character_choices_log (
     id UUID PRIMARY KEY,
     character_id UUID FK → characters.id ON DELETE CASCADE,
     level INT NOT NULL,
     choice_type VARCHAR(30) NOT NULL,   -- ASI | FEAT | SKILL | HP_ROLL | ABILITY_INCREASE
     choice_data JSONB NOT NULL,
     created_at TIMESTAMP NOT NULL
   )
   ```
10. **Add `edition_id` FK to `campaigns`** — characters in a campaign must match. Migration sets all existing campaigns to the 5.5e edition row.

Remember to import all new models in [api-site/alembic/env.py](api-site/alembic/env.py) so autogenerate picks them up.

### 1.2 — Domain model rewrite

Replace [character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py) entirely. Key changes from the current shape:

- **Drop the `CharacterRace`, `CharacterClass`, `CharacterBackground` enums.** Codes are validated against the registry at command level, not by Python type.
- `CharacterAggregate` gains: `edition_id`, `species_code`, `background_code`, `xp`, `hp_temp`, `speed`, `size`, `languages`, `death_save_successes`, `death_save_failures`, `inspiration`, `status_effects`, `is_draft`, `creation_step`.
- New value objects: `SkillProficiency(skill_code, source, expertise)`, `FeatAcquisition(feat_code, level, source)`, `ClassEntry(class_code, level, is_primary)`.
- Methods: `take_damage()`, `heal()`, `apply_temp_hp()`, `roll_death_save_success()`, `roll_death_save_failure()`, `reset_death_saves()`, `add_status(text)`, `remove_status(text)`, `set_inspiration(bool)`, `award_xp(amount)`, `level_up(...)`, `apply_asi(...)`, `take_feat(...)`.
- The aggregate **does not embed ruleset math**. It calls into a `RulesetStrategy` injected via command / supplied by the registry.

### 1.3 — Ruleset registry & strategies

New module: `api-site/shared/rulesets/`.

```
shared/rulesets/
├── __init__.py
├── models.py            # Pydantic models (defined in Phase 0.6) — the schema authority
├── registry.py          # RulesetRegistry — loads JSON via Pydantic models at startup
├── strategy.py          # RulesetStrategy abstract base
└── dnd_2024.py          # Dnd2024Ruleset concrete impl
```

**`RulesetRegistry`:**
- Singleton, initialised at FastAPI startup via lifespan handler in [main.py](api-site/main.py)
- Reads every `editions` row, resolves `code` → `seed_data/<code>/` directory, loads all JSON files via the **Pydantic file-wrapper models** from Phase 0.6 (`SkillsFile.model_validate(json.load(...))` etc.). The registry stores parsed typed instances (`ClassDefinition`, `SpeciesDefinition`, …) keyed by code, never raw dicts.
- Validates `schema_version` matches what the parser produced.
- Exposes:
  - `get_class(edition_code, class_code) → ClassDefinition`
  - `get_species(edition_code, species_code) → SpeciesDefinition`
  - `get_background(edition_code, background_code) → BackgroundDefinition`
  - `get_feat(edition_code, feat_code) → FeatDefinition`
  - `get_skill(edition_code, skill_code) → SkillDefinition`
  - `list_classes(edition_code)`, `list_species(edition_code)`, etc.
  - `get_ruleset(edition_code) → RulesetStrategy`
- Fails fast on boot if any JSON file is missing, fails Pydantic validation, or has dangling cross-refs (e.g. a background pointing at a feat code that doesn't exist).

**`RulesetStrategy`** (abstract):
- `xp_for_level(level: int) → int` — XP threshold table
- `level_for_xp(xp: int) → int`
- `proficiency_bonus(level: int) → int`
- `asi_levels_for_class(class_code: str) → List[int]`
- `pending_asi_count(character) → int` — counts ASIs unlocked but not yet spent
- `compute_skill_modifier(character, skill_code) → int`
- `compute_save_modifier(character, ability_code) → int`
- `compute_initiative(character) → int`
- `hit_die_for_class(class_code: str) → int`
- `level_up_hp_options(character, class_code) → {avg: int, max_roll: int}`

**`Dnd2024Ruleset`** — concrete implementation following 2024 rules. Holds the XP→level table, prof bonus table, ASI calculation logic.

### 1.4 — Repository rewrite

[character_repository.py](api-site/modules/characters/repositories/character_repository.py) gains methods for the new join tables. Aggregate↔ORM translation handles the new fields. Standard pattern: repository calls `CharacterAggregate.from_persistence()` directly, no separate mapper file (per CLAUDE.md).

### 1.5 — App startup validation

Add to the FastAPI lifespan in [main.py](api-site/main.py):
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    RulesetRegistry.initialize()  # raises if any JSON fails to load/validate
    yield
```

---

## Phase 2 — Backend: creation, autosave, runtime, level-up APIs

### 2.1 — Reference data endpoints (read JSON via registry)

New endpoints under [characters/api/endpoints.py](api-site/modules/characters/api/endpoints.py):

- `GET /api/editions` — list active editions
- `GET /api/editions/{edition_code}/classes`
- `GET /api/editions/{edition_code}/species`
- `GET /api/editions/{edition_code}/backgrounds`
- `GET /api/editions/{edition_code}/feats?category=origin`
- `GET /api/editions/{edition_code}/skills`

These don't touch PostgreSQL — they're thin wrappers around the registry. **Response schemas reuse the Pydantic models from Phase 0.6 directly** (e.g. `GET /editions/:code/classes` returns `list[ClassDefinition]`). No DTO mirroring; the same model serves the parser, the registry, and the API.

### 2.2 — Draft / autosave endpoints

- `POST /api/characters/draft` — body: `{ edition_code, name }`. Creates a draft character row with minimal fields, returns the ID + draft state.
- `PATCH /api/characters/draft/{id}` — body: partial fields representing the current step's data. Validates against registry. Updates the character row + related join tables. Returns the updated aggregate.
- `POST /api/characters/draft/{id}/finalize` — server-side validation that the character is complete (required fields, derived stats computed, choices consistent). Flips `is_draft = false`. Returns the finalized character.
- `DELETE /api/characters/draft/{id}` — discard.

Commands:
- `CreateCharacterDraft`
- `UpdateCharacterDraft` — accepts a `step` enum + the step's payload, dispatches to per-step handlers on the aggregate
- `FinalizeCharacterDraft`

### 2.3 — Runtime endpoints (HP/XP/death saves/inspiration/statuses)

- `PATCH /api/characters/{id}/runtime` — body: any subset of `{ hp_current, hp_temp, xp, inspiration, status_effects, death_save_successes, death_save_failures, is_alive }`. One endpoint for all live edits.
- Server-side rules:
  - `hp_current = 0` → reset death save counters when next damage taken; aggregate tracks the "dying" sub-state
  - `hp_current > 0` → death saves auto-reset
  - `xp` updates trigger a computed `pending_level_up` flag on the response (no auto-level — see 2.4)

### 2.4 — Level-up endpoint

- `GET /api/characters/{id}/level-up` — returns the pending level-up package (what's available: HP roll/average values from ruleset, whether this level is an ASI level for any class, which class can level if multi-classed)
- `POST /api/characters/{id}/level-up` — body: `{ class_code, hp_choice: "average" | "roll", roll_value?, asi_choice?: {...}, feat_choice?: {feat_code}, skill_choice?: [...] }`. Server applies all changes atomically, writes to `character_choices_log`, returns updated character.

Command: `LevelUpCharacter` — orchestrates aggregate methods + writes audit log entry.

### 2.5 — Listing & DM party view

- `GET /api/characters/me` — current user's characters (draft + finalized)
- `GET /api/campaigns/{campaign_id}/party` — finalized characters with `active_in_campaign_id = :campaign_id`. Used by the runtime "Character" tab (player sees own) and the DM read-only party view.

Authorization: party endpoint requires the requester is either the DM of the campaign **or** a player whose character is in `active_in_campaign_id`.

### 2.6 — Tests

- Unit tests on `Dnd2024Ruleset` — XP table, prof bonus, ASI levels, skill modifier, save modifier
- Unit tests on registry — fails to load on malformed JSON, fails on dangling cross-refs
- Aggregate tests — take_damage / heal / death save flow, level-up flow with ASI, multi-class level distribution
- API tests on draft endpoints — autosave round-trip, finalize validation, runtime edit authorization

---

## Phase 3 — Frontend: multi-step creation wizard inside authenticated layout

### 3.1 — Move character routes into `(authenticated)` route group

Per the [shared-authenticated-layout.md](.claude/plans/shared-authenticated-layout.md) plan, the `(authenticated)` route group provides shared SiteHeader and auth. Move:

```
app/(authenticated)/character/
├── create/
│   └── page.js
└── [id]/
    └── page.js          (replaces /character/edit/[id])
```

Delete the standalone `app/character/create/` and `app/character/edit/[id]/` paths. Re-point any internal links (the only one is the "create character" CTA from the campaign character-pick modal — search for `/character/create` in [app/dashboard/](rollplay/app/dashboard/) and update).

### 3.2 — Wizard structure

New file: `app/(authenticated)/character/create/CharacterWizard.js`

Wizard steps (single-page with internal step state, URL hash for deep-linking):

1. **Edition** — for now only D&D 2024 is listed; pick required to advance. Locks the row's edition_id.
2. **Identity** — name, species (dropdown from `/editions/dnd_2024/species`). On species pick: derived `speed`, `size`, `default_languages` shown read-only; `language_choices` resolved with extra dropdowns.
3. **Class** — primary class pick + level (default 1). Optional "add another class" button for multi-class. Each class shows its hit die, saving-throw profs, skill choice list. Skill picks for each class made here, count enforced from `class.skill_choices.count`.
4. **Background** — dropdown from `/editions/dnd_2024/backgrounds`. On pick: shows the granted Origin Feat (read-only), the two granted skill proficiencies (auto-added), tool proficiency, ability-score options. Player chooses +2/+1 vs +1/+1/+1 over the listed abilities.
5. **Ability Scores** — point-buy / standard array / manual entry. Existing [PointBuyCalculator](rollplay/app/character/components/PointBuyCalculator.js) and [AbilityScoreBuilder](rollplay/app/character/components/AbilityScoreBuilder.js) components can be reused, refactored to read background bonuses from the draft instead of separate state.
6. **Review** — full sheet preview, derived stats computed via a frontend mirror of the ruleset (or via a `GET /draft/{id}/preview` server endpoint). HP_max computed: `class.hit_die + CON_mod` at level 1. AC computed: defaults to `10 + DEX_mod` or class unarmored-defense formula if applicable. "Finalize" button submits to `/api/characters/draft/{id}/finalize`.

### 3.3 — Autosave

Each step uses a TanStack `useMutation` calling `PATCH /api/characters/draft/{id}` with the step's payload. Debounced (300ms) on field changes, or on step-advance commit. Visual feedback: small "Saved" / "Saving..." indicator in the wizard header.

If the user closes the tab and returns, the wizard resumes at `creation_step` from the draft.

### 3.4 — Hooks & queries

New: `app/(authenticated)/character/hooks/`
- `useEditions()` — query `/api/editions`
- `useEditionClasses(editionCode)` — query `/api/editions/:code/classes`
- `useEditionSpecies(editionCode)`
- `useEditionBackgrounds(editionCode)`
- `useEditionFeats(editionCode, category?)`
- `useEditionSkills(editionCode)`
- `useCharacterDraft(id)` — query `/api/characters/draft/:id`
- `useUpdateDraft(id)` — debounced mutation
- `useFinalizeDraft(id)` — mutation

All using `authFetch` per CLAUDE.md.

### 3.5 — Visual / UX

- Wizard chrome: progress strip across the top showing step 1–6, current step highlighted; "Back" / "Next" buttons at the bottom; the existing dashboard layout's SiteHeader stays at the very top.
- Style: existing `THEME` and `STYLES` from [colorTheme.js](rollplay/app/styles/colorTheme.js). Headers via [constants.js](rollplay/app/styles/constants.js) `PANEL_TITLE` / `PANEL_HEADER`. Inputs via existing form patterns elsewhere in dashboard.
- Headless UI: use existing `Combobox` from [shared/components/](rollplay/app/shared/components/) for species / background / class selection (searchable dropdowns).
- SRD attribution: small footer line on the wizard pages — "Content from D&D SRD 5.2.1, © Wizards of the Coast, used under CC BY 4.0."

### 3.6 — Edit existing character

`app/(authenticated)/character/[id]/page.js` shows the finalized sheet (read-only display matching the runtime tab layout from Phase 4 — same component, different parent). Editing a finalized character is limited to identity (name) for now; structural edits require dropping and recreating. (Out of scope for this plan: full edit-after-finalize.)

---

## Phase 4 — Runtime: "Character" tab in active game session

Goal: in the active game session UI, a new tab where the player sees and edits their own character.

### 4.1 — Tab registration

The game session UI is at [app/game/](rollplay/app/game/). Locate the tab system (likely tabs in the game session sidebar or a tab nav) and register a new tab `Character` visible to seated players who have an active character on this campaign.

### 4.2 — Character sheet component

New: `app/game/components/CharacterSheet.js` — reusable for both the player's own runtime tab and the DM read-only view.

Sections:
- **Header**: name, class summary (`Barbarian 5 / Rogue 2`), species, background, edition badge
- **Vitals**: HP current / max / temp, AC, Speed, Inspiration toggle (5.5e Heroic Inspiration — yellow lightning bolt icon), death save tracker (3 success boxes / 3 failure boxes — only rendered when HP=0)
- **Ability scores**: 6 ability score blocks with modifier; click-to-roll behaviour (uses existing dice rolling infra)
- **Saving throws**: 6 saves with prof-marked dots; modifier from `compute_save_modifier`
- **Skills**: full skill list, prof-marked dots, expertise marked separately, modifier from `compute_skill_modifier`. Skill list is for the character's edition.
- **Statuses**: pill list of free-text strings; add/remove buttons
- **XP**: current XP, threshold for next level, "Level Up" CTA when crossed
- **Feats**: list of feat names + tooltip descriptions
- **Languages, proficiencies**: read-only lists

### 4.3 — Edit controls (player-only on their own sheet)

- HP +/- stepper, "Take damage" / "Heal" inline inputs
- Temp HP input
- Inspiration toggle
- Status pills: input box + add button; X to remove
- Death save check boxes (when HP=0): click to mark success/failure; system handles the "3 successes → stable / 3 failures → dead" logic via the runtime endpoint
- XP entry (DMs typically award XP via the runtime endpoint as a manual edit)

All edits call `PATCH /api/characters/{id}/runtime`. Optimistic updates via TanStack mutation. Failure → revert + toast.

### 4.4 — Level-up wizard (modal triggered from CTA)

`app/game/components/LevelUpModal.js`:
- Calls `GET /api/characters/{id}/level-up` for the available choices
- Step 1: pick class to level (skipped if single-class)
- Step 2: HP choice (average vs roll — if roll, show a die-roll widget; record the value)
- Step 3: if this is an ASI level for the chosen class — pick ASI (+2 one ability, +1 two abilities, or a feat). Feat dropdown filtered to feats the character qualifies for (prereq check via ruleset).
- Step 4: any class-granted features at this level (display only)
- Submit → `POST /api/characters/{id}/level-up`

---

## Phase 5 — Runtime: DM read-only party view

### 5.1 — Party tab / panel

In the game session UI (DM-only), add a "Party" tab or panel showing read-only sheets for every character in `active_in_campaign_id = this_campaign`.

Reuse the `CharacterSheet.js` component from Phase 4 with a `readOnly={true}` prop that hides all edit controls and the Level Up CTA.

Display: list of party members on the left, selected member's full sheet on the right. Or a horizontal tab bar with one tab per character. Layout decision deferred to implementation — match how other DM panels (initiative tracker etc.) are already laid out.

### 5.2 — Authorization

The `GET /api/campaigns/{campaign_id}/party` endpoint must return 403 if the requester isn't the DM of the campaign or a player in the campaign. DMs see all; players see all (read-only) too — useful for party coordination. Edit endpoints already filter by `user_id == character.user_id`.

---

## Phase 6 — Cleanup

- Delete `app/character/` directory (now under `(authenticated)/character/`)
- Delete the `dnd_classes` ORM model + any imports (replaced by JSON)
- Delete the `CharacterRace`, `CharacterClass`, `CharacterBackground` enums from `character_aggregate.py`
- Remove `_to_character_response` helper if Pydantic `from_attributes = True` + matching field types makes it redundant (per CLAUDE.md schemas convention) — likely retainable as enrichment helper since it joins draft state + ruleset-computed derived values
- Update [tests/test_character_edit_policy.py](api-site/modules/characters/tests/test_character_edit_policy.py) for the new schema
- Update CLAUDE.md only if the section on character module materially diverges — currently it's not in CLAUDE.md so no action needed

---

## Risks & Open Questions

**Risk: parser drift from SRD.** If the SRD repo restructures its markdown (heading levels, table shape), the parser breaks. Mitigation: parser asserts shape on parse and fails loudly, not silently. The vendored submodule is pinned to a specific commit — we control when to upgrade.

**Risk: code-as-FK without DB enforcement.** A character with `class_code = "barbarian"` won't be FK-enforced at the DB layer. If we ever rename codes, characters dangle. Mitigation: codes are a permanent contract once published (same discipline as DB enum values); startup validation pass can optionally scan live characters and assert all codes still resolve in JSON.

**Risk: draft characters proliferate.** Users may abandon drafts indefinitely. Mitigation: index `is_draft + updated_at`; optional background job to expire drafts after N days (not in this plan's scope, but trivial to add).

**Risk: edition lock prevents DM mistakes.** A player creates a character under 5.5e but the campaign is on some hypothetical 6e edition — they can't join. Acceptable: explicit error message at character-attach time. (No mid-life edition swap.)

**Open question: subclasses.** SRD has them; we're skipping. When ready, this is purely additive — extend `classes.json` schema with a `subclasses` field and add a wizard step. No migration required.

**Open question: when to derive vs store.** AC is derived in many cases but currently stored. Keeping `ac` as a stored column for simplicity (player enters it after picking armor); revisit if/when inventory comes into scope.

**Open question: campaign edition gating.** Phase 1.1 adds `campaigns.edition_id`. Do we enforce character.edition_id == campaign.edition_id at the attach endpoint? Yes — adding that check is trivial and prevents nonsense data. Done as part of Phase 2.

---

## Execution Order (recommended)

1. **Phase 0** — vendor + spike + full parser + Pydantic models + parametrized tests + attribution. **Gate: 0.8 parametrized tests must all pass before moving on.**
2. **Phase 1** — migration + registry (loads via the Phase 0 Pydantic models) + strategies + aggregate rewrite (backend self-contained, no UI yet)
3. **Phase 2** — backend APIs (still no UI; reference endpoints return Phase 0 Pydantic models directly)
4. **Phase 3** — frontend creation wizard
5. **Phase 4** — runtime Character tab
6. **Phase 5** — DM party view
7. **Phase 6** — cleanup

Phases 0–2 can be reviewed as a single backend PR. Phase 3 is its own PR. Phases 4–5 can each be small PRs. Phase 6 cleanup folds into whichever PR removes the last consumer.
