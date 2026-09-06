# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Admin management commands — Flask-style, run from inside the box.

Invokes application code in-process (no HTTP, no auth layer — shell access
is the auth), reusing the same commands and ETL guarantees the app itself
uses. The expired-session sweeper established the wiring pattern this
follows: repositories off SessionLocal, the real EndGame command,
acting as the session host.

Usage (dev):
    docker exec -it api-site-dev python admin.py list-active
    docker exec -it api-site-dev python admin.py pause-session <session-id>
    docker exec -it api-site-dev python admin.py pause-all [--yes]
    docker exec -it api-site-dev python admin.py restore-news

Pausing via the ETL is fully graceful for live players: state lands cold
(resumable), and api-game closes the room's websockets with a proper
"Session ended". Two small asymmetries vs a host-initiated pause, both
shared with the sweeper: dashboard real-time toasts don't fire from this
separate process (persisted notifications still appear on next fetch), and
the pause notification attributes to the host.
"""

import asyncio
from uuid import UUID

import click

from shared.dependencies.db import SessionLocal

# Import the FULL model registry before any query runs. SQLAlchemy resolves
# string relationships ("Edition", "Campaign", ...) lazily at first mapper
# use, and a CLI process only sees models reachable from its own imports —
# without the complete set, the first query dies in mapper configuration.
# Same list, same reason as alembic/env.py (the canonical registry).
from modules.user.model.user_model import User  # noqa: F401
from modules.user.model.friend_code_model import FriendCode  # noqa: F401
from modules.characters.model.character_model import Character  # noqa: F401
from modules.characters.model.edition_model import Edition  # noqa: F401
from modules.characters.model.character_class_model import CharacterClassEntry  # noqa: F401
from modules.characters.model.dnd_ability_model import DndAbility  # noqa: F401
from modules.characters.model.character_ability_model import CharacterAbilityScore  # noqa: F401
from modules.characters.model.character_save_model import CharacterSaveProficiency  # noqa: F401
from modules.characters.model.character_skill_model import CharacterSkillProficiency  # noqa: F401
from modules.characters.model.character_feat_model import CharacterFeatAcquisition  # noqa: F401
from modules.characters.model.character_spell_model import CharacterSpell  # noqa: F401
from modules.characters.model.character_resource_model import CharacterResource  # noqa: F401
from modules.characters.model.character_subclass_model import CharacterSubclass  # noqa: F401
from modules.characters.model.character_inventory_model import CharacterInventoryItem  # noqa: F401
from modules.characters.model.character_choices_log_model import CharacterChoiceLog  # noqa: F401
from modules.campaign.model.campaign_model import Campaign  # noqa: F401
from modules.campaign.model.campaign_member_model import CampaignMember  # noqa: F401
from modules.session.model.session_model import Session, SessionJoinedUser  # noqa: F401
from modules.friendship.model.friend_request_model import FriendRequestModel  # noqa: F401
from modules.friendship.model.friendship_model import FriendshipModel  # noqa: F401
from modules.events.model.notification_model import Notification  # noqa: F401
from modules.library.model.asset_model import MediaAsset  # noqa: F401
from modules.library.model.map_asset_model import MapAssetModel  # noqa: F401
from modules.library.model.music_asset_model import MusicAssetModel  # noqa: F401
from modules.library.model.sfx_asset_model import SfxAssetModel  # noqa: F401
from modules.library.model.image_asset_model import ImageAssetModel  # noqa: F401
from modules.library.model.preset_model import PresetModel  # noqa: F401
from modules.news.model.news_post_model import NewsPost  # noqa: F401
from modules.news.model.news_post_like_model import NewsPostLike  # noqa: F401
from modules.news.model.news_post_read_model import NewsPostRead  # noqa: F401
from modules.game.model.game_model import Game  # noqa: F401
from integrations.spotify.models import SpotifyAccount  # noqa: F401
from modules.game.application.commands import EndGame
from modules.game.domain.game_aggregate import EndReason
from modules.game.repositories.game_repository import GameRepository
from modules.characters.repositories.character_repository import CharacterRepository
from modules.user.application.commands import SetMaxSlots, UserNotFoundError
from modules.session.repositories.session_repository import SessionRepository
from modules.user.repositories.user_repository import UserRepository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.websocket_manager import event_connection_manager
from modules.events.event_manager import EventManager
from modules.news.application.commands import RestoreNewsFromBackup
from modules.news.repositories.news_repository import NewsRepository
from shared.services.s3_service import get_s3_service


def _run_draining_tasks(coroutine):
    """Run an async command and let its fire-and-forget tasks finish.

    asyncio.run() closes its loop the moment the main coroutine returns,
    CANCELLING anything still scheduled — and EndGame spawns its phase-3
    cleanup (api-game room delete + "Session ended" socket close) via
    asyncio.create_task. The app's long-lived loop never hits this; a fresh
    CLI loop does. So: await the command, then drain every remaining task
    before the loop closes. Cleanup failures log themselves and the hourly
    orphan cron remains the backstop, exactly as in the app.
    """
    async def run_then_drain():
        result = await coroutine
        pending = [task for task in asyncio.all_tasks() if task is not asyncio.current_task()]
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        return result

    return asyncio.run(run_then_drain())


@click.group()
def admin():
    """Rollplay admin commands (api-site)."""


@admin.command("list-active")
def list_active():
    """List every game currently open."""
    db = SessionLocal()
    try:
        game_repo = GameRepository(db)
        campaign_repo = CampaignRepository(db)
        user_repo = UserRepository(db)

        open_games = game_repo.get_open_games()
        if not open_games:
            click.echo("No games running.")
            return

        click.echo(f"{len(open_games)} game(s) open:\n")
        for game in open_games:
            campaign = campaign_repo.get_by_id(game.campaign_id)
            host = user_repo.get_by_id(game.host_id)
            campaign_title = campaign.title if campaign else "<deleted campaign>"
            host_name = (host.screen_name or host.email) if host else "<unknown host>"
            started = game.started_at.isoformat() if game.started_at else "-"
            lease = game.urls_expire_at.isoformat() if game.urls_expire_at else "-"

            click.echo(f"  game      {game.id} ({game.status})")
            click.echo(f"  campaign  {campaign_title} ({game.campaign_id})")
            click.echo(f"  host      {host_name}")
            click.echo(f"  started   {started}")
            click.echo(f"  url lease {lease}")
            click.echo("")
    finally:
        db.close()

def _build_end_command(db, game_repo):
    """The sweeper's wiring: the real EndGame, acting as the game's host."""
    return EndGame(
        game_repository=game_repo,
        session_repository=SessionRepository(db),
        user_repository=UserRepository(db),
        character_repository=None,  # the take-down doesn't use it
        campaign_repository=CampaignRepository(db),
        event_manager=EventManager(event_connection_manager, NotificationRepository(db), UserRepository(db)),
        asset_repository=MediaAssetRepository(db),
    )


@admin.command("end-all-games")
@click.option("--yes", is_flag=True, help="Skip the confirmation prompt.")
def end_all_games(yes):
    """Gracefully end EVERY open game with the full ETL.

    Games are ended independently — one wedged game doesn't block the rest
    (sweeper pattern). Exit code is non-zero if any game failed.
    """
    db = SessionLocal()
    try:
        game_repo = GameRepository(db)
        open_games = game_repo.get_open_games()
        if not open_games:
            click.echo("No games running.")
            return

        click.echo(f"{len(open_games)} game(s) will be ended.")
        if not yes:
            click.confirm("End them all?", abort=True)

        end_game = _build_end_command(db, game_repo)
        ended_count = 0
        failed_count = 0
        for game in open_games:
            if game.id is None or game.host_id is None:
                # Unreachable for DB-loaded rows — narrows the aggregate's
                # Optional ids for the type checker.
                continue
            try:
                _run_draining_tasks(end_game.execute(game.id, host_id=game.host_id, reason=EndReason.SYSTEM))
                click.echo(f"  ended   {game.id}")
                ended_count += 1
            except ValueError as reason:
                # Benign races (e.g. the host ended it between our query and
                # this call) and guarded ETL failures — message says which.
                click.echo(f"  skipped {game.id} ({reason})")
                failed_count += 1
            except Exception as unexpected:
                click.echo(f"  FAILED  {game.id} ({unexpected})")
                failed_count += 1

        click.echo(f"\nDone: {ended_count} ended, {failed_count} skipped/failed.")
        if failed_count:
            raise SystemExit(1)
    finally:
        db.close()


@admin.command("end-game")
@click.argument("game_id")
def end_game_command(game_id):
    """Gracefully end one open game via the full ETL.

    Acts as the game's host (the sweeper precedent) — live players get the
    proper end-of-game flow and all state lands cold, so the next game seeds
    from it exactly as if the GM had pressed End game.
    """
    try:
        parsed_game_id = UUID(game_id)
    except ValueError:
        raise click.BadParameter(f"'{game_id}' is not a valid game UUID")

    db = SessionLocal()
    try:
        game_repo = GameRepository(db)
        game = game_repo.get_by_id(parsed_game_id)
        if not game or game.id is None or game.host_id is None:
            raise click.ClickException(f"Game {parsed_game_id} not found")

        end_game = _build_end_command(db, game_repo)

        try:
            _run_draining_tasks(end_game.execute(game.id, host_id=game.host_id, reason=EndReason.SYSTEM))
        except ValueError as reason:
            # EndGame's ACTIVE-only guard and ETL failures surface here with
            # self-explanatory messages (game already ended, api-game
            # unreachable with the room preserved for retry, ...).
            raise click.ClickException(str(reason))

        click.echo(f"Game {game.id} ended — state persisted; the next game seeds from it.")
    finally:
        db.close()


@admin.command("set-max-slots")
@click.argument("email")
@click.argument("max_slots", type=int)
def set_max_slots(email, max_slots):
    """Set a user's character capacity (1-8) by email.

    Decreasing hides characters above the new limit (rows untouched) and
    ejects them from their campaigns; refused while any affected campaign has
    a game running. This command is the knob — a raw UPDATE changes the number
    but skips the ejection.
    """
    db = SessionLocal()
    try:
        user_repo = UserRepository(db)
        user = user_repo.get_by_email(email)
        if not user:
            raise click.ClickException(f"No user with email {email}")

        command = SetMaxSlots(user_repo, CharacterRepository(db), GameRepository(db))
        try:
            command.execute(user_id=user.id, max_slots=max_slots)
        except (ValueError, UserNotFoundError) as reason:
            raise click.ClickException(str(reason))

        click.echo(f"{email}: max_slots set to {max_slots}")
    finally:
        db.close()


@admin.command("restore-news")
def restore_news():
    """Rebuild the news tables from their S3 backup documents.

    Every news save writes a complete copy of the post to S3, so authored
    content outlives the database it was served from — which matters in dev,
    where dropping the database to reset migrations is routine.

    Posts already present are skipped, so this is safe to re-run. Likes and
    read receipts are NOT restored: they reference users who no longer exist
    after a wipe.
    """
    db = SessionLocal()
    try:
        command = RestoreNewsFromBackup(NewsRepository(db), get_s3_service())
        result = command.execute()
        click.echo(
            f"news restore: {result['restored']} restored, "
            f"{result['skipped']} already present"
        )
    finally:
        db.close()


if __name__ == "__main__":
    admin()
