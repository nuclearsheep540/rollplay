# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class Character(Base):
    """Character aggregate root (v2 schema).

    Edition-locked: every character belongs to exactly one ruleset edition for
    life. Species, background and class codes reference content in the JSON
    seed data loaded by the :class:`RulesetRegistry` at boot — no FKs into
    SRD lookup tables, because that content lives outside the DB.
    """

    __tablename__ = "characters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    edition_id = Column(Integer, ForeignKey("editions.id"), nullable=False)
    active_in_campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )

    character_name = Column(String(50), nullable=False)
    species_code = Column(String(50), nullable=False)
    background_code = Column(String(50), nullable=False)

    level = Column(Integer, nullable=False, default=1, server_default="1")
    xp = Column(Integer, nullable=False, default=0, server_default="0")

    hp_max = Column(Integer, nullable=False)
    hp_current = Column(Integer, nullable=False)
    hp_temp = Column(Integer, nullable=False, default=0, server_default="0")
    ac = Column(Integer, nullable=False)

    death_save_successes = Column(SmallInteger, nullable=False, default=0, server_default="0")
    death_save_failures = Column(SmallInteger, nullable=False, default=0, server_default="0")
    inspiration = Column(Boolean, nullable=False, default=False, server_default="false")
    status_effects = Column(ARRAY(String), nullable=False, server_default="{}")
    is_alive = Column(Boolean, nullable=False, default=True, server_default="true")

    speed = Column(Integer, nullable=False)
    size = Column(String(10), nullable=False)
    languages = Column(ARRAY(String), nullable=False, server_default="{}")

    is_draft = Column(Boolean, nullable=False, default=True, server_default="true")
    creation_step = Column(String(30), nullable=True)

    # Provenance of the current ability_scores: which mode the wizard used
    # ('point_buy' / 'standard_array' / 'rolled' / 'manual'). NULL until the
    # player completes the ability_scores step. ``ability_roll_details`` holds
    # the per-ability 4d6 breakdown when ``method == 'rolled'`` so the wizard
    # can re-display the original dice on resume / refresh without us having to
    # re-roll (which would change the values).
    ability_score_method = Column(String(20), nullable=True)
    ability_roll_details = Column(JSONB, nullable=True)
    species_sub_choices = Column(JSONB, nullable=False, server_default="{}")  # lineage/ancestry/size picks

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

    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false")

    edition = relationship("Edition", lazy="joined")
    class_entries = relationship(
        "CharacterClassEntry",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ability_score_entries = relationship(
        "CharacterAbilityScore",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    save_proficiency_entries = relationship(
        "CharacterSaveProficiency",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    skill_entries = relationship(
        "CharacterSkillProficiency",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    feat_entries = relationship(
        "CharacterFeatAcquisition",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    spell_entries = relationship(
        "CharacterSpell",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    choice_log_entries = relationship(
        "CharacterChoiceLog",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self):
        return (
            f"<Character(id={self.id}, name='{self.character_name}', "
            f"level={self.level}, draft={self.is_draft})>"
        )
