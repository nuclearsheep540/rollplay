# Session handover — character v2 completeness work

A pickup note for whoever (Claude or human) walks into this plan cold. Captures decisions, where we left off, and a few useful breadcrumbs that aren't in the plan files themselves.

## Where we are (updated — PR 1 + PR 2 done)

**Done & committed:**
- **PR 1** (commit `53e096f`): feat-prereq parser fix + `class_feature` prereq variant + `is_feat_available()` strategy method + two-bucket level-up preview (`qualifying_feats` + `other_feats`). The `warnings: list[str]` rail was **retired** in favour of point-of-choice guidance (see §D.1 / `../core/product-principles.md`).
- **Data verification** (commit `53e096f`): the committed seed JSON had never been content-verified. Ran **2 full verification passes + an exhaustive per-class grid pass**; found and fixed ~16 silent, shape-valid-but-wrong-content bugs (3 repeatable feats, Human/Tiefling size, `primary_ability` truncation → now `list[AbilityCode]`, armor "Light"→"Light armor" incl. stray "and" on Fighter/Paladin, missing `tool_proficiencies`, truncated Orc/Dwarf traits). Lesson recorded: each pass reduces the miss rate but never proves zero — **direct inspection complements agentic passes** (it caught Paladin Weapon Mastery + Fighter/Paladin armor that the agents missed).
- **A.2 subclasses** (commit `53e096f`): parsed deterministically (uniform `### <Class> Subclass: <Name>` H3); all 12 classes.
- **A.3 class feature choices** (commit `231f2df`): authored + verified, merged into `classes.json`.
- **A.4 species sub-choices** (UNCOMMITTED — current working tree): authored + verified, merged into `species.json`.

**Methodology shift (now the standing approach — see memory `feedback_reference_data_author_verify.md`):** the parser is kept ONLY for tabular/structural data; **prose-semantic data (choices, sub-choices) is authored as JSON + verified against source**, NOT regex-parsed. Authored files live at `api-site/scripts/authored/srd_5_2_1/{class_choices,species_subchoices}.json` and are mechanically merged into `classes.json`/`species.json` by `parse_srd.py` (`_merge_authored_choices`, `_merge_species_subchoices`) — those two committed JSON files stay the **single loaded source of truth**. Pydantic validates *shape*, never *content*, so always verify against source.

### Deferrals & cross-PR dependencies discovered during PR 1–2 (DO NOT lose)

