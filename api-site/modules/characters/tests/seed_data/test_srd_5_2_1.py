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
