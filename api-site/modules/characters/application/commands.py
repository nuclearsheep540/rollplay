# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character commands — draft lifecycle, runtime edits, level-up.

Every command takes a CharacterRepository and (where edition-aware work is
involved) a RulesetRegistry — the latter is how commands validate codes the
caller provided and pull rules math via the strategy.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from modules.characters.domain.character_aggregate import (
    AbilityScores,
    CharacterAggregate,
    ClassEntry,
    FeatAcquisition,
    SkillProficiency,
)
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.repositories.edition_repository import EditionRepository
from shared.rulesets.registry import RulesetRegistry


# --------------------------------------------------------------------------- #
# Skill projection
# --------------------------------------------------------------------------- #


def rebuild_character_skills(character: CharacterAggregate, registry: RulesetRegistry) -> None:
    """Recompute ``character.skills`` as the deduped union of EVERY skill-granting choice the
    character has made — the single source of truth for "what skills does this character have".

    Sources, in precedence order (first writer of a code wins; a duplicate collapses, because
    D&D proficiency is binary — there is no stacked/"level 2" skill):
      • each class's level-1 picks          → ClassEntry.chosen_skills            (source=CLASS)
      • each class's feature skill choices  → ClassEntry.sub_choices (skill_proficiency type)
      • species skill sub-choices           → species_sub_choices (skill_proficiency type) (SPECIES)
      • the background's fixed grants        → background_code → background.skill_proficiencies (BACKGROUND)

    Called once at the end of every draft-step save and level-up, so the projection is always a
    pure function of the stored choices — nothing writes ``character.skills`` directly.
    """
    edition = character.edition_code
    result: dict[str, SkillProficiency] = {}

    def add(code: str, source: str) -> None:
        if code and code not in result:
            result[code] = SkillProficiency(skill_code=code, source=source)

    for entry in character.class_entries:
        for code in entry.chosen_skills:
            add(code, "CLASS")
        cls_def = registry.get_class(edition, entry.class_code)
        class_skill_choices = {
            choice.code
            for level in cls_def.features_by_level.values()
            for feature in level.features
            for choice in feature.choices
            if choice.type == "skill_proficiency"
        }
        for choice_code, picks in entry.sub_choices.items():
            if choice_code in class_skill_choices:
                for code in picks:
                    add(code, "CLASS")

    if character.species_code:
        species_def = registry.get_species(edition, character.species_code)
        species_skill_choices = {
            choice.code for choice in species_def.sub_choices if choice.type == "skill_proficiency"
        }
        for choice_code, picks in character.species_sub_choices.items():
            if choice_code in species_skill_choices:
                for code in picks:
                    add(code, "SPECIES")

    if character.background_code:
        bg = registry.get_background(edition, character.background_code)
        for code in bg.skill_proficiencies:
            add(code, "BACKGROUND")

    character.skills = list(result.values())


# --------------------------------------------------------------------------- #
# Draft lifecycle
# --------------------------------------------------------------------------- #


class CreateCharacterDraft:
    """POST /api/characters/draft — opens a blank character row in draft state."""

    def __init__(
        self,
        repository: CharacterRepository,
        edition_repository: EditionRepository,
        registry: RulesetRegistry,
    ):
        self.repository = repository
        self.edition_repository = edition_repository
        self.registry = registry

    def execute(self, *, user_id: UUID, edition_code: str, name: str) -> CharacterAggregate:
        edition = self.edition_repository.get_by_code(edition_code)
        if edition is None or not edition.is_active:
            raise ValueError(f"Unknown or inactive edition '{edition_code}'")
        # Verify the registry has data for this edition (boot would have failed otherwise,
        # but this surfaces a clear error if seed data drifts from the DB).
        self.registry.list_classes(edition_code)
        draft = CharacterAggregate.create_draft(
            user_id=user_id,
            edition_id=edition.id,
            edition_code=edition.code,
            character_name=name,
        )
        self.repository.save(draft)
        return draft


