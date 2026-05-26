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
        if not character.is_draft:
            raise ValueError("Character is finalised — use the runtime endpoint instead")

        edition_code = character.edition_code
        handler = {
            "identity": self._apply_identity,
            "class": self._apply_class,
            "background": self._apply_background,
            "ability_scores": self._apply_ability_scores,
            "hp_ac": self._apply_hp_ac,
        }.get(step)
        if handler is None:
            raise ValueError(f"Unknown draft step '{step}'")
        handler(character, edition_code, payload)
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
        # Speed/size/languages flow straight from species definition.
        character.apply_species_traits(
            speed=species.speed, size=species.size, languages=languages
        )

    # ------------------------------------------------------------ class

    def _apply_class(self, character, edition_code, payload):
        picks = payload["classes"]
        if not picks:
            raise ValueError("class step needs at least one class")
        new_entries: List[ClassEntry] = []
        new_skills: List[SkillProficiency] = []
        save_codes: set = set()
        total_level = 0
        seen: set = set()
        for i, pick in enumerate(picks):
            class_def = self.registry.get_class(edition_code, pick["class_code"])
            if class_def.code in seen:
                raise ValueError(f"Duplicate class '{class_def.code}'")
            seen.add(class_def.code)
            new_entries.append(ClassEntry(
                class_code=class_def.code,
                level=int(pick["level"]),
                is_primary=bool(pick.get("is_primary", i == 0)),
            ))
            total_level += int(pick["level"])
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
            for sc in chosen_skills:
                new_skills.append(SkillProficiency(skill_code=sc, source="CLASS"))
            # Save proficiencies — only the primary class grants them (5.5e rule).
            if i == 0:
                save_codes.update(class_def.saving_throw_proficiencies)
        if total_level > 20:
            raise ValueError(f"Total class levels {total_level} exceeds 20")
        character.class_entries = new_entries
        character.level = total_level
        # Replace any existing CLASS-source skills with the new picks; keep
        # skills from other sources untouched.
        non_class_skills = [s for s in character.skills if s.source != "CLASS"]
        character.skills = non_class_skills + new_skills
        character.set_save_proficiencies(save_codes)

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
        # Apply ability bumps to the base scores.
        scores = character.ability_scores.to_dict()
        for ab, delta in increases.items():
            scores[ab] = min(20, scores[ab] + delta)
        character.ability_scores = AbilityScores.from_dict(scores)

        # Replace BACKGROUND-source skills with the background's two grants.
        # If the player already has a class/feat/species proficiency in one of
        # the background's skills, skip the duplicate — the unique constraint
        # would reject it and 5.5e expects the player to swap to a different
        # skill in the UI before this row is written.
        non_bg = [s for s in character.skills if s.source != "BACKGROUND"]
        already_proficient = {s.skill_code for s in non_bg}
        bg_skills = [
            SkillProficiency(skill_code=sc, source="BACKGROUND")
            for sc in bg.skill_proficiencies
            if sc not in already_proficient
        ]
        character.skills = non_bg + bg_skills

        # Replace BACKGROUND_ORIGIN feats with the background's origin feat.
        character.feats = [f for f in character.feats if f.source != "BACKGROUND_ORIGIN"]
        character.feats.append(FeatAcquisition(
            feat_code=bg.origin_feat_code,
            level=1,
            source="BACKGROUND_ORIGIN",
        ))

    # ------------------------------------------------------------ ability scores

    def _apply_ability_scores(self, character, edition_code, payload):
        character.ability_scores = AbilityScores(
            strength=int(payload["strength"]),
            dexterity=int(payload["dexterity"]),
            constitution=int(payload["constitution"]),
            intelligence=int(payload["intelligence"]),
            wisdom=int(payload["wisdom"]),
            charisma=int(payload["charisma"]),
        )

    # ------------------------------------------------------------ hp_ac

    def _apply_hp_ac(self, character, edition_code, payload):
        character.hp_max = int(payload["hp_max"])
        character.hp_current = character.hp_max
        character.ac = int(payload["ac"])


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
            con_mod = (character.ability_score("constitution") - 10) // 2
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
                character.apply_asi(increases)
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

        # Skill picks granted at this level (rare — class-feature-driven, e.g. Barbarian's Primal Knowledge at L3)
        if skill_choices:
            for sc in skill_choices:
                character.add_skill_proficiency(sc, source="CLASS")
            self.repository.append_choice_log(
                character_id=character.id,
                level=character.level,
                choice_type="SKILL",
                choice_data={"skill_codes": list(skill_choices)},
                created_at=datetime.utcnow(),
            )

        self.repository.save(character)
        return character
