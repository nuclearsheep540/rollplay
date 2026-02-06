# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset ORM Model - PostgreSQL persistence layer for S3-backed media files

Media assets (maps, audio, images) are stored in S3, but metadata lives in PostgreSQL.
This is distinct from domain objects (NPCs, Items) which have business logic but no S3 backing.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base
from modules.library.domain.media_asset_type import MediaAssetType


class MediaAsset(Base):
    """
    MediaAsset entity - represents S3-backed media file metadata.

    The actual file is stored in S3, referenced by s3_key.
    This table tracks ownership, associations, and metadata.
    """
    __tablename__ = 'media_assets'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)

    # File metadata
    filename = Column(String(255), nullable=False)  # Original filename
    s3_key = Column(String(512), nullable=False, unique=True)  # S3 object key
    content_type = Column(String(100), nullable=False)  # MIME type (image/png, etc.)
    file_size = Column(Integer, nullable=True)  # Size in bytes (optional)

    # Asset classification - PostgreSQL enum for type safety
    # Use values_callable to store enum values (map, audio, image) not names (MAP, AUDIO, IMAGE)
    asset_type = Column(
        SQLEnum(
            MediaAssetType,
            name='media_asset_type',
            create_type=True,
            values_callable=lambda x: [e.value for e in x]
        ),
        nullable=False,
        index=True
    )

    # Associations (many-to-many via ARRAY for POC simplicity)
    # Full implementation may use junction tables
    campaign_ids = Column(ARRAY(UUID(as_uuid=True)), default=[], nullable=False)
    session_ids = Column(ARRAY(UUID(as_uuid=True)), default=[], nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", backref="media_assets")

    # Polymorphic inheritance - asset_type determines which subclass to load
    # 'map' -> MapAssetModel (with grid fields), others -> base MediaAsset
    # Note: No polymorphic_identity on base class - SQLAlchemy uses base for unregistered identities
    __mapper_args__ = {
        'polymorphic_on': asset_type,
    }

    def __repr__(self):
        return f"<MediaAsset(id={self.id}, filename='{self.filename}', type='{self.asset_type.value}')>"