class UpdateCharacterDraft:
    """PATCH /api/characters/draft/{id} — dispatch one wizard step's payload.

    Each step pushes the aggregate forward and recomputes any derived state
    (species traits, save profs from class, skill grants from background, etc.)
    rather than letting the caller hand-write those.
    """

    def __init__(self, repository: CharacterRepository, registry: RulesetRegistry):
        self.repository = repository
        self.registry = registry

    def execute(
        self,
        *,
        character_id: UUID,
        user_id: UUID,
        step: str,
        payload: Dict[str, Any],
    ) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError(f"Character {character_id} not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can update this draft")
        # Lock policy (matches DeleteCharacter): characters claimed by a
        # campaign can't be edited via the wizard. Release from the campaign
        # first. Drafts are never locked, so the create flow is unaffected;
        # finalised-but-unclaimed characters become editable via this path.
        if character.is_locked():
            raise ValueError(
                "Character is locked to a campaign — release it before editing"
            )

        edition_code = character.edition_code
        handler = {
            "identity": self._apply_identity,
            "class": self._apply_class,
            "background": self._apply_background,
            "ability_scores": self._apply_ability_scores,
            "hp_ac": self._apply_hp_ac,
            "spells": self._apply_spells,
            "advancement": self._apply_advancement,
            "rename": self._apply_rename,
        }.get(step)
        if handler is None:
            raise ValueError(f"Unknown draft step '{step}'")
        handler(character, edition_code, payload)
        # Skills are a projection of the choice records — recompute the union after every step so
        # character.skills always reflects the latest class/species/background/feature choices.
        rebuild_character_skills(character, self.registry)
        # ``rename`` is orthogonal to wizard progress — the user can rename
        # at any point without resetting the resumed-step pointer.
        if step != "rename":
            character.set_creation_step(step)
        self.repository.save(character)
        return character

    # ------------------------------------------------------------ identity

    def _apply_identity(self, character, edition_code, payload):
        species = self.registry.get_species(edition_code, payload["species_code"])
        if payload.get("name"):
            character.character_name = payload["name"].strip()
        character.species_code = species.code
        chosen = list(payload.get("chosen_languages", []))
        languages = list(species.default_languages) + chosen
        sub_choices = dict(payload.get("sub_choices", {}))
        # Size defaults to the species' size, but Human/Tiefling offer a Medium/Small
        # pick via the `size` sub-choice (A.4) — apply it when present.
        size = species.size
        size_pick = sub_choices.get("size")
        if size_pick:
            size = size_pick[0].capitalize()
        character.apply_species_traits(speed=species.speed, size=size, languages=languages)
        # Store sub-choice picks faithfully — the UI offers only valid options; per §3.0
        # we don't hard-block here.
        character.species_sub_choices = sub_choices

    # ------------------------------------------------------------ class

    def _apply_class(self, character, edition_code, payload):
        picks = payload["classes"]
        if not picks:
            raise ValueError("class step needs at least one class")
        new_entries: List[ClassEntry] = []
        save_codes: set = set()
        total_level = 0
        seen: set = set()
        for i, pick in enumerate(picks):
            class_def = self.registry.get_class(edition_code, pick["class_code"])
            if class_def.code in seen:
                raise ValueError(f"Duplicate class '{class_def.code}'")
            seen.add(class_def.code)
            # Skill picks — must be drawn from class's offered list and count must match.
            chosen_skills = list(pick.get("chosen_skills", []))
            allowed = set(class_def.skill_choices.source)
            if any(s not in allowed for s in chosen_skills):
                raise ValueError(
                    f"Class '{class_def.code}' offers {sorted(allowed)} — "
                    f"got {chosen_skills}"
                )
            # First class grants its full skill count; multi-classed entries grant
            # the per-class subset that 5.5e defines (usually 0 — skipped here).
            if i == 0 and len(chosen_skills) != class_def.skill_choices.count:
                raise ValueError(
                    f"Class '{class_def.code}' requires choosing "
                    f"{class_def.skill_choices.count} skills, got {len(chosen_skills)}"
                )
            new_entries.append(ClassEntry(
                class_code=class_def.code,
                level=int(pick["level"]),
                is_primary=bool(pick.get("is_primary", i == 0)),
                sub_choices=dict(pick.get("sub_choices", {})),
                chosen_skills=chosen_skills,  # the class's own skill picks live on the entry
            ))
            total_level += int(pick["level"])
            # Save proficiencies — only the primary class grants them (5.5e rule).
            if i == 0:
                save_codes.update(class_def.saving_throw_proficiencies)
        if total_level > 20:
            raise ValueError(f"Total class levels {total_level} exceeds 20")
        character.class_entries = new_entries
        character.level = total_level
        character.set_save_proficiencies(save_codes)
        # character.skills is rebuilt from all choice records by the caller (rebuild_character_skills).

    # ------------------------------------------------------------ background

    def _apply_background(self, character, edition_code, payload):
        bg = self.registry.get_background(edition_code, payload["background_code"])
        increases = {item["ability"]: int(item["increase"]) for item in payload["ability_increases"]}
        total = sum(increases.values())
        # 5.5e backgrounds grant +3 split as +2/+1 or +1/+1/+1 across the 3 ability options.
        if total != 3:
            raise ValueError(f"Background ability_increases must sum to 3 (got {total})")
        valid_pattern = sorted(increases.values()) in ([1, 2], [1, 1, 1])
        if not valid_pattern:
            raise ValueError("Background bonuses must be +2/+1 or +1/+1/+1")
        for ab, _ in increases.items():
            if ab not in bg.ability_scores:
                raise ValueError(
                    f"Background '{bg.code}' only offers "
                    f"{bg.ability_scores}, got {ab}"
                )

        character.background_code = bg.code
        # Record the bonuses as a separate dict — DO NOT bake into ability_scores.
        # The ability_scores step then overwrites the base scores without
        # clobbering these, and the API response surfaces final = base + bonus.
        character.origin_ability_bonuses = {
            ab: int(delta) for ab, delta in increases.items()
        }

        # Background skills are deterministic from background_code; rebuild_character_skills
        # (called by the caller) folds bg.skill_proficiencies into the union and dedups.

        # Replace BACKGROUND_ORIGIN feats with the background's origin feat.
        character.feats = [f for f in character.feats if f.source != "BACKGROUND_ORIGIN"]
        character.feats.append(FeatAcquisition(
            feat_code=bg.origin_feat_code,
            level=1,
            source="BACKGROUND_ORIGIN",
        ))

    # ------------------------------------------------------------ ability scores

    def _apply_ability_scores(self, character, edition_code, payload):
        scores = AbilityScores(
            strength=int(payload["strength"]),
            dexterity=int(payload["dexterity"]),
            constitution=int(payload["constitution"]),
            intelligence=int(payload["intelligence"]),
            wisdom=int(payload["wisdom"]),
            charisma=int(payload["charisma"]),
        )
        method = payload.get("method")
        roll_details = payload.get("roll_details")
        character.set_ability_scores(scores, method=method, roll_details=roll_details)

    # ------------------------------------------------------------ hp_ac

    def _apply_hp_ac(self, character, edition_code, payload):
        character.hp_max = int(payload["hp_max"])
        character.hp_current = character.hp_max
        character.ac = int(payload["ac"])

    # ------------------------------------------------------------ spells

    def _apply_spells(self, character, edition_code, payload):
        """Replace the character's class-sourced spell picks with the player's selections.

        Per class the payload carries a flat list of spell codes (cantrips + leveled); we
        resolve each spell's level via the registry, classify cantrips as ``class_known`` and
        leveled spells as ``class_prepared``, and attribute them to the class + its casting
        ability. Counts are NOT enforced — the wizard surfaces class limits as guidance
        (facilitate, don't enforce). Always-prepared (subclass) and species-granted spells are
        owned by other steps; this one manages only the class picks.
        """
        ruleset = self.registry.get_ruleset(edition_code)
        character_classes = {e.class_code for e in character.class_entries}
        # Resolve + validate ALL picks before mutating, so an unknown class/spell code can't
        # leave the character with class spells cleared-but-not-replaced (validate-before-mutate).
        resolved = []  # (spell_code, level, source, class_code, casting_ability)
        for sel in payload.get("selections", []):
            class_code = sel["class_code"]
            if class_code not in character_classes:
                raise ValueError(
                    f"Spell selection references class '{class_code}' not on this character"
                )
            casting_ability = ruleset.spellcasting_ability(class_code)
            for spell_code in sel.get("spell_codes", []):
                spell = self.registry.get_spell(edition_code, spell_code)  # raises on unknown code
                source = "class_known" if spell.level == 0 else "class_prepared"
                resolved.append((spell.code, spell.level, source, class_code, casting_ability))
        # All inputs valid — now replace the class-sourced spells (other sources untouched).
        character.clear_spells(sources={"class_known", "class_prepared"})
        for spell_code, level, source, class_code, casting_ability in resolved:
            character.learn_spell(
                spell_code, level, source, granted_by=class_code, casting_ability=casting_ability,
            )

    # ------------------------------------------------------------ advancement (E.2)

    def _apply_advancement(self, character, edition_code, payload):
        """Per-level choices for a character created above level 1: subclasses (+ their always-
        prepared spells), feats taken in place of an ASI, and L2+ feature choices. L1 feature
        choices stay on the class step; ability bumps are entered directly on the ability step
        (no cumulative ASI math here). Replace-on-save throughout; validate before mutating.
        """
        ruleset = self.registry.get_ruleset(edition_code)
        char_classes = {e.class_code: e for e in character.class_entries}

        # Validate everything first (validate-before-mutate).
        resolved_subs = []  # (class_code, SubclassDefinition, entry)
        for pick in payload.get("subclasses", []):
            entry = char_classes.get(pick["class_code"])
            if entry is None:
                raise ValueError(
                    f"Subclass pick references class '{pick['class_code']}' not on this character"
                )
            cls_def = self.registry.get_class(edition_code, pick["class_code"])
            sub = next((s for s in cls_def.subclasses if s.code == pick["subclass_code"]), None)
            if sub is None:
                raise ValueError(
                    f"Class '{pick['class_code']}' has no subclass '{pick['subclass_code']}'"
                )
            resolved_subs.append((pick["class_code"], sub, entry))
        for fc in payload.get("feats", []):
            self.registry.get_feat(edition_code, fc["feat_code"])

        # Subclasses (replace) + their always-prepared spells (replace that spell source).
        character.subclasses = []
        character.clear_spells(sources={"always_prepared"})
        for class_code, sub, entry in resolved_subs:
            character.pick_subclass(class_code, sub.code)
            casting_ability = ruleset.spellcasting_ability(class_code)
            for lvl_str, codes in sub.always_prepared_spells_by_level.items():
                if int(lvl_str) <= entry.level:
                    for code in codes:
                        spell = self.registry.get_spell(edition_code, code)
                        character.learn_spell(
                            spell.code, spell.level, "always_prepared",
                            granted_by=class_code, casting_ability=casting_ability,
                        )

        # Feats taken in place of an ASI (replace ASI-source feats).
        character.feats = [f for f in character.feats if f.source != "ASI"]
        for fc in payload.get("feats", []):
            character.take_feat(fc["feat_code"], source="ASI", at_level=int(fc["level"]))

        # L2+ feature choices → merge onto the class entry's sub_choices (preserving L1 picks and
        # each entry's chosen_skills). skill_proficiency-type choices (e.g. Primal Knowledge) are
        # materialised into character.skills by rebuild_character_skills — no special-casing here.
        fc_by_class = payload.get("feature_choices", {})
        if fc_by_class:
            character.class_entries = [
                ClassEntry(
                    e.class_code, e.level, e.is_primary,
                    {**e.sub_choices, **{k: list(v) for k, v in fc_by_class[e.class_code].items()}},
                    e.chosen_skills,
                ) if e.class_code in fc_by_class else e
                for e in character.class_entries
            ]

    # ------------------------------------------------------------ rename

    def _apply_rename(self, character, edition_code, payload):
        """Name-only update from the wizard's persistent name header."""
        name = (payload.get("name") or "").strip()
        if not name:
            raise ValueError("Character name is required")
        if len(name) > 50:
            raise ValueError("Character name too long (max 50)")
        character.character_name = name
        # Don't bump creation_step — rename is orthogonal to wizard progress.


