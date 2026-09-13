# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character persistence.

One table, one row per character. The config snapshot and the values document are whole
JSON values: validated on the way out of the database and dumped whole on the way in,
never reassembled from rows.
"""

from typing import Dict, Iterable, List, Optional
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy.orm import Session, joinedload

from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.characters.model.character_model import Character as CharacterModel
from modules.user.model.user_model import User as UserModel
from shared_contracts.character_config import CharacterConfig
from shared_contracts.components import ComponentValue

# Module-level: building a TypeAdapter compiles a validator, so it is built once.
COMPONENT_VALUE_ADAPTER = TypeAdapter(ComponentValue)


class CharacterRepository:
    def __init__(self, db_session: Session):
        self.db = db_session

    def _query(self):
        return self.db.query(CharacterModel).options(joinedload(CharacterModel.avatar_asset))

    def _model_to_aggregate(self, model: CharacterModel) -> CharacterAggregate:
        return CharacterAggregate(
            id=model.id,
            user_id=model.user_id,
            campaign_id=model.campaign_id,
            session_id=model.session_id,
            config_version_id=model.config_version_id,
            config_snapshot=CharacterConfig.model_validate(model.config_snapshot or {"version": 1}),
            values={
                component_id: COMPONENT_VALUE_ADAPTER.validate_python(value)
                for component_id, value in (model.values or {}).items()
            },
            display_name=model.display_name,
            is_alive=model.is_alive,
            slot=model.slot,
            created_at=model.created_at,
            updated_at=model.updated_at,
            avatar_asset_id=model.avatar_asset_id,
            avatar_s3_key=(model.avatar_asset.s3_key if model.avatar_asset is not None else None),
            # The avatar image's "token" focal square (tokens v3, decision 36).
            # getattr-guarded: SetCharacterAvatar enforces image-type, but a legacy
            # non-image row must degrade to None, not raise.
            avatar_focal_area=(
                (getattr(model.avatar_asset, "focal_areas", None) or {}).get("token")
                if model.avatar_asset is not None
                else None
            ),
            color=model.color,
            is_deleted=model.is_deleted,
        )

    def get_by_id(self, character_id: UUID) -> Optional[CharacterAggregate]:
        model = self._query().filter_by(id=character_id, is_deleted=False).first()
        return self._model_to_aggregate(model) if model else None

    def get_by_ids(self, character_ids: Iterable[UUID]) -> Dict[UUID, CharacterAggregate]:
        ids = list(character_ids)
        if not ids:
            return {}
        models = self._query().filter(CharacterModel.id.in_(ids), CharacterModel.is_deleted == False).all()  # noqa: E712
        return {model.id: self._model_to_aggregate(model) for model in models}

    def get_occupied_slots(self, user_id: UUID) -> List[int]:
        """Slot numbers a user's live characters hold."""
        rows = (
            self.db.query(CharacterModel.slot)
            .filter(
                CharacterModel.user_id == user_id,
                CharacterModel.is_deleted == False,  # noqa: E712
                CharacterModel.slot.isnot(None),
            )
            .all()
        )
        return [row.slot for row in rows]

    def get_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        """The user's visible characters: live ones in slots below their max_slots.
        Characters above the limit (after a capacity decrease) stay in the database but are
        not returned — nothing is deleted. Ordering is updated_at, never slot: slots are
        capacity bookkeeping, not position.
        """
        models = (
            self._query()
            .join(UserModel, UserModel.id == CharacterModel.user_id)
            .filter(
                CharacterModel.user_id == user_id,
                CharacterModel.is_deleted == False,  # noqa: E712
                CharacterModel.slot < UserModel.max_slots,
            )
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_slot_at_or_above(self, user_id: UUID, slot: int) -> List[CharacterAggregate]:
        """Live characters at or above a slot number — SetMaxSlots' work list when capacity
        decreases."""
        models = (
            self._query()
            .filter(
                CharacterModel.user_id == user_id,
                CharacterModel.is_deleted == False,  # noqa: E712
                CharacterModel.slot >= slot,
            )
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_party_for_session(self, session_id: UUID) -> List[CharacterAggregate]:
        """The party: every character at this table. Membership is the session_id column,
        so this query IS the party — there is nothing else to read."""
        models = (
            self._query()
            .filter(
                CharacterModel.session_id == session_id,
                CharacterModel.is_deleted == False,  # noqa: E712
            )
            .order_by(CharacterModel.created_at)
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_party_character(self, session_id: UUID, user_id: UUID) -> Optional[CharacterAggregate]:
        """That user's one character at this table, alive or dead. At most one exists —
        the partial unique index makes it so."""
        model = (
            self._query()
            .filter(
                CharacterModel.session_id == session_id,
                CharacterModel.user_id == user_id,
                CharacterModel.is_deleted == False,  # noqa: E712
            )
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    def save(self, aggregate: CharacterAggregate) -> UUID:
        model = self.db.query(CharacterModel).filter_by(id=aggregate.id).first()
        if model is None:
            model = CharacterModel(id=aggregate.id, created_at=aggregate.created_at)
            self.db.add(model)

        model.user_id = aggregate.user_id
        model.slot = aggregate.slot
        model.campaign_id = aggregate.campaign_id
        model.session_id = aggregate.session_id
        model.config_version_id = aggregate.config_version_id
        model.config_snapshot = aggregate.config_snapshot.model_dump(mode="json")
        model.values = {
            component_id: value.model_dump(mode="json")
            for component_id, value in aggregate.values.items()
        }
        model.display_name = aggregate.display_name
        model.is_alive = aggregate.is_alive
        model.avatar_asset_id = aggregate.avatar_asset_id
        model.color = aggregate.color
        model.updated_at = aggregate.updated_at
        model.is_deleted = aggregate.is_deleted

        self.db.commit()
        self.db.refresh(model)
        return model.id
