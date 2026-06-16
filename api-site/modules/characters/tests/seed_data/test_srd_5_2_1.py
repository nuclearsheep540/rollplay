# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Phase 0 gate — validates every entry in every seed JSON file against its
Pydantic model, plus cross-file integrity and coverage invariants.

When this entire file is green, Phase 0 is done.
"""

import json
from pathlib import Path

import pytest

from shared.rulesets.models import (
    BackgroundDefinition,
    BackgroundsFile,
    ClassDefinition,
    ClassesFile,
    FeatDefinition,
    FeatsFile,
    SkillDefinition,
    SkillsFile,
    SpeciesDefinition,
    SpeciesFile,
)


SEED_DIR = Path(__file__).resolve().parents[2] / "seed_data" / "srd_5_2_1"


def _entries(filename: str, list_key: str):
    with open(SEED_DIR / filename) as f:
        return json.load(f)[list_key]


# --- Per-entity model validation -------------------------------------------- #


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


# --- Wrapper file validation ----------------------------------------------- #


@pytest.mark.parametrize(
    "filename,model",
    [
        ("skills.json", SkillsFile),
        ("feats.json", FeatsFile),
        ("species.json", SpeciesFile),
        ("backgrounds.json", BackgroundsFile),
        ("classes.json", ClassesFile),
    ],
)
def test_file_wrapper_validates(filename, model):
    with open(SEED_DIR / filename) as f:
        model.model_validate(json.load(f))


# --- Cross-file integrity (codes resolve across files) --------------------- #


def test_every_background_origin_feat_resolves():
    feat_codes = {f["code"] for f in _entries("feats.json", "feats")}
    for bg in _entries("backgrounds.json", "backgrounds"):
        assert bg["origin_feat_code"] in feat_codes, (
            f"Background '{bg['code']}' references unknown feat '{bg['origin_feat_code']}'"
        )


def test_every_background_skill_resolves():
    skill_codes = {s["code"] for s in _entries("skills.json", "skills")}
    for bg in _entries("backgrounds.json", "backgrounds"):
        for skill in bg["skill_proficiencies"]:
            assert skill in skill_codes, (
                f"Background '{bg['code']}' references unknown skill '{skill}'"
            )


def test_every_class_skill_choice_resolves():
    skill_codes = {s["code"] for s in _entries("skills.json", "skills")}
    for cls in _entries("classes.json", "classes"):
        for skill in cls["skill_choices"]["from"]:
            assert skill in skill_codes, (
                f"Class '{cls['code']}' skill choice references unknown skill '{skill}'"
            )


# --- Structural invariants (coverage sanity) ------------------------------- #


def test_all_twelve_classes_present():
    codes = {c["code"] for c in _entries("classes.json", "classes")}
    assert len(codes) == 12, f"Expected 12 classes, got {len(codes)}: {codes}"


def test_every_class_has_twenty_levels():
    for cls in _entries("classes.json", "classes"):
        levels = cls["features_by_level"]
        assert set(levels.keys()) == {str(i) for i in range(1, 21)}, (
            f"Class '{cls['code']}' has incomplete level progression"
        )


def test_every_class_has_at_least_four_asi_levels():
    for cls in _entries("classes.json", "classes"):
        assert len(cls["asi_levels"]) >= 4, (
            f"Class '{cls['code']}' only has {len(cls['asi_levels'])} ASI levels — "
            "expected at least 4 (parser likely missed an Ability Score Improvement row)"
        )


def test_every_class_has_one_subclass_with_features():
    for cls in _entries("classes.json", "classes"):
        assert cls["subclass_level"] is not None, f"Class '{cls['code']}' missing subclass_level"
        subs = cls["subclasses"]
        assert len(subs) >= 1, f"Class '{cls['code']}' has no subclass parsed"
        for sub in subs:
            assert sub["features"], f"Subclass '{sub['code']}' of '{cls['code']}' has no features"
            assert all(1 <= f["level"] <= 20 for f in sub["features"])
            assert sub["subclass_level"] == min(f["level"] for f in sub["features"])


def test_known_subclass_shape():
    classes = {c["code"]: c for c in _entries("classes.json", "classes")}
    berserker = classes["barbarian"]["subclasses"][0]
    assert berserker["code"] == "path_of_the_berserker"
    assert berserker["subclass_level"] == 3
    feature_levels = {f["name"]: f["level"] for f in berserker["features"]}
    assert feature_levels.get("Frenzy") == 3


def test_every_feat_with_prerequisite_subheader_is_parsed():
    """Regression guard for the dropped-prerequisites bug.

    The parser once detected a feat's italic category subheader by a literal leading
    underscore, but mistune renders ``_..._`` as an emphasis node and strips the
    underscores — so the subheader (and every ``(Prerequisite: …)`` in it) was silently
    dropped, leaving ``prerequisites: []`` on every feat. Count the subheaders in the
    vendored source that declare a prerequisite and assert the committed JSON has exactly
    that many feats with non-empty prerequisites.
    """
    feats_md = (
        Path(__file__).resolve().parents[4] / "vendor" / "srd_5_2_1" / "feats.md"
    ).read_text(encoding="utf-8")
    declared = feats_md.count("(Prerequisite:")
    parsed = sum(1 for f in _entries("feats.json", "feats") if f["prerequisites"])
    assert declared > 0, "Expected at least one feat with a prerequisite in feats.md"
    assert parsed == declared, (
        f"{declared} feats declare a prerequisite in feats.md but {parsed} have non-empty "
        "prerequisites in feats.json — the parser likely dropped some."
    )


def test_known_feat_prerequisites():
    """Lock the exact prerequisite shapes for a representative feat per type."""
    by_code = {f["code"]: f for f in _entries("feats.json", "feats")}

    # General feat with a level gate + multi-ability 'or' requirement.
    grappler = by_code["grappler"]["prerequisites"]
    assert {"type": "level", "value": 4} in grappler
    assert {
        "type": "ability_any",
        "value": 13,
        "abilities": ["strength", "dexterity"],
    } in grappler

    # Fighting Style feats require the Fighting Style class feature.
    for code in ("archery", "defense", "great_weapon_fighting", "two_weapon_fighting"):
        assert {"type": "class_feature", "feature": "fighting_style"} in (
            by_code[code]["prerequisites"]
        ), f"{code} should require the fighting_style class feature"

    # Epic Boon feats require level 19.
    assert {"type": "level", "value": 19} in by_code["boon_of_combat_prowess"]["prerequisites"]


def test_no_duplicate_codes_within_each_file():
    for filename, key in (
        ("skills.json", "skills"),
        ("feats.json", "feats"),
        ("species.json", "species"),
        ("backgrounds.json", "backgrounds"),
        ("classes.json", "classes"),
    ):
        codes = [e["code"] for e in _entries(filename, key)]
        assert len(codes) == len(set(codes)), (
            f"Duplicate codes in {filename}: "
            f"{sorted(c for c in codes if codes.count(c) > 1)}"
        )