class FinalizeCharacterDraft:
    """POST /api/characters/draft/{id}/finalize — flip is_draft=False after validation."""

    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, *, character_id: UUID, user_id: UUID) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError(f"Character {character_id} not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can finalise this draft")
        character.finalize()
        self.repository.save(character)
        return character


class DiscardCharacterDraft:
    """DELETE /api/characters/draft/{id} — hard-deletes drafts only."""

    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, *, character_id: UUID, user_id: UUID) -> bool:
        character = self.repository.get_by_id(character_id)
        if character is None:
            return False
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can discard this draft")
        if not character.is_draft:
            raise ValueError("Cannot discard a finalised character — use delete instead")
        return self.repository.delete(character_id)


class SetCharacterAvatar:
    """PATCH /api/characters/{id}/avatar — point the character at a library asset.

    The asset must exist, be owned by the same user, and be image-type.
    Uploading itself goes through the asset library's standard 3-step flow;
    this command just links the asset to the character.
    """

    def __init__(
        self,
        repository: CharacterRepository,
        asset_repository,
    ):
        self.repository = repository
        self.asset_repository = asset_repository

    def execute(
        self, *, character_id: UUID, user_id: UUID, asset_id: Optional[UUID]
    ) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError(f"Character {character_id} not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can update this character's avatar")

        if asset_id is not None:
            asset = self.asset_repository.get_by_id(asset_id)
            if asset is None:
                raise ValueError(f"Asset {asset_id} not found")
            if asset.user_id != user_id:
                raise PermissionError("Asset does not belong to this user")
            # MediaAssetType is the enum the asset aggregate carries; compare
            # via ``.value`` so we don't import the enum here.
            asset_type_str = getattr(asset.asset_type, "value", asset.asset_type)
            if asset_type_str != "image":
                raise ValueError(
                    f"Avatar must reference an 'image' asset (got {asset_type_str!r})"
                )

        character.set_avatar_asset(asset_id)
        self.repository.save(character)
        return character


