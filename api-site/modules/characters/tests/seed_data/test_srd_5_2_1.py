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
    ArmorDefinition,
    ArmorFile,
    CurrencyDefinition,
    CurrencyFile,
    FeatDefinition,
    FeatsFile,
    ItemDefinition,
    ItemsFile,
    InvocationDefinition,
    InvocationsFile,
    MetamagicDefinition,
    MetamagicFile,
    SkillDefinition,
    SkillsFile,
    WeaponDefinition,
    WeaponsFile,
    SpeciesDefinition,
    SpeciesFile,
    SpellDefinition,
    SpellsFile,
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


@pytest.mark.parametrize("entry", _entries("spells.json", "spells"), ids=lambda e: e["code"])
def test_spell_model(entry):
    SpellDefinition.model_validate(entry)


@pytest.mark.parametrize("entry", _entries("invocations.json", "invocations"), ids=lambda e: e["code"])
def test_invocation_model(entry):
    InvocationDefinition.model_validate(entry)


@pytest.mark.parametrize("entry", _entries("metamagic.json", "metamagic"), ids=lambda e: e["code"])
def test_metamagic_model(entry):
    MetamagicDefinition.model_validate(entry)


@pytest.mark.parametrize("entry", _entries("weapons.json", "weapons"), ids=lambda e: e["code"])
def test_weapon_model(entry):
    WeaponDefinition.model_validate(entry)


@pytest.mark.parametrize("entry", _entries("armor.json", "armor"), ids=lambda e: e["code"])
def test_armor_model(entry):
    ArmorDefinition.model_validate(entry)


@pytest.mark.parametrize("entry", _entries("items.json", "items"), ids=lambda e: e["code"])
def test_item_model(entry):
    ItemDefinition.model_validate(entry)


@pytest.mark.parametrize("entry", _entries("currency.json", "currency"), ids=lambda e: e["code"])
def test_currency_model(entry):
    CurrencyDefinition.model_validate(entry)


def test_item_and_currency_catalogue_shape():
    items = {i["code"]: i for i in _entries("items.json", "items")}
    cats = {}
    for i in items.values():
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    assert set(cats) == {"gear", "tool", "mount"} and len(items) > 80
    assert items["acid"]["cost_cp"] == 2500  # 25 GP
    currency = {c["code"]: c["cp_value"] for c in _entries("currency.json", "currency")}
    assert currency == {"cp": 1, "sp": 10, "ep": 50, "gp": 100, "pp": 1000}


# --- Wrapper file validation ----------------------------------------------- #


