# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Game Aggregate - DDD Domain Model

Ubiquitous Language:
- Campaign = the authored story and its assets: the baseline every game starts from
- Session  = who and when: the party (roster) and the plan for the next game
- Game     = ONE play, from Start to End (this aggregate), and the state it left behind
- Party    = the session's people; a value inside the session, never an aggregate

A game owns its own lifecycle and the state of play. While it is open a MongoDB
room exists in api-game keyed by this aggregate's id — the id IS the room id, so
there is no second identifier to keep in step. When it ends, the room is deleted
and the row becomes history: name, when, who was at the table, what happened, and
where everything was left. The next game of the same session seeds from it.

The session deliberately has no status and no play state: it cannot produce a
token board or an adventure log, and a stored "current game" pointer would be a
second place asserting a fact this table already holds.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID


class GameStatus(str, Enum):
    """
    Game lifecycle status.

    STARTING - the row exists, api-game has not yet confirmed the room
    ACTIVE   - a MongoDB room exists, keyed by this game's id
    ENDING   - End in progress: the hot state is being extracted
    ENDED    - history; never reopened

    ENDED is terminal by design. A game is one play: the thing that carries on
    between plays is the session, and the way to play again is to start another
    game. There is no resting state here, which is why "inactive" is not a
    member — the absence of an open game IS the resting state, and it is a
    query, not a value.
    """

    STARTING = "starting"
    ACTIVE = "active"
    ENDING = "ending"
    ENDED = "ended"

    def __str__(self) -> str:
        return self.value


class EndReason(str, Enum):
    """Why a game ended — indistinguishable in status, different in what is told.

    HOST   - the GM pressed End game. Players get a toast; the schedule clears.
    SYSTEM - the expiry sweeper or an admin closed an abandoned game. Silent: from
             the user's side nothing happened, and the next Start reads identically.
    """

    HOST = "host"
    SYSTEM = "system"

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class Attendee:
    """One person at the table during a game, with the character they brought.

    Frozen because attendance is written once, at End, and never edited: it is a
    record of a night that has happened.
    """

    user_id: UUID
    character_id: Optional[UUID]

    def to_dict(self) -> Dict[str, Optional[str]]:
        """JSONB-safe form. UUIDs stringify only here, at the persistence boundary."""
        return {
            "user_id": str(self.user_id),
            "character_id": str(self.character_id) if self.character_id else None,
        }

    @classmethod
    def from_dict(cls, raw: Dict[str, Any]) -> "Attendee":
        character_id = raw.get("character_id")
        return cls(
            user_id=UUID(str(raw["user_id"])),
            character_id=UUID(str(character_id)) if character_id else None,
        )


MAX_GAME_NAME_LENGTH = 100