class DeleteCharacter:
    """DELETE /api/characters/{id} — soft-delete a finalised character.

    Backs the dashboard's "Delete character" button. Owner-only, refuses when
    the character is currently locked to a campaign (matches v1 behaviour:
    you have to release first). Drafts go through DiscardCharacterDraft.
    """

    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, *, character_id: UUID, user_id: UUID) -> bool:
        character = self.repository.get_by_id(character_id)
        if character is None:
            return False
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can delete this character")
        if character.is_draft:
            raise ValueError("Use DELETE /draft/{id} to discard a draft")
        # Repository.delete enforces can_be_deleted (rejects locked characters).
        return self.repository.delete(character_id)


# --------------------------------------------------------------------------- #
# Runtime edits
# --------------------------------------------------------------------------- #


class UpdateRuntimeState:
    """PATCH /api/characters/{id}/runtime — partial update of live-session state."""

    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(
        self,
        *,
        character_id: UUID,
        user_id: UUID,
        updates: Dict[str, Any],
    ) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError(f"Character {character_id} not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can update runtime state")
        if character.is_draft:
            raise ValueError("Cannot edit runtime state of a draft character")

        if "hp_current" in updates and updates["hp_current"] is not None:
            new_hp = int(updates["hp_current"])
            delta = new_hp - character.hp_current
            if delta < 0:
                character.take_damage(-delta)
            else:
                character.heal(delta)
            # If the caller set HP explicitly above max, allow it (rare buffs):
            character.hp_current = new_hp
        if "hp_temp" in updates and updates["hp_temp"] is not None:
            character.set_temp_hp(int(updates["hp_temp"]))
        if "xp" in updates and updates["xp"] is not None:
            new_xp = int(updates["xp"])
            if new_xp < character.xp:
                # Allow direct XP correction (e.g. DM rollback) without going through award.
                character.xp = new_xp
            else:
                character.award_xp(new_xp - character.xp)
        if "inspiration" in updates and updates["inspiration"] is not None:
            character.set_inspiration(bool(updates["inspiration"]))
        if "status_effects" in updates and updates["status_effects"] is not None:
            # Whole-list replacement so the frontend can edit pills atomically.
            character.status_effects = []
            for s in updates["status_effects"]:
                character.add_status(s)
        if "death_save_successes" in updates and updates["death_save_successes"] is not None:
            character.death_save_successes = int(updates["death_save_successes"])
        if "death_save_failures" in updates and updates["death_save_failures"] is not None:
            character.death_save_failures = int(updates["death_save_failures"])
        if "is_alive" in updates and updates["is_alive"] is not None:
            if updates["is_alive"]:
                character.resurrect()
            else:
                character.mark_dead()
        if "ac" in updates and updates["ac"] is not None:
            character.ac = int(updates["ac"])
        if "exhaustion_level" in updates and updates["exhaustion_level"] is not None:
            character.set_exhaustion(int(updates["exhaustion_level"]))
        if "resource_usage" in updates and updates["resource_usage"] is not None:
            # Whole-list replacement so the sheet can edit spent counts atomically.
            character.resource_usage = []
            for item in updates["resource_usage"]:
                character.set_resource_usage(item["pool_code"], int(item["current_value"]))
        if "currency" in updates and updates["currency"] is not None:
            # Whole-map replacement (J.2). No enforcement — any int, including negative.
            character.replace_currency(updates["currency"])
        if "inventory" in updates and updates["inventory"] is not None:
            # Whole-list replacement (J.3).
            character.replace_inventory(updates["inventory"])

        self.repository.save(character)
        return character


