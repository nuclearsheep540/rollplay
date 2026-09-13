# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character resource endpoints.

Creating a character joins its session's party; POST /{id}/eject leaves it. Both are
addressed by character, because a character knows its table and its owner — there is no
session-side seat to write.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError

from modules.campaign.dependencies.providers import (
    campaign_repository,
    get_character_config_version_repository,
)
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.repositories.character_config_version_repository import (
    CharacterConfigVersionRepository,
)
from modules.characters.api.schemas import (
    AdoptVersionRequest,
    CharacterCreateRequest,
    CharacterResponse,
    CharacterRuntimeBundle,
    SetAliveRequest,
    SetAvatarRequest,
    UpdateComponentRequest,
    UpgradePreviewResponse,
)
from modules.characters.application.commands import (
    AdoptConfigVersion,
    CreateCharacter,
    DeleteCharacter,
    EjectCharacterFromParty,
    SetCharacterAlive,
    SetCharacterAvatar,
    UpdateCharacterComponent,
)
from modules.characters.application.queries import (
    GetCharacterById,
    GetCharactersByUser,
    GetCharacterUpgradePreview,
    GetCharacterVersionDrift,
)
from modules.characters.dependencies.providers import get_character_repository
from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.characters.repositories.character_repository import CharacterRepository
from modules.game.dependencies.providers import get_game_repository
from modules.game.repositories.game_repository import GameRepository
from modules.library.dependencies.providers import get_media_asset_repository
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.session.dependencies.providers import get_session_repository
from modules.session.repositories.session_repository import SessionRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.user.repositories.user_repository import UserRepository
from shared.dependencies.auth import get_current_user_id
from shared.services.game_notifier import (
    GameNotifier,
    GameNotifierUnavailable,
    get_game_notifier,
)
from shared.services.s3_service import S3Service, get_s3_service

router = APIRouter()


def _to_character_response(
    character: CharacterAggregate,
    s3_service: Optional[S3Service] = None,
    campaign_repo: Optional[CampaignRepository] = None,
    version_repo: Optional[CharacterConfigVersionRepository] = None,
    game_repo: Optional[GameRepository] = None,
) -> CharacterResponse:
    """Map the aggregate, then join what it cannot know: a signed avatar URL, the
    campaign's title, and — when a version repo is given — how far the campaign's config
    has moved on since the character was built. Every single-character response passes
    the repo, so the page can take any of them as the whole truth; the list does not."""
    avatar_url: Optional[str] = None
    if character.avatar_s3_key and s3_service is not None:
        try:
            avatar_url = s3_service.generate_download_url(character.avatar_s3_key)
        except Exception:
            # A transient S3 problem must not fail the read; the frontend falls back to
            # the default portrait.
            avatar_url = None

    campaign_title: Optional[str] = None
    if character.campaign_id and campaign_repo is not None:
        campaign = campaign_repo.get_by_id(character.campaign_id)
        campaign_title = campaign.title if campaign else None

    drift = GetCharacterVersionDrift(version_repo).execute(character) if version_repo is not None else None

    open_game_id: Optional[UUID] = None
    if character.session_id and game_repo is not None:
        open_game = game_repo.get_open_game_for_session(character.session_id)
        open_game_id = open_game.id if open_game else None

    return CharacterResponse(
        id=character.id,
        user_id=character.user_id,
        campaign_id=character.campaign_id,
        session_id=character.session_id,
        config_version_id=character.config_version_id,
        config_snapshot=character.config_snapshot,
        values=character.values,
        display_name=character.display_name,
        is_alive=character.is_alive,
        is_keepsake=character.is_keepsake,
        slot=character.slot,
        avatar_asset_id=character.avatar_asset_id,
        avatar_focal_area=character.avatar_focal_area,
        color=character.color,
        created_at=character.created_at,
        updated_at=character.updated_at,
        avatar_url=avatar_url,
        campaign_title=campaign_title,
        latest_version=drift.latest_version if drift else None,
        version_changes=drift.changes if drift else [],
        open_game_id=open_game_id,
    )


def _may_read(character: CharacterAggregate, user_id: UUID, campaign_repo: CampaignRepository) -> bool:
    """Owner, or the host of the campaign the character belongs to."""
    if character.is_owned_by(user_id):
        return True
    if character.campaign_id is None:
        return False
    campaign = campaign_repo.get_by_id(character.campaign_id)
    return campaign is not None and campaign.created_by == user_id


@router.get("/me", response_model=List[CharacterResponse])
def list_my_characters(
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Every character this user owns, keepsakes included."""
    characters = GetCharactersByUser(character_repo).execute(user_id)
    return [_to_character_response(character, s3_service, campaign_repo) for character in characters]


@router.post("/", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(
    request: CharacterCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    game_repo: GameRepository = Depends(get_game_repository),
    game_notifier: GameNotifier = Depends(get_game_notifier),
    asset_repo: MediaAssetRepository = Depends(get_media_asset_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Build a character against the session's campaign config, and join the party."""
    try:
        character = await CreateCharacter(
            character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, game_notifier, asset_repo,
        ).execute(user_id=user_id, session_id=request.session_id, values=request.values,
                  avatar_asset_id=request.avatar_asset_id)
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValueError as invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(invalid))

    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.get("/{character_id}", response_model=CharacterResponse)
