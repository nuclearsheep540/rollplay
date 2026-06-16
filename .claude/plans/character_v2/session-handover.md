# Session handover — character v2 completeness work

A pickup note for whoever (Claude or human) walks into this plan cold. Captures decisions, where we left off, and a few useful breadcrumbs that aren't in the plan files themselves.

## Where we are

- The plan bundle is **finalised and ready to execute**. Nothing in it is in-flight.
- Last edit: revised `character-v2-completeness.md` to bake in the "facilitate, don't enforce" prime directive (§3.0) and added Phase J (inventory + currency) as a cohesive slice that includes equipment package picking.
- **Next action: PR 1.** Fix the feat prerequisite parser (Phase A.1) and use the prereq data to populate the `qualifying_feats` eligibility filter on `preview_level_up` (point-of-choice guidance). The `warnings: list[str]` rail is **retired** — see §D.1 / `../core/product-principles.md`.

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