# --------------------------------------------------------------------------- #
# Level-up
# --------------------------------------------------------------------------- #


class LevelUpCharacter:
    """POST /api/characters/{id}/level-up — apply one level gain atomically."""

    def __init__(self, repository: CharacterRepository, registry: RulesetRegistry):
        self.repository = repository
        self.registry = registry

    def execute(
        self,
        *,
        character_id: UUID,
        user_id: UUID,
        class_code: str,
        hp_choice: str,
        roll_value: Optional[int] = None,
        asi_choice: Optional[Dict[str, Any]] = None,
        feat_choice: Optional[Dict[str, Any]] = None,
        skill_choices: Optional[List[str]] = None,
        subclass_choice: Optional[Dict[str, Any]] = None,
    ) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError(f"Character {character_id} not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("Only the owner can level up this character")
        if character.is_draft:
            raise ValueError("Cannot level up a draft character")

        edition_code = character.edition_code
        ruleset = self.registry.get_ruleset(edition_code)

        if not character.can_level_up(ruleset):
            raise ValueError(
                f"Character has {character.xp} XP and is level {character.level} — "
                "not yet eligible for level-up"
            )
        # Determine which class is gaining the level. Must already be in the
        # progression (multi-classing into a new class is a separate flow).
        entry = next((e for e in character.class_entries if e.class_code == class_code), None)
        if entry is None:
            raise ValueError(
                f"Class '{class_code}' is not in this character's progression. "
                "Multi-classing into a new class is a separate flow."
            )
        target_class_level = entry.level + 1
        asi_levels = ruleset.asi_levels_for_class(class_code)
        is_asi_level = target_class_level in asi_levels

        # HP gain
        hp_options = ruleset.level_up_hp_options(character, class_code)
        if hp_choice == "average":
            hp_gained = hp_options["average"]
        elif hp_choice == "roll":
            if roll_value is None or roll_value < 1:
                raise ValueError("hp_choice='roll' requires a positive roll_value")
            hit_die = ruleset.hit_die_for_class(class_code)
            if roll_value > hit_die:
                raise ValueError(
                    f"roll_value {roll_value} exceeds hit die d{hit_die} for "
                    f"class '{class_code}'"
                )
            con_mod = (character.final_ability_score("constitution") - 10) // 2
            hp_gained = max(1, roll_value + con_mod)
        else:
            raise ValueError(f"Unknown hp_choice '{hp_choice}'")

        character.apply_level_gain(class_code=class_code, hp_gained=hp_gained)

        # Audit log: HP roll
        self.repository.append_choice_log(
            character_id=character.id,
            level=character.level,
            choice_type="HP_ROLL",
            choice_data={
                "class_code": class_code,
                "choice": hp_choice,
                "roll_value": roll_value,
                "hp_gained": hp_gained,
            },
            created_at=datetime.utcnow(),
        )

        # ASI / feat — only if this class's new level is an ASI level
        if is_asi_level:
            if asi_choice and feat_choice:
                raise ValueError("Pick either asi_choice OR feat_choice, not both")
            if not asi_choice and not feat_choice:
                raise ValueError("ASI level requires asi_choice or feat_choice")
            if asi_choice:
                increases = {k: int(v) for k, v in asi_choice["increases"].items()}
                character.apply_asi(increases, ruleset=ruleset)
                self.repository.append_choice_log(
                    character_id=character.id,
                    level=character.level,
                    choice_type="ASI",
                    choice_data={"increases": increases},
                    created_at=datetime.utcnow(),
                )
            elif feat_choice:
                feat_code = feat_choice["feat_code"]
                # Sanity-check feat exists + character qualifies (delegated to ruleset).
                self.registry.get_feat(edition_code, feat_code)
                character.take_feat(feat_code, source="ASI")
                self.repository.append_choice_log(
                    character_id=character.id,
                    level=character.level,
                    choice_type="FEAT",
                    choice_data={"feat_code": feat_code},
                    created_at=datetime.utcnow(),
                )

        # Skill picks granted at this level (rare — class-feature-driven, e.g. Barbarian's Primal
        # Knowledge at L3). Recorded on the leveled class entry's chosen_skills so the skill
        # projection folds them into the union; a duplicate collapses (no stacked proficiency).
        if skill_choices:
            character.class_entries = [
                ClassEntry(
                    e.class_code, e.level, e.is_primary, e.sub_choices,
                    list(dict.fromkeys([*e.chosen_skills, *skill_choices])),
                ) if e.class_code == class_code else e
                for e in character.class_entries
            ]
            self.repository.append_choice_log(
                character_id=character.id,
                level=character.level,
                choice_type="SKILL",
                choice_data={"skill_codes": list(skill_choices)},
                created_at=datetime.utcnow(),
            )

        # Subclass unlocked at this level (F.1) — records the pick + grants its always-prepared
        # spells up to the new class level. Guidance about the canonical level is on the client.
        if subclass_choice:
            sc_class = subclass_choice["class_code"]
            sc_entry = next((e for e in character.class_entries if e.class_code == sc_class), None)
            if sc_entry is None:
                raise ValueError(f"Subclass pick references class '{sc_class}' not on this character")
            sc_def = self.registry.get_class(edition_code, sc_class)
            sub = next((s for s in sc_def.subclasses if s.code == subclass_choice["subclass_code"]), None)
            if sub is None:
                raise ValueError(
                    f"Class '{sc_class}' has no subclass '{subclass_choice['subclass_code']}'"
                )
            character.pick_subclass(sc_class, sub.code)
            casting_ability = ruleset.spellcasting_ability(sc_class)
            for lvl_str, codes in sub.always_prepared_spells_by_level.items():
                if int(lvl_str) <= sc_entry.level:
                    for code in codes:
                        spell = self.registry.get_spell(edition_code, code)
                        character.learn_spell(
                            spell.code, spell.level, "always_prepared",
                            granted_by=sc_class, casting_ability=casting_ability,
                        )
            self.repository.append_choice_log(
                character_id=character.id,
                level=character.level,
                choice_type="SUBCLASS",
                choice_data={"class_code": sc_class, "subclass_code": sub.code},
                created_at=datetime.utcnow(),
            )

        # Reproject skills from the (possibly updated) choice records before persisting.
        rebuild_character_skills(character, self.registry)
        self.repository.save(character)
        return character
