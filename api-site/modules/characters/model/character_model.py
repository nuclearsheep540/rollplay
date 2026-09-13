# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import text

from shared.dependencies.db import Base


class Character(Base):
    """Character aggregate root.

    User-owned; in one session's party (its table) and built from one campaign's published
    character config, a whole copy of which is embedded so the character still renders
    after the campaign, its sessions and its version rows are gone — a keepsake. Component
    values live in ``values``, keyed by component id. There are no rules columns: what a
    character is made of is the campaign's decision, not the schema's.
    """

    __tablename__ = "characters"
    __table_args__ = (
        # Character capacity is slot-based: a live character occupies one of a
        # user's slots for life (slots are never reshuffled); soft-delete NULLs
        # the slot, freeing it. The unique constraint makes over-occupancy
        # impossible at the database, including under concurrent creates —
        # NULLs never collide, so deleted rows are exempt. 8 is the universe
        # ceiling; the per-user limit is users.max_slots, enforced at slot
        # assignment in the application layer.
        UniqueConstraint("user_id", "slot", name="uq_characters_user_slot"),
        CheckConstraint("slot IS NULL OR (slot >= 0 AND slot < 8)", name="ck_characters_slot_range"),
        # One character per user per party, alive or dead. Deliberately NOT qualified by
        # is_alive: a dead character keeps its place until someone ejects it, so aliveness
        # must not free the slot or a user could hold a dead character and a living one and
        # the party would be ambiguous for them. This index IS the "one at a time" rule;
        # no application code repeats it.
        Index(
            "uq_characters_one_per_party",
            "session_id",
            "user_id",
            unique=True,
            postgresql_where=text("session_id IS NOT NULL AND NOT is_deleted"),
            sqlite_where=text("session_id IS NOT NULL AND NOT is_deleted"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    slot = Column(SmallInteger, nullable=True)  # NULL = soft-deleted (not occupying capacity)

    # Provenance: which campaign's config built this character. NULL = a keepsake.
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    # The table this character is in the party of. NULL = not at a table (keepsake).
    # Party membership IS this column; there is no join table and no roster pointer.
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    config_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character_config_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    # A whole copy of the config version this was built against. Never reassembled from
    # rows; this is what makes keepsakes free — no join, ever.
    config_snapshot = Column(JSONB, nullable=False, server_default='{"version": 1, "components": []}')
    # component_id -> ComponentValue. The player's instances of the GM's configurations.
    values = Column(JSONB, nullable=False, server_default="{}")
    # Every Name value in config order, space-joined. Derived, stored so lists and the game
    # runtime never have to open the snapshot to show who this is.
    display_name = Column(String(200), nullable=False, server_default="Unnamed character")

    is_alive = Column(Boolean, nullable=False, default=True, server_default="true")

    # FK to the MediaAsset (asset_type='image') used as this character's
    # avatar. NULL ⇒ frontend renders /heroes.png default. SET NULL on the
    # asset side so deleting an image from the library doesn't cascade-delete
    # the character — just unlinks it.
    avatar_asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Eager-load the avatar asset (joined load — tiny one-row hop).
    avatar_asset = relationship("MediaAsset", foreign_keys=[avatar_asset_id], lazy="joined")

    # Character-owned display color (hex '#rrggbb'). Seats and map tokens
    # *display* this; color is never stored per-seat. NULL ⇒ frontend falls
    # back to the seat-index palette.
    color = Column(String(7), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false")

    def __repr__(self):
        return f"<Character(id={self.id}, display_name='{self.display_name}', session_id={self.session_id})>"