def get_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    s3_service: S3Service = Depends(get_s3_service),
    game_repo: GameRepository = Depends(get_game_repository),
):
    """The whole character, secret values included — the only readers here are the owner
    and their GM, both of whom may see them. Carries the version drift, so the page can
    say what the campaign changed since this character was built."""
    character = GetCharacterById(character_repo).execute(character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    if not _may_read(character, user_id, campaign_repo):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your character")
    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.get("/{character_id}/upgrade-preview", response_model=UpgradePreviewResponse)
def upgrade_preview(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
):
    """The move to the campaign's latest version, as a proposal: the new config, what
    changed, and the values carried over — for the owner to review and confirm."""
    character = GetCharacterById(character_repo).execute(character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    if not character.is_owned_by(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your character")
    preview = GetCharacterUpgradePreview(version_repo).execute(character)
    if preview is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already on the latest version")
    return UpgradePreviewResponse(
        latest_version_id=preview.latest_version_id,
        latest_version=preview.latest_version,
        config=preview.config,
        changes=preview.changes,
        values=preview.reconciliation.values,
        kept=preview.reconciliation.kept,
        added=preview.reconciliation.added,
        dropped=preview.reconciliation.dropped,
        reset=preview.reconciliation.reset,
    )


@router.post("/{character_id}/adopt-version", response_model=CharacterResponse)
def adopt_version(
    character_id: UUID,
    request: AdoptVersionRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    game_repo: GameRepository = Depends(get_game_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Confirm the move to the latest version with the reviewed values."""
    try:
        character = AdoptConfigVersion(character_repo, version_repo, game_repo).execute(
            character_id=character_id, requesting_user_id=user_id, values=request.values,
        )
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValidationError as mismatch:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(mismatch))
    except ValueError as refused:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(refused))
    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.put("/{character_id}/components/{component_id}", response_model=CharacterResponse)
def update_component(
    character_id: UUID,
    component_id: str,
    request: UpdateComponentRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    game_repo: GameRepository = Depends(get_game_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Edit one value outside a game. While a game is running the room owns the values."""
    if request.value.component_id != component_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Body targets {request.value.component_id!r}, path targets {component_id!r}",
        )
    try:
        character = UpdateCharacterComponent(character_repo, campaign_repo, game_repo).execute(
            character_id=character_id, requesting_user_id=user_id, value=request.value)
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValueError as invalid:
        message = str(invalid)
        if "game is running" in message:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.patch("/{character_id}/alive", response_model=CharacterResponse)
def set_alive(
    character_id: UUID,
    request: SetAliveRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    s3_service: S3Service = Depends(get_s3_service),
    game_repo: GameRepository = Depends(get_game_repository),
):
    """Mark dead or alive. The character stays in its party either way."""
    try:
        character = SetCharacterAlive(character_repo, campaign_repo, game_repo).execute(
            character_id=character_id, requesting_user_id=user_id, is_alive=request.is_alive)
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValueError as invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(invalid))

    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.post("/{character_id}/eject", response_model=CharacterResponse)
async def eject_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    game_repo: GameRepository = Depends(get_game_repository),
    game_notifier: GameNotifier = Depends(get_game_notifier),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Leave the table for good. The character becomes a keepsake its owner keeps.

    One endpoint covers both cases the old pair covered — a player ejecting their own, a
    host ejecting someone's — because permission is read off the character, not the path.
    """
    try:
        character = await EjectCharacterFromParty(
            character_repo, session_repo, campaign_repo, user_repo, game_repo, game_notifier,
        ).execute(character_id=character_id, requested_by=user_id)
    except GameNotifierUnavailable as unreachable:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(unreachable))
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValueError as invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(invalid))

    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.patch("/{character_id}/avatar", response_model=CharacterResponse)
def set_character_avatar(
    character_id: UUID,
    request: SetAvatarRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    asset_repo: MediaAssetRepository = Depends(get_media_asset_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    version_repo: CharacterConfigVersionRepository = Depends(get_character_config_version_repository),
    s3_service: S3Service = Depends(get_s3_service),
    game_repo: GameRepository = Depends(get_game_repository),
):
    try:
        character = SetCharacterAvatar(character_repo, asset_repo, game_repo).execute(
            character_id=character_id, user_id=user_id, asset_id=request.asset_id)
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValueError as invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(invalid))

    return _to_character_response(character, s3_service, campaign_repo, version_repo, game_repo)


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
):
    try:
        DeleteCharacter(character_repo).execute(character_id=character_id, user_id=user_id)
    except PermissionError as denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(denied))
    except ValueError as invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(invalid))
    return None


@router.get("/internal/{character_id}/runtime-bundle", response_model=CharacterRuntimeBundle)
def character_runtime_bundle(
    character_id: UUID,
    character_repo: CharacterRepository = Depends(get_character_repository),
):
    """What api-game needs to put a character into a running room on reconnect.

    No auth: nginx 404s /api/characters/internal/ at the edge, so this is reachable only
    from inside the Docker network.
    """
    character = GetCharacterById(character_repo).execute(character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    return CharacterRuntimeBundle(
        character_id=character.id,
        user_id=character.user_id,
        display_name=character.display_name,
        color=character.color,
        avatar_asset_id=character.avatar_asset_id,
        config_version_id=character.config_version_id,
        config=character.config_snapshot,
        values=character.values,
        is_alive=character.is_alive,
    )
