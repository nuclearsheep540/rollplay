# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from modules.news.api.schemas import (
    CreateNewsPostRequest,
    NewsBannerUrls,
    NewsImageListResponse,
    NewsImageMoveRequest,
    NewsImageMoveResponse,
    NewsImageResponse,
    NewsImageUploadRequest,
    NewsImageUploadResponse,
    NewsLikeResponse,
    NewsPostResponse,
    NewsPostSummaryResponse,
    PublishNewsPostRequest,
    UpdateNewsPostRequest,
)
from modules.news.application.commands import (
    CreateNewsPost,
    DeleteNewsImage,
    DeleteNewsPost,
    ImageInUseError,
    MarkNewsPostRead,
    MoveNewsImage,
    PublishNewsPost,
    ToggleNewsPostLike,
    UpdateNewsPost,
    image_prefix,
    is_news_image_key,
)
from modules.news.application.queries import (
    GetAllNewsPosts,
    GetLatestPublishedPost,
    GetNewsPostById,
)
from modules.news.dependencies.providers import news_repository
from modules.news.domain.news_post_aggregate import BANNER_SLOTS, NewsPostAggregate
from modules.news.repositories.news_repository import NewsRepository
from modules.user.domain.user_aggregate import UserAggregate
from shared.dependencies.auth import get_current_user_from_token, is_admin_email, require_admin
from shared.services.s3_service import S3Service, get_s3_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["news"])

# A post is never shown with no likes: the count starts at one and every real
# like moves it by one from there. Applied at the response boundary only —
# the tables keep the true count, so a like is still a like in the data.
LIKE_COUNT_BASE = 1


def displayed_like_count(actual_likes: int) -> int:
    """The like count as the reader sees it (see LIKE_COUNT_BASE)."""
    return actual_likes + LIKE_COUNT_BASE


def _collect_image_keys(node: Any, keys: List[str]) -> None:
    """
    Walk a ProseMirror document collecting the S3 keys of its image nodes.

    Image nodes store the KEY in `src` (never a URL), so the document stays
    valid forever while the URLs it renders with are signed per request.
    """
    if isinstance(node, dict):
        if node.get("type") == "image":
            key = node.get("attrs", {}).get("src")
            if key:
                keys.append(key)
        for child in node.get("content", []) or []:
            _collect_image_keys(child, keys)
    elif isinstance(node, list):
        for child in node:
            _collect_image_keys(child, keys)


def _to_news_post_response(
    post: NewsPostAggregate,
    news_repo: NewsRepository,
    s3_service: S3Service,
    user_id: Optional[UUID] = None,
) -> NewsPostResponse:
    """
    Build the full post response.

    Enrichment, not mapping: this joins the aggregate to like/read state the
    post does not own, and to signed URLs that must be minted per request.
    """
    banner_keys = post.banner_keys()

    def sign(key: Optional[str]) -> Optional[str]:
        return s3_service.generate_download_url(key) if key else None

    image_keys = []
    _collect_image_keys(post.doc, image_keys)

    image_urls = {}
    for key in set(image_keys):
        image_urls[key] = s3_service.generate_download_url(key)

    return NewsPostResponse(
        id=post.id,
        title=post.title,
        author_name=post.author_name,
        doc=post.doc,
        published=post.published,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
        banner_urls=NewsBannerUrls(
            home_top=sign(banner_keys["banner_home_top"]),
            home_bottom=sign(banner_keys["banner_home_bottom"]),
            article_top=sign(banner_keys["banner_article_top"]),
            article_bottom=sign(banner_keys["banner_article_bottom"]),
        ),
        image_urls=image_urls,
        like_count=displayed_like_count(news_repo.count_likes(post.id)),
        liked=news_repo.has_liked(post.id, user_id) if user_id else False,
        read=news_repo.has_read(post.id, user_id) if user_id else False,
        **banner_keys,
    )


def _to_summary_response(post: NewsPostAggregate, news_repo: NewsRepository) -> NewsPostSummaryResponse:
    return NewsPostSummaryResponse(
        id=post.id,
        title=post.title,
        author_name=post.author_name,
        published=post.published,
        published_at=post.published_at,
        updated_at=post.updated_at,
        like_count=displayed_like_count(news_repo.count_likes(post.id)),
    )


# ── Images (admin only) ──────────────────────────────────────────────────

