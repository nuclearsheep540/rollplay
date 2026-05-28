# SRD 5.2.1 Seed Data

This directory contains the parsed JSON files for the **D&D System Reference
Document 5.2.1** (a.k.a. D&D 2024 / 5.5e SRD). These files are committed to the
repo and loaded into the in-memory `RulesetRegistry` at FastAPI startup.

## What's here

| File | Source | Contents |
|---|---|---|
| `skills.json` | `playing-the-game.md` | 18 skills with governing ability |
| `feats.json` | `feats.md` | Origin / General / Fighting Style / Epic Boon feats |
| `species.json` | `character-origins.md` | 9 species with traits, size, speed, languages |
| `backgrounds.json` | `character-origins.md` | 4 backgrounds with origin feat + proficiencies |
| `classes.json` | `classes.md` | 12 classes with 20-level progressions |

## Regenerating

The files are produced by `api-site/scripts/parse_srd.py` from the vendored
markdown source under `api-site/vendor/srd_5_2_1/`. Run from `api-site/`:

```bash
docker exec api-site-dev python -m scripts.parse_srd          # full parse
docker exec api-site-dev python -m scripts.parse_srd --spike  # Barbarian only
```

The parser produces deterministic output (sorted keys, lists ordered by code),
so re-running with no source change produces byte-identical JSON. Commit any
output changes alongside the parser or vendored-source change that caused them.

## Schema authority

The canonical shape of each file is defined by Pydantic models in
`api-site/shared/rulesets/models.py`. Every parsed entry is validated against
its model before write, and again by the parametrized tests in
`modules/characters/tests/seed_data/test_srd_5_2_1.py`.

If the model shape changes, bump `CURRENT_SCHEMA_VERSION` in `models.py` and
re-run the parser — the runtime registry refuses to load a JSON file whose
`schema_version` doesn't match the current model.

## Attribution

This work includes material from the *System Reference Document 5.2.1*
("SRD 5.2.1") by Wizards of the Coast LLC, available at
<https://dnd.wizards.com/resources/systems-reference-document> and licensed
under the **Creative Commons Attribution 4.0 International License**
(<https://creativecommons.org/licenses/by/4.0/legalcode>).

The vendored markdown source comes from the community repo
[downfallx/dnd-5e-srd-markdown](https://github.com/downfallx/dnd-5e-srd-markdown)
(also CC BY 4.0).

Frontend attribution appears as a footer line on character-creation surfaces;
see Phase 3 of `.claude/plans/character-v2.md`.