1. **Spell-code cross-ref → PR 4 (A.10 spells):** `species.leveled_grants_by_sub_choice` (Elf/Tiefling/Gnome) and `SubclassDefinition.always_prepared_spells_by_level` hold faithful spell *codes* that are **not yet validated**. When `spells.json` lands, add a registry cross-ref that every such code resolves (mirror the existing feat/skill cross-ref check).
2. **Subclass always-prepared spells → PR 4/6:** the `always_prepared_spells_by_level` field exists but is **empty**. Populate when spells land: Cleric Life Domain / Paladin Oath of Devotion are flat tables; **Druid Circle of the Land is choice-dependent (4 land sub-tables)** → irregular, needs special handling.
3. **Catalogue-dependent class choices NOT yet in `class_choices.json`** — add when their catalogues exist: Sorcerer **Metamagic** + Warlock **Invocations**/**Pact Boon** → PR 5 (A.7/A.8); Warlock **Mystic Arcanum**, Wizard spellbook, Bard **Magical Discoveries**, all spell picks → PR 4/6.
4. **`primary_ability` is now `list[AbilityCode]`** (pulled forward from C.6). C.6 multiclass-prereq logic can use it — BUT the or/and semantics ("Strength **or** Dexterity" vs "Dexterity **and** Wisdom") is NOT captured (flat list); C.6 must account for that if the prereq math needs it.
5. **`tool_proficiencies` is raw text** ("Choose 3 Musical Instruments"). The *choice* (Bard 3 instruments / Monk 1 tool) is unstructured — model a structured tool picker later if needed (depends on a tools/instruments catalogue, ~Phase J).
6. ~~Species size pick~~ **RESOLVED (PR 3):** Human/Tiefling `size` sub_choice (Medium/Small) is picked in the wizard and applied in `_apply_identity` (overrides the species default); round-trip tested.
7. **Review / character-sheet display of picks → ONE comprehensive pass later (≈ Phase G). DO NOT FORGET.** `CharacterSheet` (used by ReviewStep + the `[id]` page) shows feats + languages but does **not** render `species_sub_choices` or `class_entries[].sub_choices` — and won't show spells/cantrips/resources until those land. DECISION (user, deliberate): don't update the read-only sheet piecemeal; do it **once**, after all choice/logic data is stored (sub_choices ✓ done; spells PR 4; resources PR 7), resolving choice codes → names via the registry (`useEditionClasses`/`useEditionSpecies`) so labels read cleanly (not "Expertise Level 2: …"). Picks persist correctly today; only the *display* is pending.

**Excluded by design (per §3.0 — NOT deferrals; do not re-add as choices):** per-use/per-attack combat mechanics — Monk Open Hand Technique, Channel Divinity effect selection, Rogue Cunning Strike, Druid Wild Shape forms. These are runtime tactical decisions the table handles.

**PR 3 status:** B.5 sub-flavour storage ✓ + E.3 species sub-choices in wizard ✓ + E.5 class L1 pickers ✓ — the **M1 path is done** (martial L1 character creates end-to-end; picks persist; size override works; visually confirmed). Also fixed a pre-existing skill-dedup bug (background + class both granting a skill → one row; soft-skip per §D.1). **Deferred out of PR 3:** the review-sheet display (#7) and **B.1 subclass tracking** — B.1 is L3-only (no pick at L1), so it bundles with the subclass-PICK flow (PR 9 advancement / PR 10 level-up) rather than shipping as storage-without-a-setter.

**Next action: PR 4 — spell content + spellcasting tables** (the elephant; resolves deferrals #1, #2, and part of #3). Author + verify per the methodology (`feedback_reference_data_author_verify`).

## How to read the bundle

**Read [`../core/product-principles.md`](../core/product-principles.md) first** — the governing product philosophy ("facilitate, don't enforce / freedom from guardrails"). It refines this bundle's §3.0 / Phase D framing (warnings-on-save → proactive guidance at point of choice) and is the source of truth where any plan contradicts it.

1. Read `character-v2-completeness.md` end-to-end. It is the entrypoint.
2. When a specific SRD rule is unclear, consult `srd-edge-case-enumeration.md` (1602 lines, indexed by topic).
3. When unsure whether a feature is already implemented, check `character-v2-current-state-audit.md` first.
4. The original `../character-v2.md` (one level up) is history — the plan that got the codebase to its current `character-v2` branch state. Don't re-litigate its decisions.

## Key decisions made in this planning session

These are NOT to be re-debated without good reason. They're the contract.

1. **Prime directive: facilitate, don't enforce.** The app stores + displays data; the table declares mechanical consequences. Compute when cognitive load is meaningful (feat eligibility across 17 entries, multiclass spell slots, HP recompute on CON). Don't enforce (no auto-decrementing ammo, no blocking attacks, no applying Blinded's disadvantage). Only data invariants block saves. Modelled on D&D Beyond's "structured notebook" behaviour.

2. **Inventory is in scope, magic items are deferred.** Phase J covers a typed item catalogue (weapons, armor, gear, tools, mounts), currency JSONB, and `InventoryItem(item_code, quantity, notes)` on the aggregate. Wizard equipment package picker writes inventory at finalize. Magic items get their own follow-up phase later — when they land, `requires_attunement` is just metadata, not enforcement.

3. **Spells are in scope.** Selection + slot tracking, not effect resolution. PR 4 (spell content parsing) is the largest single piece of work.

4. **Subclasses are in scope** — one per class in the SRD. Schema gains `SubclassDefinition` on `ClassDefinition`; aggregate gains `SubclassEntry`.

5. **Starting at levels > 1 is in scope.** New wizard "starting level" step + an "advancement step" that paginates per-(class, level) choice cards.

6. **No new patterns.** Every change extends an existing pattern (CQRS-lite commands, aggregate value objects, repository replace-style sync, PATCH /runtime endpoint, TanStack hooks, wizard step shape). See §3 of the completeness plan for the catalogue. §3.13 lists what specifically NOT to invent — including a generic `ChoiceGate` component, a `rest_state` JSONB blob, and any mechanical-effect engine.

7. **Not live yet.** Drop tables freely. No migration discipline needed; `alembic revision --autogenerate` per CLAUDE.md is the only rule.

## Tooling breadcrumbs

- **SRD PDF for verification:** `/Users/matt.davey/Downloads/SRD.pdf` (364 pages, official SRD 5.2.1).
- **PDF reading:** the `Read` tool needs poppler-utils which isn't installed on this Mac. Don't install. Use `pypdf` via Bash:
  ```bash
  python3 -c "
  from pypdf import PdfReader
  r = PdfReader('/Users/matt.davey/Downloads/SRD.pdf')
  for p in range(START, END):
      print(f'===== PDF PAGE {p+1} =====')
      print(r.pages[p].extract_text())
  "
  ```
  Note `r.pages` is 0-indexed; SRD page numbers are 1-indexed.
- **Vendor:** `api-site/vendor/srd_5_2_1/` is faithful but limited to the legal CC BY 4.0 content. Don't expect PHB content (most backgrounds, most feats) to appear there.

## Mistakes I made during planning that the user corrected

For pattern recognition next session:

1. **First plan draft proposed a generic `ChoiceGate` React component.** User pushed back: each step renders its own choice UI; refactor *after* a pattern repeats twice, not before. → Removed; §3.13 of completeness.md now bans it explicitly.

2. **First plan draft proposed a `rest_state: dict` JSONB column on the aggregate** for per-rest swappable state. User direction: use typed fields on existing value objects (`ClassEntry.sub_choices`, `SubclassEntry.sub_choices`). → Removed; banned in §3.13.

3. **I initially suggested cutting the feat eligibility filter** when applying the facilitation principle, arguing prereqs are "obvious." User corrected: 17 feats × prereq combos is a real discoverability problem; the player can't know what they qualify for without us telling them. **Compute for discoverability.** → Kept and made an example in §3.0.

4. **I proposed Phase A.5 (typed equipment packages on the registry only)** as a small standalone PR. User pushed back: structured choice without storage is meaningless. → Folded into Phase J as a cohesive slice (catalogue + currency + aggregate + wizard picker + runtime panel).

## Open questions / soft spots in the plan

Worth a re-read with fresh eyes before starting PR 4 (spells):

- Spell content parsing scale (~500 spells) — the plan recommends a robust parser with hand-authored fallbacks for edge cases. If the parser proves brittle, we may end up hand-authoring more than expected.
- Beast catalogue for Druid Wild Shape is deferred to A.11; the Druid runtime sheet may want it sooner than we think.
- **Resolved (no longer open):** the `warnings: list[str]` rail is retired. Canon guidance is delivered proactively at the point of choice (inline hints, "recommended" labels, eligibility filters like `qualifying_feats`), never as a submit-time caution. See `../core/product-principles.md` and §D.1 of the completeness plan.

## How to pick up PR 1 specifically

1. Read [api-site/scripts/parse_srd.py](../../../api-site/scripts/parse_srd.py) — find `_parse_prereq_line` and confirm it exists but emits nothing.
2. Read [api-site/vendor/srd_5_2_1/feats.md](../../../api-site/vendor/srd_5_2_1/feats.md) — note the italic prereq line format like `_General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)_`.
3. Confirm by inspection of [api-site/modules/characters/seed_data/srd_5_2_1/feats.json](../../../api-site/modules/characters/seed_data/srd_5_2_1/feats.json) that all `prerequisites: []` arrays are empty.
4. Trace the parser: where does it walk feat-prereq italics, what does it match against, where does the emission live? The data is being extracted but dropped somewhere — find it.
5. Add a `class_feature` variant to `FeatPrerequisite.type` in [shared/rulesets/models.py](../../../api-site/shared/rulesets/models.py) for "Fighting Style Feature" prereqs.
6. Add parametrized test: every feat whose description starts with `... (Prerequisite:` must have non-empty `prerequisites`.
7. **No `warnings` rail** — retired (see `../core/product-principles.md`). Surface feat eligibility as point-of-choice guidance via the `qualifying_feats` filter (next step), not a violations list on `CharacterResponse`.
8. Update `preview_level_up` ([endpoints.py:421](../../../api-site/modules/characters/api/endpoints.py#L421)) to filter `qualifying_feats` using the new prereq data via the strategy's `is_feat_available()` method (C.1 in the plan).

---

*End of handover. If the conversation that produced this plan is no longer in your context window, you have everything you need to continue.*