@pytest.mark.parametrize(
    "filename,model",
    [
        ("skills.json", SkillsFile),
        ("feats.json", FeatsFile),
        ("species.json", SpeciesFile),
        ("backgrounds.json", BackgroundsFile),
        ("classes.json", ClassesFile),
        ("spells.json", SpellsFile),
        ("invocations.json", InvocationsFile),
        ("metamagic.json", MetamagicFile),
        ("weapons.json", WeaponsFile),
        ("armor.json", ArmorFile),
        ("items.json", ItemsFile),
        ("currency.json", CurrencyFile),
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


def test_subclass_spell_tables_parsed():
    """Deferral #2: domain/oath/patron spell tables → always_prepared_spells_by_level;
    Druid Circle of the Land's four land tables → leveled_grants_by_sub_choice."""
    classes = {c["code"]: c for c in _entries("classes.json", "classes")}

    def subclass(class_code):
        return classes[class_code]["subclasses"][0]

    # Cleric Life Domain — flat table, faithful level→spell mapping.
    cleric_ap = subclass("cleric")["always_prepared_spells_by_level"]
    assert cleric_ap["3"] == ["aid", "bless", "cure_wounds", "lesser_restoration"]
    assert cleric_ap["9"] == ["greater_restoration", "mass_cure_wounds"]

    # The other three flat casters all populate their always-prepared table.
    for code, level3_first in (
        ("paladin", "protection_from_evil_and_good"),
        ("sorcerer", "alter_self"),
        ("warlock", "burning_hands"),
    ):
        ap = subclass(code)["always_prepared_spells_by_level"]
        assert ap and ap["3"][0] == level3_first

    # Druid Circle of the Land — land-dependent, four sub-tables, NOT flat always-prepared.
    druid = subclass("druid")
    assert not druid["always_prepared_spells_by_level"]
    lands = druid["leveled_grants_by_sub_choice"]
    assert set(lands) == {"arid", "polar", "temperate", "tropical"}
    assert lands["arid"]["5"] == ["fireball"]


def test_subclass_spell_codes_resolve():
    """Deferral #2 cross-ref guard: every subclass-granted spell code resolves to a real spell."""
    spell_codes = {s["code"] for s in _entries("spells.json", "spells")}
    for c in _entries("classes.json", "classes"):
        for sub in c["subclasses"]:
            for level, codes in sub["always_prepared_spells_by_level"].items():
                for code in codes:
                    assert code in spell_codes, (
                        f"Subclass '{sub['code']}' L{level} always-prepares unknown spell '{code}'"
                    )
            for opt, by_level in sub["leveled_grants_by_sub_choice"].items():
                for level, codes in by_level.items():
                    for code in codes:
                        assert code in spell_codes, (
                            f"Subclass '{sub['code']}' option '{opt}' L{level} grants unknown spell '{code}'"
                        )


def test_authored_class_feature_choices_merged():
    """A.3: authored choice metadata is folded onto the right features in classes.json."""
    classes = {c["code"]: c for c in _entries("classes.json", "classes")}

    def choices_for(code, level, feature):
        for f in classes[code]["features_by_level"][str(level)]["features"]:
            if f["name"] == feature:
                return f.get("choices", [])
        return []

    # Cleric Divine Order — single_pick of Protector / Thaumaturge.
    divine_order = choices_for("cleric", 1, "Divine Order")
    assert divine_order and divine_order[0]["type"] == "single_pick"
    assert {"protector", "thaumaturge"} <= {o["code"] for o in divine_order[0]["options"]}

    # Fighter Fighting Style — feat_pick resolving from the fighting_style feat category.
    fighting_style = choices_for("fighter", 1, "Fighting Style")
    assert fighting_style and fighting_style[0]["type"] == "feat_pick"
    assert fighting_style[0]["source"] == ["fighting_style"]

    # Paladin Weapon Mastery — the choice the author pass missed and direct inspection caught.
    paladin_wm = choices_for("paladin", 1, "Weapon Mastery")
    assert paladin_wm and paladin_wm[0]["type"] == "weapon_mastery" and paladin_wm[0]["count"] == 2


def test_authored_species_subchoices_merged():
    """A.4: authored species sub-choices + leveled grants merged into species.json."""
    species = {s["code"]: s for s in _entries("species.json", "species")}
    # Uniform shape — every species carries the fields.
    assert all("sub_choices" in s and "leveled_grants_by_sub_choice" in s for s in species.values())

    # Dragonborn Draconic Ancestry — single_pick over the dragon ancestors.
    draconic = species["dragonborn"]["sub_choices"]
    assert draconic and draconic[0]["type"] == "single_pick" and len(draconic[0]["options"]) >= 10

    # Elf High Elf lineage grants a spell at levels 1, 3 and 5.
    high_elf = species["elf"]["leveled_grants_by_sub_choice"].get("high_elf", {})
    assert {"1", "3", "5"} <= set(high_elf)

    # Human offers the Medium/Small size pick plus Skillful + Versatile.
    human_codes = {c["code"] for c in species["human"]["sub_choices"]}
    assert {"size", "skillful", "versatile"} <= human_codes

    # Fixed-trait species correctly carry no sub-choices.
    assert species["dwarf"]["sub_choices"] == []


def test_spellcasting_progression_extracted():
    """A.6: spell columns lifted from class_specific into a typed spellcasting structure."""
    classes = {c["code"]: c for c in _entries("classes.json", "classes")}
    casters = {"bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"}

    for code, c in classes.items():
        if code in casters:
            assert c["spellcasting"] is not None, f"{code} should have spellcasting"
        else:
            assert c["spellcasting"] is None, f"{code} should not have spellcasting"

    # Spell columns must no longer linger in class_specific (moved, not duplicated).
    for c in classes.values():
        for lvl in c["features_by_level"].values():
            for key in lvl["class_specific"]:
                assert "Spell Slots" not in key, key
                assert key not in {"Cantrips", "Prepared Spells", "Slot Level"}, key

    # Full caster: Wizard reaches 9th-level slots at L20 and has cantrips.
    wiz = classes["wizard"]["spellcasting"]
    assert wiz["spell_slots_by_level"]["20"].get("9") == 1
    assert wiz["cantrips_known_by_level"]["1"] == 3
    assert not wiz["pact_slots_by_level"]

    # Pact caster: Warlock uses pact_slots (not regular slots).
    war = classes["warlock"]["spellcasting"]
    assert war["pact_slots_by_level"]["5"] == {"count": 2, "slot_level": 3}
    assert not war["spell_slots_by_level"]

    # Half caster: Paladin has slots only up to 5th and no cantrips.
    pal = classes["paladin"]["spellcasting"]
    assert pal["spell_slots_by_level"]["2"] == {"1": 2}
    assert not pal["cantrips_known_by_level"]


def test_known_spell_shape():
    spells = {s["code"]: s for s in _entries("spells.json", "spells")}
    splash = spells["acid_splash"]
    assert splash["level"] == 0 and splash["school"] == "Evocation"
    assert set(splash["classes"]) >= {"sorcerer", "wizard"}
    assert spells["alarm"]["ritual"] is True  # casting time "1 minute or Ritual"


def test_spell_classes_and_leveled_grants_resolve():
    """Deferral #1 guard: no dangling spell refs.

    Every spell's inline class list resolves to a real class, and every species
    leveled-grant spell code (Elf/Tiefling/Gnome lineages) resolves to a real spell.
    """
    class_codes = {c["code"] for c in _entries("classes.json", "classes")}
    spell_codes = {s["code"] for s in _entries("spells.json", "spells")}
    for s in _entries("spells.json", "spells"):
        for cc in s["classes"]:
            assert cc in class_codes, f"Spell '{s['code']}' references unknown class '{cc}'"
    for sp in _entries("species.json", "species"):
        for opt, by_level in sp.get("leveled_grants_by_sub_choice", {}).items():
            for level, codes in by_level.items():
                for code in codes:
                    assert code in spell_codes, (
                        f"Species '{sp['code']}' lineage '{opt}' L{level} grants unknown spell '{code}'"
                    )


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
        ("invocations.json", "invocations"),
        ("metamagic.json", "metamagic"),
        ("weapons.json", "weapons"),
        ("armor.json", "armor"),
        ("items.json", "items"),
        ("currency.json", "currency"),
    ):
        codes = [e["code"] for e in _entries(filename, key)]
        assert len(codes) == len(set(codes)), (
            f"Duplicate codes in {filename}: "
            f"{sorted(c for c in codes if codes.count(c) > 1)}"
        )


# --- A.9 weapons / armor -------------------------------------------------- #


def test_weapon_catalogue_shape():
    """All SRD weapons across the four categories, with a faithful spot-check."""
    weapons = {w["code"]: w for w in _entries("weapons.json", "weapons")}
    assert len(weapons) == 38
    cats = {}
    for w in weapons.values():
        cats[w["category"]] = cats.get(w["category"], 0) + 1
    assert cats == {"simple_melee": 10, "simple_ranged": 4, "martial_melee": 18, "martial_ranged": 6}
    dagger = weapons["dagger"]
    assert dagger["damage"] == "1d4 Piercing"
    assert dagger["mastery"] == "Nick"
    assert {"Finesse", "Light"} <= set(dagger["properties"])


def test_armor_catalogue_shape():
    """All SRD armor + shield, with the structured AC fields the C.4 math needs."""
    armor = {a["code"]: a for a in _entries("armor.json", "armor")}
    assert len(armor) == 13
    # Light = unlimited Dex (cap None); medium caps at 2; heavy/shield take no Dex (cap 0).
    assert armor["leather_armor"]["dex_cap"] is None and armor["leather_armor"]["base_ac"] == 11
    assert armor["breastplate"]["dex_cap"] == 2 and armor["breastplate"]["category"] == "medium"
    plate = armor["plate_armor"]
    assert plate["base_ac"] == 18 and plate["dex_cap"] == 0
    assert plate["strength_requirement"] == 15 and plate["stealth_disadvantage"] is True
    # Shield is a +2 bonus, not a base AC.
    shield = next(a for a in armor.values() if a["category"] == "shield")
    assert shield["base_ac"] == 2 and shield["dex_cap"] == 0


# --- A.7 / A.8 catalogues -------------------------------------------------- #


def test_invocation_catalogue_shape():
    """A.7: the full SRD invocation set, with the known repeatable + no-prereq entries."""
    inv = {i["code"]: i for i in _entries("invocations.json", "invocations")}
    assert len(inv) == 28
    # The four repeatable invocations.
    assert {c for c, i in inv.items() if i["repeatable"]} == {
        "agonizing_blast", "eldritch_spear", "lessons_of_the_first_ones", "repelling_blast",
    }
    # The five with no prerequisite (incl. the three pacts).
    assert {c for c, i in inv.items() if not i["prerequisite_text"]} == {
        "armor_of_shadows", "eldritch_mind", "pact_of_the_blade", "pact_of_the_chain", "pact_of_the_tome",
    }
    # Spot-check a structured level + invocation cross-ref prerequisite.
    eldritch_smite = inv["eldritch_smite"]["prerequisites"]
    assert {"type": "level", "value": 5} in eldritch_smite
    assert {"type": "invocation", "feature": "pact_of_the_blade"} in eldritch_smite


def test_invocation_cross_refs_resolve():
    """Every invocation prereq that references another invocation resolves to a real one."""
    inv = {i["code"]: i for i in _entries("invocations.json", "invocations")}
    for code, i in inv.items():
        for p in i["prerequisites"]:
            if p["type"] == "invocation":
                assert p["feature"] in inv, f"{code} requires unknown invocation '{p['feature']}'"


def test_metamagic_catalogue_shape():
    """A.8: all ten Metamagic options; Heightened/Quickened cost 2 Sorcery Points, rest cost 1."""
    mm = {m["code"]: m for m in _entries("metamagic.json", "metamagic")}
    assert len(mm) == 10
    assert {c for c, m in mm.items() if m["sorcery_point_cost"] == 2} == {
        "heightened_spell", "quickened_spell",
    }
    assert all(m["sorcery_point_cost"] in (1, 2) for m in mm.values())


def test_invocation_and_metamagic_choices_wired():
    """PR 5 wiring: Warlock L1 gains 1 invocation; Sorcerer L2 gains 2 Metamagic options."""
    classes = {c["code"]: c for c in _entries("classes.json", "classes")}

    def choice(class_code, level, feature):
        for f in classes[class_code]["features_by_level"][str(level)]["features"]:
            if f["name"] == feature:
                return f.get("choices", [])
        return []

    warlock = choice("warlock", 1, "Eldritch Invocations")
    assert warlock and warlock[0]["type"] == "invocation" and warlock[0]["count"] == 1

    sorcerer = choice("sorcerer", 2, "Metamagic")
    assert sorcerer and sorcerer[0]["type"] == "metamagic" and sorcerer[0]["count"] == 2