class GameAggregate:
    """One play of a campaign: its lifecycle, its record, and the state it left."""

    def __init__(
        self,
        id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
        campaign_id: Optional[UUID] = None,
        host_id: Optional[UUID] = None,
        status: GameStatus = GameStatus.STARTING,
        name: Optional[str] = None,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,  # stamped when api-game confirms the room
        ended_at: Optional[datetime] = None,
        ended_by: Optional[EndReason] = None,
        urls_expire_at: Optional[datetime] = None,  # signed asset-URL lease deadline, stamped at activation
        summary: Optional[str] = None,
        attendance: Optional[List[Attendee]] = None,
        map_token_seed: Optional[dict] = None,  # board as this game opened it (merge base for the next)
        map_token_state: Optional[dict] = None,  # board as this game left it
        adventure_log: Optional[list] = None,
        map_config: Optional[dict] = None,
        image_config: Optional[dict] = None,
        active_display: Optional[str] = None,
        audio_config: Optional[dict] = None,
        spotify_config: Optional[dict] = None,
    ):
        self.id = id
        self.session_id = session_id
        self.campaign_id = campaign_id
        self.host_id = host_id
        self.status = status
        self.name = name
        self.created_at = created_at
        self.started_at = started_at
        self.ended_at = ended_at
        self.ended_by = ended_by
        self.urls_expire_at = urls_expire_at
        self.summary = summary
        self.attendance = attendance if attendance is not None else []
        self.map_token_seed = map_token_seed
        self.map_token_state = map_token_state
        self.adventure_log = adventure_log
        self.map_config = map_config
        self.image_config = image_config
        self.active_display = active_display
        self.audio_config = audio_config
        self.spotify_config = spotify_config

    @classmethod
    def create(
        cls,
        session_id: UUID,
        campaign_id: UUID,
        host_id: UUID,
        name: Optional[str] = None,
    ) -> "GameAggregate":
        """Mint a game in STARTING, before api-game is asked for a room.

        The row exists first deliberately: its id is the room id, so it has to be
        decided here. `name` is the session's planned next-game name, which the
        GM set beside the date; Start hands it over and clears the plan.

        Every state field starts empty. What the room actually opens with is
        seeded from the session's newest ended game by the command, and the seed
        is stamped back on this game at activation.
        """
        if not session_id:
            raise ValueError("A game must belong to a session")
        if not campaign_id:
            raise ValueError("A game must belong to a campaign")
        if not host_id:
            raise ValueError("A game must have a host")

        game = cls(
            id=None,  # assigned by the repository
            session_id=session_id,
            campaign_id=campaign_id,
            host_id=host_id,
            status=GameStatus.STARTING,
            created_at=datetime.utcnow(),
            attendance=[],
        )
        game.rename(name)
        return game

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        session_id: UUID,
        campaign_id: UUID,
        host_id: UUID,
        status: str,
        name: Optional[str],
        created_at: Optional[datetime],
        started_at: Optional[datetime],
        ended_at: Optional[datetime],
        ended_by: Optional[str],
        urls_expire_at: Optional[datetime],
        summary: Optional[str],
        attendance: Optional[list],
        map_token_seed: Optional[dict],
        map_token_state: Optional[dict],
        adventure_log: Optional[list],
        map_config: Optional[dict],
        image_config: Optional[dict],
        active_display: Optional[str],
        audio_config: Optional[dict],
        spotify_config: Optional[dict],
    ) -> "GameAggregate":
        """Rehydrate from a row. The repository calls this directly — no mapper layer."""
        return cls(
            id=id,
            session_id=session_id,
            campaign_id=campaign_id,
            host_id=host_id,
            status=GameStatus(status),
            name=name,
            created_at=created_at,
            started_at=started_at,
            ended_at=ended_at,
            ended_by=EndReason(ended_by) if ended_by else None,
            urls_expire_at=urls_expire_at,
            summary=summary,
            attendance=[Attendee.from_dict(entry) for entry in (attendance or [])],
            map_token_seed=map_token_seed,
            map_token_state=map_token_state,
            adventure_log=adventure_log,
            map_config=map_config,
            image_config=image_config,
            active_display=active_display,
            audio_config=audio_config,
            spotify_config=spotify_config,
        )

    # --- Status queries ---

    @property
    def is_open(self) -> bool:
        """Open means a room exists or is being built or torn down for this game.

        The session's liveness is exactly this, asked of its games — which is why
        no status is stored on the session itself.
        """
        return self.status != GameStatus.ENDED

    # --- Lifecycle ---

    def activate(self, urls_expire_at: Optional[datetime], map_token_seed: dict) -> None:
        """Mark the game live, once api-game has confirmed the room exists.

        map_token_seed is the board the room actually opened with, not what we
        asked for: it is the diff base the NEXT game's three-way merge reads
        (tokens v2 decision 24), so it must record reality.

        urls_expire_at is the signed asset-URL lease deadline, computed at
        signing time a few seconds before this call — the expiry sweeper ends
        games past it.
        """
        if self.status != GameStatus.STARTING:
            raise ValueError("Only a starting game can be activated")

        self.status = GameStatus.ACTIVE
        self.started_at = datetime.utcnow()
        self.urls_expire_at = urls_expire_at
        self.map_token_seed = map_token_seed

    def begin_end(self) -> None:
        """Begin the take-down: ACTIVE → ENDING while the hot state is extracted."""
        if self.status != GameStatus.ACTIVE:
            raise ValueError("Only a running game can be ended")

        self.status = GameStatus.ENDING

    def record_end_state(self, extracted) -> None:
        """Copy the extracted hot state onto this game — where it stays, for good.

        This is the whole reason a game is a row rather than an event: the next
        game of this session seeds from these fields, and every earlier game
        keeps its own copy as the record of that night.

        The seed is NOT written here: it belongs to the game's start, and was
        stamped by activate().
        """
        if self.status != GameStatus.ENDING:
            raise ValueError("Only an ending game records its state")

        self.audio_config = extracted.audio_config
        self.spotify_config = extracted.spotify_config
        self.map_config = extracted.map_config
        self.image_config = extracted.image_config
        self.active_display = extracted.active_display
        self.adventure_log = extracted.adventure_log
        self.map_token_state = extracted.map_token_state

    def end(self, reason: EndReason, attendance: List[Attendee]) -> None:
        """Close the game for good. ENDED is terminal — there is no reopening."""
        if self.status != GameStatus.ENDING:
            raise ValueError("Only an ending game can be closed")

        self.status = GameStatus.ENDED
        self.ended_at = datetime.utcnow()
        self.ended_by = reason
        self.attendance = list(attendance)
        self.urls_expire_at = None  # the lease ends with the room

    def abort_end(self) -> None:
        """Abort a failed take-down: ENDING → ACTIVE.

        Called when the cold write fails after the hot state was extracted. The
        room still exists, so the game is genuinely still live and can be ended
        again — the alternative would strand it in ENDING with no way back.
        """
        if self.status != GameStatus.ENDING:
            raise ValueError("Only an ending game can be returned to live")

        self.status = GameStatus.ACTIVE

    # --- The record ---

    def rename(self, name: Optional[str]) -> None:
        """Name the night. Legal in any status: planned at Start, given at End,
        corrected weeks later from the campaign drawer.

        An empty or whitespace-only name clears it; the display falls back to
        "Game {n}" client-side rather than storing a generated name.
        """
        if name is None:
            self.name = None
            return

        trimmed = name.strip()
        if len(trimmed) > MAX_GAME_NAME_LENGTH:
            raise ValueError(f"Game name must be {MAX_GAME_NAME_LENGTH} characters or fewer")

        self.name = trimmed or None

    def summarise(self, summary: Optional[str]) -> None:
        """Record what happened. Same freedom as rename: any status, blank clears."""
        if summary is None:
            self.summary = None
            return

        trimmed = summary.strip()
        self.summary = trimmed or None

    # --- Asset reference management ---

    def remove_asset_references(self, asset_id_str: str) -> bool:
        """Forget a deleted asset. Returns True if anything referenced it.

        Only ever applied to a session's NEWEST ended game, because that is the
        only one a future start reads. Older games keep their record as it was:
        the map they played on did exist that night.
        """
        changed = False

        # Audio config: remove channels referencing this asset
        if self.audio_config:
            channels_to_remove = [
                channel_id for channel_id, channel in self.audio_config.items()
                if channel.get("asset_id") == asset_id_str
            ]
            for channel_id in channels_to_remove:
                del self.audio_config[channel_id]
                changed = True

        # Map config: clear if it references this asset
        if self.map_config and self.map_config.get("asset_id") == asset_id_str:
            self.map_config = {}
            if self.active_display == "map":
                self.active_display = None
            changed = True

        # Image config: clear if it references this asset
        if self.image_config and self.image_config.get("asset_id") == asset_id_str:
            self.image_config = {}
            if self.active_display == "image":
                self.active_display = None
            changed = True

        return changed
