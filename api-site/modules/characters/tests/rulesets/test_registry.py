# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Registry tests — verifies the singleton loads SRD seed data correctly."""

import json
from pathlib import Path

import pytest

from shared.rulesets.registry import RulesetRegistry


@pytest.fixture(autouse=True)
def _reset_registry():
    """Each registry test starts with a fresh singleton."""
    RulesetRegistry.reset()
    yield
    RulesetRegistry.reset()


def test_initialize_loads_srd_edition():
    reg = RulesetRegistry.initialize()
    assert reg.list_editions() == ["srd_5_2_1"]
    assert len(reg.list_classes("srd_5_2_1")) == 12
    assert len(reg.list_species("srd_5_2_1")) == 9
    assert len(reg.list_backgrounds("srd_5_2_1")) == 4
    assert len(reg.list_skills("srd_5_2_1")) == 18
    # Categories: origin / general / fighting_style / epic_boon.
    assert len(reg.list_feats("srd_5_2_1", category="origin")) == 4


def test_get_class_returns_typed_definition():
    reg = RulesetRegistry.initialize()
    barb = reg.get_class("srd_5_2_1", "barbarian")
    assert barb.primary_ability == ["strength"]
    assert barb.hit_die == 12
    assert barb.asi_levels == [4, 8, 12, 16]
    assert "20" in barb.features_by_level
    assert any(f.name == "Rage" for f in barb.features_by_level["1"].features)


def test_get_ruleset_returns_strategy():
    reg = RulesetRegistry.initialize()
    rs = reg.get_ruleset("srd_5_2_1")
    assert rs.edition_code == "srd_5_2_1"
    assert rs.xp_for_level(1) == 0
    assert rs.proficiency_bonus(1) == 2


def test_unknown_edition_raises():
    reg = RulesetRegistry.initialize()
    with pytest.raises(KeyError):
        reg.get_class("dnd_2030", "wizard")


def test_get_instance_requires_init():
    # _reset_registry has cleared the singleton; pretend the lifespan hasn't run.
    with pytest.raises(RuntimeError, match="not initialized"):
        RulesetRegistry.get_instance()


def test_initialize_fails_on_schema_version_mismatch(tmp_path):
    """Hand-poke a JSON file to declare a future schema_version and expect a refusal.

    Guards against shipping a parser change without re-running it: the registry
    must not silently load a JSON file whose shape may no longer match the
    Pydantic models the rest of the app uses.
    """
    edition_dir = tmp_path / "srd_5_2_1"
    edition_dir.mkdir()
    src = Path("modules/characters/seed_data/srd_5_2_1")
    for fname in ("skills.json", "feats.json", "species.json", "backgrounds.json", "classes.json"):
        data = json.loads((src / fname).read_text())
        if fname == "classes.json":
            data["schema_version"] = 999  # poison
        (edition_dir / fname).write_text(json.dumps(data))

    with pytest.raises(RuntimeError, match="schema_version"):
        RulesetRegistry.initialize(seed_root=tmp_path)


def test_initialize_fails_on_dangling_cross_ref(tmp_path):
    """A background pointing at a non-existent feat should abort boot."""
    edition_dir = tmp_path / "srd_5_2_1"
    edition_dir.mkdir()
    src = Path("modules/characters/seed_data/srd_5_2_1")
    for fname in ("skills.json", "feats.json", "species.json", "backgrounds.json", "classes.json"):
        data = json.loads((src / fname).read_text())
        if fname == "backgrounds.json":
            data["backgrounds"][0]["origin_feat_code"] = "no_such_feat"
        (edition_dir / fname).write_text(json.dumps(data))

    with pytest.raises(RuntimeError, match="unknown origin_feat_code"):
        RulesetRegistry.initialize(seed_root=tmp_path)


def test_initialize_fails_when_seed_dir_missing(tmp_path):
    with pytest.raises(RuntimeError, match="No edition directories"):
        RulesetRegistry.initialize(seed_root=tmp_path)
