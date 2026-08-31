# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Requests ─────────────────────────────────────────────────────────────

class CreateNewsPostRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    author_name: str = Field(..., min_length=1, max_length=80)


class UpdateNewsPostRequest(BaseModel):
    """
    Every field optional: the editor saves what changed.

    Banner slots use Optional[str] where an explicitly-sent null CLEARS the
    slot. Because "absent" and "null" mean different things here, the endpoint
    inspects the request's set fields rather than reading these values blindly.
    """
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    author_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    doc: Optional[Dict[str, Any]] = None
    banner_home_top: Optional[str] = None
    banner_home_bottom: Optional[str] = None
    banner_article_top: Optional[str] = None
    banner_article_bottom: Optional[str] = None


class PublishNewsPostRequest(BaseModel):
    published: bool = True


class NewsImageUploadRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=200)
    content_type: str = Field(..., min_length=1, max_length=100)


# ── Responses ────────────────────────────────────────────────────────────

class NewsBannerUrls(BaseModel):
    """Signed URLs for the four banner slots — signed per request, never stored."""
    home_top: Optional[str] = None
    home_bottom: Optional[str] = None
    article_top: Optional[str] = None
    article_bottom: Optional[str] = None


class NewsPostResponse(BaseModel):
    """
    A post as the frontend consumes it.

    Banner and in-content images are stored as S3 KEYS; this response carries
    freshly signed URLs alongside them (`banner_urls`, `image_urls`) so the
    stored document never holds an expiring value.
    """
    id: UUID
    title: str
    author_name: str
    doc: Dict[str, Any]
    published: bool
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    banner_home_top: Optional[str] = None
    banner_home_bottom: Optional[str] = None
    banner_article_top: Optional[str] = None
    banner_article_bottom: Optional[str] = None

    banner_urls: NewsBannerUrls = NewsBannerUrls()
    image_urls: Dict[str, str] = {}

    like_count: int = 1  # Displayed count — see LIKE_COUNT_BASE in endpoints.py
    liked: bool = False
    read: bool = False


class NewsPostSummaryResponse(BaseModel):
    """Index row — no document body, no signed URLs."""
    id: UUID
    title: str
    author_name: str
    published: bool
    published_at: Optional[datetime] = None
    updated_at: datetime
    like_count: int = 1  # Displayed count — see LIKE_COUNT_BASE in endpoints.py


class NewsLikeResponse(BaseModel):
    liked: bool
    like_count: int


class NewsImageResponse(BaseModel):
    """One image in the shared news image directory."""
    key: str
    url: str
    size: int
    last_modified: datetime


class NewsImageListResponse(BaseModel):
    images: List[NewsImageResponse] = []


class NewsImageUploadResponse(BaseModel):
    upload_url: str
    key: str
