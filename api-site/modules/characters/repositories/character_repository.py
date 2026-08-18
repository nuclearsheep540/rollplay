# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Character repository (v2) — handles persistence for the new code-based schema.

Loads via Pydantic-aware aggregate construction (no separate mapper file, per
CLAUDE.md). Maintains read-side compatibility with cross-module callers
(:meth:`get_by_id`, :meth:`get_by_user_id`, :meth:`get_by_active_campaign`,
:meth:`get_user_character_for_campaign`, :meth:`save`, :meth:`delete`).
"""

from __future__ import annotations

from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from modules.characters.domain.character_aggregate import (
    AbilityScores,
    CharacterAggregate,
    ClassEntry,
    FeatAcquisition,
    InventoryItem,
    ResourceUsage,
    SkillProficiency,
    SpellSelection,
    SubclassEntry,
)
from modules.characters.model.character_ability_model import CharacterAbilityScore
from modules.characters.model.character_choices_log_model import CharacterChoiceLog
from modules.characters.model.character_class_model import CharacterClassEntry
from modules.characters.model.character_feat_model import CharacterFeatAcquisition
from modules.characters.model.character_model import Character as CharacterModel
from modules.characters.model.character_save_model import CharacterSaveProficiency
from modules.characters.model.character_resource_model import CharacterResource
from modules.characters.model.character_skill_model import CharacterSkillProficiency
from modules.characters.model.character_inventory_model import CharacterInventoryItem
from modules.characters.model.character_subclass_model import CharacterSubclass
from modules.characters.model.character_spell_model import CharacterSpell
from modules.characters.model.dnd_ability_model import DndAbility


class CharacterRepository:
    """Persistence for the Character aggregate (v2)."""

    def __init__(self, db_session: Session):
        self.db = db_session
        self._ability_lookup: Optional[Dict[str, int]] = None
        self._ability_id_to_name: Optional[Dict[int, str]] = None

    # -------------------------------------------------------------- lookups

    def _get_ability_lookup(self) -> Dict[str, int]:
        """Cache: ability name → row id (used when writing rows)."""
        if self._ability_lookup is None:
            rows = self.db.query(DndAbility).all()
            self._ability_lookup = {row.name.lower(): row.id for row in rows}
            self._ability_id_to_name = {row.id: row.name.lower() for row in rows}
        return self._ability_lookup

    def _get_ability_id_to_name(self) -> Dict[int, str]:
        if self._ability_id_to_name is None:
            self._get_ability_lookup()
        return self._ability_id_to_name  # type: ignore[return-value]

    def _query(self):
        return (
            self.db.query(CharacterModel)
            .options(
                selectinload(CharacterModel.class_entries),
                selectinload(CharacterModel.ability_score_entries),
                selectinload(CharacterModel.save_proficiency_entries),
                selectinload(CharacterModel.skill_entries),
                selectinload(CharacterModel.feat_entries),
                selectinload(CharacterModel.spell_entries),
                selectinload(CharacterModel.resource_entries),
                selectinload(CharacterModel.subclass_entries),
                selectinload(CharacterModel.inventory_entries),
                selectinload(CharacterModel.choice_log_entries),
            )
        )

    # -------------------------------------------------------------- ORM → aggregate

    def _model_to_aggregate(self, model: CharacterModel) -> CharacterAggregate:
        id_to_name = self._get_ability_id_to_name()

        scores_dict: Dict[str, int] = {}
        origin_bonuses_dict: Dict[str, int] = {}
        for entry in model.ability_score_entries or []:
            name = id_to_name.get(entry.ability_id)
            if name is None:
                continue
            scores_dict[name] = entry.score
            if entry.origin_bonus:
                origin_bonuses_dict[name] = entry.origin_bonus
        ability_scores = (
            AbilityScores.from_dict(scores_dict) if scores_dict else AbilityScores.default()
        )

        save_codes = frozenset(
            id_to_name[entry.ability_id]
            for entry in (model.save_proficiency_entries or [])
            if entry.ability_id in id_to_name
        )

        class_entries = sorted(
            (
                ClassEntry(
                    class_code=e.class_code,
                    level=e.level,
                    is_primary=bool(e.is_primary),
                    sub_choices=e.sub_choices or {},
                    chosen_skills=list(e.chosen_skills or []),
                )
                for e in model.class_entries or []
            ),
            key=lambda e: (not e.is_primary, e.class_code),
        )

        skills = [
            SkillProficiency(
                skill_code=e.skill_code,
                source=e.source,
                expertise=bool(e.expertise),
            )
            for e in model.skill_entries or []
        ]

        feats = [
            FeatAcquisition(
                feat_code=e.feat_code,
                level=e.acquired_at_level,
                source=e.source,
            )
            for e in model.feat_entries or []
        ]

        spells = [
            SpellSelection(
                spell_code=e.spell_code,
                spell_level=int(e.spell_level),
                source=e.source,
                granted_by=e.granted_by or "",
                casting_ability=e.casting_ability,
            )
            for e in model.spell_entries or []
        ]

        resource_usage = [
            ResourceUsage(pool_code=e.pool_code, current_value=int(e.current_value))
            for e in model.resource_entries or []
        ]

        subclasses = [
            SubclassEntry(
                class_code=e.class_code,
                subclass_code=e.subclass_code,
                chosen_at_level=int(e.chosen_at_level),
            )
            for e in model.subclass_entries or []
        ]

        inventory = [
            InventoryItem(
                item_code=e.item_code,
                quantity=int(e.quantity),
                notes=e.notes or "",
            )
            for e in model.inventory_entries or []
        ]

        edition_code = model.edition.code if model.edition is not None else ""
        return CharacterAggregate(
            id=model.id,
            user_id=model.user_id,
            edition_id=model.edition_id,
            edition_code=edition_code,
            active_campaign=model.active_in_campaign_id,
            character_name=model.character_name,
            species_code=model.species_code,
            species_sub_choices=model.species_sub_choices or {},
            background_code=model.background_code,
            class_entries=class_entries,
            ability_scores=ability_scores,
            origin_ability_bonuses=origin_bonuses_dict,
            save_proficiencies=save_codes,
            skills=skills,
            feats=feats,
            spells=spells,
            resource_usage=resource_usage,
            subclasses=subclasses,
            inventory=inventory,
            currency=dict(model.currency or {}),
            level=model.level,
            xp=model.xp,
            hp_max=model.hp_max,
            hp_current=model.hp_current,
            hp_temp=model.hp_temp,
            ac=model.ac,
            death_save_successes=model.death_save_successes,
            death_save_failures=model.death_save_failures,
            inspiration=bool(model.inspiration),
            status_effects=list(model.status_effects or []),
            exhaustion_level=int(model.exhaustion_level or 0),
            is_alive=bool(model.is_alive),
            speed=model.speed,
            size=model.size,
            languages=list(model.languages or []),
            is_draft=bool(model.is_draft),
            creation_step=model.creation_step,
            created_at=model.created_at,
            updated_at=model.updated_at,
            is_deleted=bool(model.is_deleted),
            avatar_asset_id=model.avatar_asset_id,
            # Lifted off the eager-loaded MediaAsset so the API response
            # builder can presign a download URL without a second query.
            avatar_s3_key=(
                model.avatar_asset.s3_key
                if model.avatar_asset is not None
                else None
            ),
            # The avatar image's "token" focal square (tokens v3, decision
            # 36). getattr-guarded: SetCharacterAvatar enforces image-type,
            # but a legacy non-image row must degrade to None, not raise.
            avatar_focal_area=(
                (getattr(model.avatar_asset, "focal_areas", None) or {}).get("token")
                if model.avatar_asset is not None
                else None
            ),
            color=model.color,
            ability_score_method=model.ability_score_method,
            ability_roll_details=(
                dict(model.ability_roll_details)
                if model.ability_roll_details is not None
                else None
            ),
        )

    # -------------------------------------------------------------- reads

    def get_by_id(self, character_id: UUID) -> Optional[CharacterAggregate]:
        model = self._query().filter_by(id=character_id, is_deleted=False).first()
        return self._model_to_aggregate(model) if model else None

    def get_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        models = (
            self._query()
            .filter_by(user_id=user_id, is_deleted=False)
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [self._model_to_aggregate(m) for m in models]

    def get_by_active_campaign(self, campaign_id: UUID) -> List[CharacterAggregate]:
        models = (
            self._query()
            .filter(CharacterModel.active_in_campaign_id == campaign_id)
            .all()
        )
        return [self._model_to_aggregate(m) for m in models]

    def get_user_character_for_campaign(
        self, user_id: UUID, campaign_id: UUID
    ) -> Optional[CharacterAggregate]:
        model = (
            self._query()
            .filter(
                CharacterModel.user_id == user_id,
                CharacterModel.active_in_campaign_id == campaign_id,
                CharacterModel.is_deleted == False,  # noqa: E712
            )
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    # -------------------------------------------------------------- writes

    def save(self, aggregate: CharacterAggregate) -> UUID:
        ability_lookup = self._get_ability_lookup()

        if aggregate.id is None:
            model = CharacterModel(
                user_id=aggregate.user_id,
                edition_id=aggregate.edition_id,
                active_in_campaign_id=aggregate.active_campaign,
                character_name=aggregate.character_name,
                species_code=aggregate.species_code,
                background_code=aggregate.background_code,
                level=aggregate.level,
                xp=aggregate.xp,
                hp_max=aggregate.hp_max,
                hp_current=aggregate.hp_current,
                hp_temp=aggregate.hp_temp,
                ac=aggregate.ac,
                death_save_successes=aggregate.death_save_successes,
                death_save_failures=aggregate.death_save_failures,
                inspiration=aggregate.inspiration,
                status_effects=list(aggregate.status_effects),
                exhaustion_level=aggregate.exhaustion_level,
                currency=dict(aggregate.currency or {}),
                is_alive=aggregate.is_alive,
                speed=aggregate.speed,
                size=aggregate.size,
                languages=list(aggregate.languages),
                is_draft=aggregate.is_draft,
                creation_step=aggregate.creation_step,
                avatar_asset_id=aggregate.avatar_asset_id,
                color=aggregate.color,
                ability_score_method=aggregate.ability_score_method,
                ability_roll_details=aggregate.ability_roll_details,
                species_sub_choices=dict(aggregate.species_sub_choices),
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at,
                is_deleted=aggregate.is_deleted,
            )
            self.db.add(model)
            self.db.flush()
            aggregate.id = model.id
            self._write_all_children(model, aggregate, ability_lookup)
        else:
            model = (
                self._query().filter_by(id=aggregate.id).first()
            )
            if model is None:
                raise ValueError(f"Character {aggregate.id} not found")
            model.user_id = aggregate.user_id
            model.edition_id = aggregate.edition_id
            model.active_in_campaign_id = aggregate.active_campaign
            model.character_name = aggregate.character_name
            model.species_code = aggregate.species_code
            model.background_code = aggregate.background_code
            model.level = aggregate.level
            model.xp = aggregate.xp
            model.hp_max = aggregate.hp_max
            model.hp_current = aggregate.hp_current
            model.hp_temp = aggregate.hp_temp
            model.ac = aggregate.ac
            model.death_save_successes = aggregate.death_save_successes
            model.death_save_failures = aggregate.death_save_failures
            model.inspiration = aggregate.inspiration
            model.status_effects = list(aggregate.status_effects)
            model.exhaustion_level = aggregate.exhaustion_level
            model.currency = dict(aggregate.currency or {})
            model.is_alive = aggregate.is_alive
            model.speed = aggregate.speed
            model.size = aggregate.size
            model.languages = list(aggregate.languages)
            model.is_draft = aggregate.is_draft
            model.creation_step = aggregate.creation_step
            model.avatar_asset_id = aggregate.avatar_asset_id
            model.color = aggregate.color
            model.ability_score_method = aggregate.ability_score_method
            model.ability_roll_details = aggregate.ability_roll_details
            model.species_sub_choices = dict(aggregate.species_sub_choices)
            model.updated_at = aggregate.updated_at
            model.is_deleted = aggregate.is_deleted
            # Replace-style sync for all join tables — these are small and
            # rewriting them per save is simpler than diffing.
            for entry in list(model.class_entries):
                self.db.delete(entry)
            for entry in list(model.ability_score_entries):
                self.db.delete(entry)
            for entry in list(model.save_proficiency_entries):
                self.db.delete(entry)
            for entry in list(model.skill_entries):
                self.db.delete(entry)
            for entry in list(model.feat_entries):
                self.db.delete(entry)
            for entry in list(model.spell_entries):
                self.db.delete(entry)
            for entry in list(model.resource_entries):
                self.db.delete(entry)
            for entry in list(model.subclass_entries):
                self.db.delete(entry)
            for entry in list(model.inventory_entries):
                self.db.delete(entry)
            self.db.flush()
            self._write_all_children(model, aggregate, ability_lookup)

        self.db.commit()
        self.db.refresh(model)
        return model.id

    def _write_all_children(
        self,
        model: CharacterModel,
        aggregate: CharacterAggregate,
        ability_lookup: Dict[str, int],
    ) -> None:
        for entry in aggregate.class_entries:
            self.db.add(CharacterClassEntry(
                character_id=model.id,
                class_code=entry.class_code,
                level=entry.level,
                is_primary=entry.is_primary,
                sub_choices=dict(entry.sub_choices),
                chosen_skills=list(entry.chosen_skills),
            ))
        scores = aggregate.ability_scores.to_dict()
        bonuses = aggregate.origin_ability_bonuses or {}
        for name, score in scores.items():
            ability_id = ability_lookup.get(name)
            if ability_id is None:
                raise RuntimeError(
                    f"Ability lookup missing '{name}' — is the dnd_abilities seed loaded?"
                )
            self.db.add(CharacterAbilityScore(
                character_id=model.id,
                ability_id=ability_id,
                score=score,
                origin_bonus=int(bonuses.get(name, 0)),
            ))
        for code in aggregate.save_proficiencies:
            ability_id = ability_lookup.get(code)
            if ability_id is None:
                continue
            self.db.add(CharacterSaveProficiency(
                character_id=model.id,
                ability_id=ability_id,
            ))
        # Dedupe by skill_code: the (character_id, skill_code) unique constraint allows
        # one row per skill, so a skill granted by more than one source (e.g. BACKGROUND
        # + CLASS both give Athletics) collapses to a single row — soft-skip the duplicate
        # and keep silent (per plan §D.1). Prefer an expertise grant if the sources differ.
        deduped_skills: Dict[str, object] = {}
        for skill in aggregate.skills:
            existing = deduped_skills.get(skill.skill_code)
            if existing is None or (skill.expertise and not existing.expertise):
                deduped_skills[skill.skill_code] = skill
        for skill in deduped_skills.values():
            self.db.add(CharacterSkillProficiency(
                character_id=model.id,
                skill_code=skill.skill_code,
                source=skill.source,
                expertise=skill.expertise,
            ))
        for feat in aggregate.feats:
            self.db.add(CharacterFeatAcquisition(
                character_id=model.id,
                feat_code=feat.feat_code,
                acquired_at_level=feat.level,
                source=feat.source,
            ))
        # Spells are replace-written; the aggregate (learn_spell) already dedupes, so no
        # constraint-driven collapse is needed here (unlike skills).
        for spell in aggregate.spells:
            self.db.add(CharacterSpell(
                character_id=model.id,
                spell_code=spell.spell_code,
                spell_level=spell.spell_level,
                source=spell.source,
                granted_by=spell.granted_by or "",
                casting_ability=spell.casting_ability,
            ))
        for resource in aggregate.resource_usage:
            self.db.add(CharacterResource(
                character_id=model.id,
                pool_code=resource.pool_code,
                current_value=resource.current_value,
            ))
        for sub in aggregate.subclasses:
            self.db.add(CharacterSubclass(
                character_id=model.id,
                class_code=sub.class_code,
                subclass_code=sub.subclass_code,
                chosen_at_level=sub.chosen_at_level,
            ))
        for item in aggregate.inventory:
            self.db.add(CharacterInventoryItem(
                character_id=model.id,
                item_code=item.item_code,
                quantity=item.quantity,
                notes=item.notes or "",
            ))

    def delete(self, character_id: UUID) -> bool:
        model = self._query().filter_by(id=character_id).first()
        if model is None:
            return False
        aggregate = self._model_to_aggregate(model)
        if not aggregate.can_be_deleted():
            raise ValueError("Cannot delete character — it is locked to an active campaign")
        aggregate.soft_delete()
        model.is_deleted = aggregate.is_deleted
        model.updated_at = aggregate.updated_at
        self.db.commit()
        return True

    # -------------------------------------------------------------- audit log

    def append_choice_log(
        self,
        *,
        character_id: UUID,
        level: int,
        choice_type: str,
        choice_data: dict,
        created_at,
    ) -> None:
        """Append an entry to the character_choices_log table.

        Used by the level-up flow to record HP rolls, ASI distributions, feat
        selections, and skill picks for later replay / audit.
        """
        self.db.add(CharacterChoiceLog(
            character_id=character_id,
            level=level,
            choice_type=choice_type,
            choice_data=choice_data,
            created_at=created_at,
        ))
        self.db.commit()