@router.get("/images/", response_model=NewsImageListResponse)
async def list_news_images(
    post_id: Optional[UUID] = None,
    _admin: UserAggregate = Depends(require_admin),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    One scope of the news image store.

    Omit `post_id` for the shared directory — images an author made reusable.
    Pass one for that article's own images, which live loose in its folder.

    News images live outside the asset library on purpose: they are platform
    editorial media with no owner and no MediaAsset row.
    """
    objects = s3_service.list_objects(f"{image_prefix(post_id)}/")

    images = []
    for item in objects:
        # An article's folder holds its document alongside its images. The
        # document is not an image, and offering it as a tile — with a delete
        # control on it — is how an article gets destroyed by accident.
        if not is_news_image_key(item["key"]):
            continue

        images.append(NewsImageResponse(
            key=item["key"],
            url=s3_service.generate_download_url(item["key"]),
            size=item["size"],
            last_modified=item["last_modified"],
        ))

    return NewsImageListResponse(images=images)


@router.delete("/images/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_news_image(
    key: str,
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    Delete a news image, in either scope.

    Refuses while any post still uses it, naming them. S3 offers no undo, and
    the check runs for article-scoped images too — the folder is a strong hint
    about who uses an image, not a proof.
    """
    command = DeleteNewsImage(news_repo, s3_service)

    try:
        command.execute(key)
    except ImageInUseError as in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "This image is still used by a post",
                "posts": in_use.post_titles,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/images/move", response_model=NewsImageMoveResponse)
async def move_news_image(
    request: NewsImageMoveRequest,
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    Move an image between scopes.

    Sharing an article's own image is always allowed. Claiming a shared image
    for one article is refused while another still renders it — the refusal
    names them, in the same shape delete uses, so the editor can say which.
    """
    command = MoveNewsImage(news_repo, s3_service)

    try:
        new_key = command.execute(request.key, request.target_post_id)
    except ImageInUseError as in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Another post still uses this image",
                "posts": in_use.post_titles,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return NewsImageMoveResponse(key=new_key)


@router.post("/images/upload-url", response_model=NewsImageUploadResponse)
async def create_news_image_upload_url(
    request: NewsImageUploadRequest,
    _admin: UserAggregate = Depends(require_admin),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    Presign a PUT into one scope of the news image store.

    `post_id` chooses the scope, and choosing it here is the whole point: an
    image is shared or private from the moment it is uploaded, rather than
    being shared by default and discovered to be so at delete time.

    Deliberately NOT the library's upload-confirm flow: there is no MediaAsset
    row to create, so the upload completes when S3 accepts the bytes.
    """
    safe_filename = "".join(c for c in request.filename if c.isalnum() or c in ".-_")
    key = f"{image_prefix(request.post_id)}/{uuid4().hex[:8]}_{safe_filename}"

    upload_url = s3_service.generate_upload_url(key, request.content_type)

    return NewsImageUploadResponse(upload_url=upload_url, key=key)


# ── Reads (any authenticated user) ───────────────────────────────────────

@router.get("/latest", response_model=Optional[NewsPostResponse])
async def get_latest_news(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    The latest published post for Home's noticeboard card.

    Returns null when nothing is published yet — Home renders its quiet
    variant rather than an error.
    """
    query = GetLatestPublishedPost(news_repo)
    post = query.execute()

    if not post:
        return None

    return _to_news_post_response(post, news_repo, s3_service, current_user.id)


@router.get("/{post_id}", response_model=NewsPostResponse)
async def get_news_post(
    post_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    One post by id. Drafts are visible only to admins — an unpublished post is
    unfinished writing, not a preview link.
    """
    query = GetNewsPostById(news_repo)
    post = query.execute(post_id)

    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News post not found")

    if not post.published and not is_admin_email(current_user.email):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News post not found")

    return _to_news_post_response(post, news_repo, s3_service, current_user.id)


@router.post("/{post_id}/like", response_model=NewsLikeResponse)
async def toggle_like(
    post_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    news_repo: NewsRepository = Depends(news_repository),
):
    """Toggle the current user's like — the counter IS the control."""
    command = ToggleNewsPostLike(news_repo)

    try:
        result = command.execute(post_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return NewsLikeResponse(
        liked=result["liked"],
        like_count=displayed_like_count(result["like_count"]),
    )


@router.post("/{post_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    post_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    news_repo: NewsRepository = Depends(news_repository),
):
    """Record that the user opened the article, clearing Home's NEW! flair."""
    command = MarkNewsPostRead(news_repo)

    try:
        command.execute(post_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── Writes (admin only) ──────────────────────────────────────────────────

@router.get("/", response_model=List[NewsPostSummaryResponse])
async def list_news_posts(
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
):
    """Every post for the editor index — drafts first."""
    query = GetAllNewsPosts(news_repo)
    posts = query.execute()

    responses = []
    for post in posts:
        responses.append(_to_summary_response(post, news_repo))
    return responses


@router.post("/", response_model=NewsPostResponse, status_code=status.HTTP_201_CREATED)
async def create_news_post(
    request: CreateNewsPostRequest,
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Create a draft."""
    command = CreateNewsPost(news_repo, s3_service)

    try:
        post = command.execute(request.title, request.author_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return _to_news_post_response(post, news_repo, s3_service)


@router.put("/{post_id}", response_model=NewsPostResponse)
async def update_news_post(
    post_id: UUID,
    request: UpdateNewsPostRequest,
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    Apply an edit.

    Banner slots distinguish "not mentioned" from "explicitly cleared": only
    slots the client actually sent are touched, so saving a title never wipes
    artwork. `model_fields_set` is what carries that distinction — a plain read
    of the field would see None for both cases.
    """
    banners = {}
    for slot in BANNER_SLOTS:
        if slot in request.model_fields_set:
            banners[slot] = getattr(request, slot)

    command = UpdateNewsPost(news_repo, s3_service)

    try:
        post = command.execute(
            post_id,
            title=request.title,
            author_name=request.author_name,
            doc=request.doc,
            banners=banners or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return _to_news_post_response(post, news_repo, s3_service)


@router.post("/{post_id}/publish", response_model=NewsPostResponse)
async def publish_news_post(
    post_id: UUID,
    request: PublishNewsPostRequest,
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Publish a draft, or return a published post to draft."""
    command = PublishNewsPost(news_repo, s3_service)

    try:
        post = command.execute(post_id, request.published)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return _to_news_post_response(post, news_repo, s3_service)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_news_post(
    post_id: UUID,
    _admin: UserAggregate = Depends(require_admin),
    news_repo: NewsRepository = Depends(news_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Delete a post and its S3 backup."""
    command = DeleteNewsPost(news_repo, s3_service)

    if not command.execute(post_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News post not found")
