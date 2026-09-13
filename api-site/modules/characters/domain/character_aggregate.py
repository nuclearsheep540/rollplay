# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character aggregate root — system-agnostic.

A character is whatever its campaign's character config said it was. The aggregate knows
what a component *is* (it can pair a value with its configuration, and read an Identity) and
nothing about what any component *means*: there is no damage, no death, no level, and
reaching a hit-points component's zero point is just a value like any other.

Its one derived fact is the display name, joined from every text Identity value in config order.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import UUID, uuid4

from shared_contracts.character_config import CharacterConfig, CharacterSheet
from shared_contracts.components import ComponentValue

UNNAMED = "Unnamed character"


@dataclass
class CharacterAggregate:
    """User-owned; in one session's party; built against one published config version.

    ``config_snapshot`` is a whole copy of that version, so the character renders after the
    campaign, its sessions and its version rows are gone. That is what makes a keepsake
    free — there is no join to lose.
    """

    id: UUID
    user_id: UUID
    campaign_id: Optional[UUID]
    session_id: Optional[UUID]
    config_version_id: Optional[UUID]
    config_snapshot: CharacterConfig
    values: Dict[str, ComponentValue]
    display_name: str
    is_alive: bool
    slot: Optional[int]
    created_at: datetime
    updated_at: datetime
    avatar_asset_id: Optional[UUID] = None
    # Hydrated by the repository from the eager-loaded asset row; not persisted here.
    avatar_s3_key: Optional[str] = None
    avatar_focal_area: Optional[dict] = None
    color: Optional[str] = None
    is_deleted: bool = False

    @property
    def is_keepsake(self) -> bool:
        """Not at a table: campaign deleted, character ejected, or migrated by the backfill.
        One orphan state, reached three ways."""
        return self.session_id is None

    @classmethod
    def create(
        cls,
        *,
        user_id: UUID,
        campaign_id: Optional[UUID],
        session_id: Optional[UUID],
        config_version_id: Optional[UUID],
        config: CharacterConfig,
        values: Dict[str, ComponentValue],
        slot: Optional[int],
        color: Optional[str] = None,
        avatar_asset_id: Optional[UUID] = None,
    ) -> "CharacterAggregate":
        """Build a character against a published config version.

        Raises:
            ValidationError: the values do not pair with the config (a data invariant —
                wrong type, wrong representation, unknown component id). Always blocked.
            ValueError: a required Identity is unanswered. Completeness at finalize,
                which is the one axis it is fair to require.
        """
        CharacterSheet(config=config, values=values)

        missing = [
            component.label
            for component in config.flat_components()
            if component.type == "identity" and component.required
            and not (values.get(component.id) and values[component.id].is_populated())
        ]
        if missing:
            raise ValueError(f"Missing required: {', '.join(missing)}")

        now = datetime.now(timezone.utc)
        aggregate = cls(
            id=uuid4(),
            user_id=user_id,
            campaign_id=campaign_id,
            session_id=session_id,
            config_version_id=config_version_id,
            config_snapshot=config,
            values=dict(values),
            display_name=UNNAMED,
            is_alive=True,
            slot=slot,
            created_at=now,
            updated_at=now,
            color=color,
            avatar_asset_id=avatar_asset_id,
        )
        aggregate.display_name = aggregate.derive_display_name()
        return aggregate

    def derive_display_name(self) -> str:
        """Every text-kind Identity value in config order, single-space joined.

        Two such components labelled "First name" and "Family name" therefore read as one
        name everywhere the runtime shows a name. A chosen class or role is an identity
        too, but not a name — selects are left out.
        """
        parts = []
        for configuration in self.config_snapshot.flat_components():
            if configuration.type != "identity" or configuration.input.kind != "text":
                continue
            value = self.values.get(configuration.id)
            if value is not None and value.answer.text.strip():
                parts.append(value.answer.text.strip())
        return " ".join(parts) if parts else UNNAMED

    def set_component_value(self, value: ComponentValue) -> None:
        """Replace one component's value.

        Raises:
            ValidationError: the value does not pair with its configuration. A value that
                merely falls outside the configuration's *range* is accepted — that is a
                version difference the GM is shown, never a block.
        """
        candidate = dict(self.values)
        candidate[value.component_id] = value
        CharacterSheet(config=self.config_snapshot, values=candidate)
        self.values = candidate
        self.display_name = self.derive_display_name()
        self._touch()

    def replace_values(self, values: Dict[str, ComponentValue]) -> None:
        """Whole-document replace, used by the End ETL and by ejecting mid-game."""
        CharacterSheet(config=self.config_snapshot, values=values)
        self.values = dict(values)
        self.display_name = self.derive_display_name()
        self._touch()

    def unbind_from_table(self) -> None:
        """Leave the table for good: no session, no campaign, no version pointer.

        The keepsake state, reached by ejection exactly as by campaign deletion. The
        snapshot and values are untouched — that is the whole point of embedding them.
        """
        self.session_id = None
        self.campaign_id = None
        self.config_version_id = None
        self._touch()

    def set_alive(self, is_alive: bool) -> None:
        """Mark dead or alive. Does NOT remove the character from its party — leaving is
        always explicit, so a dead character stays at the table until someone ejects it."""
        self.is_alive = is_alive
        self._touch()

    def set_avatar_asset(self, asset_id: Optional[UUID]) -> None:
        """Attach (or clear) the library asset used as this character's avatar.

        ``avatar_s3_key`` is reset here — the repository repopulates it on the next read
        via the eager-loaded ``MediaAsset`` row.
        """
        self.avatar_asset_id = asset_id
        if asset_id is None:
            self.avatar_s3_key = None
        self._touch()

    def set_color(self, color: Optional[str]) -> None:
        """Set the character's display color, or None to clear it.

        Shape-only validation (data invariant): any '#rrggbb' hue is allowed — there is no
        palette restriction and duplicates across a party are fine."""
        if color is not None and not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ValueError("Color must be '#rrggbb' hex")
        self.color = color
        self._touch()

    def is_owned_by(self, user_id: UUID) -> bool:
        return self.user_id == user_id

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.slot = None  # frees the capacity slot
        self._touch()

    def _touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc)
