# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Admin management commands — Flask-style, run from inside the box.

Invokes application code in-process (no HTTP, no auth layer — shell access
is the auth), reusing the same commands and ETL guarantees the app itself
uses. The expired-session sweeper established the wiring pattern this
follows: repositories off SessionLocal, the real PauseSession command,
acting as the session host.

Usage (dev):
    docker exec -it api-site-dev python admin.py list-active
    docker exec -it api-site-dev python admin.py pause-session <session-id>
    docker exec -it api-site-dev python admin.py pause-all [--yes]

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
from integrations.spotify.models import SpotifyAccount  # noqa: F401
from modules.session.application.commands import PauseSession
from modules.characters.repositories.character_repository import CharacterRepository
from modules.user.application.commands import SetMaxSlots, UserNotFoundError
from modules.session.repositories.session_repository import SessionRepository
from modules.user.repositories.user_repository import UserRepository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.websocket_manager import event_connection_manager
from modules.events.event_manager import EventManager


def _run_draining_tasks(coroutine):
    """Run an async command and let its fire-and-forget tasks finish.

    asyncio.run() closes its loop the moment the main coroutine returns,
    CANCELLING anything still scheduled — and PauseSession spawns its phase-3
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
    """List all currently ACTIVE sessions."""
    db = SessionLocal()
    try:
        session_repo = SessionRepository(db)
        campaign_repo = CampaignRepository(db)
        user_repo = UserRepository(db)

        active_sessions = session_repo.get_active_sessions()
        if not active_sessions:
            click.echo("No active sessions.")
            return

        click.echo(f"{len(active_sessions)} active session(s):\n")
        for session in active_sessions:
            campaign = campaign_repo.get_by_id(session.campaign_id)
            host = user_repo.get_by_id(session.host_id)
            campaign_title = campaign.title if campaign else "<deleted campaign>"
            host_name = (host.screen_name or host.email) if host else "<unknown host>"
            started = session.started_at.isoformat() if session.started_at else "-"
            lease = session.urls_expire_at.isoformat() if session.urls_expire_at else "-"

            click.echo(f"  session   {session.id}")
            click.echo(f"  name      {session.name}")
            click.echo(f"  campaign  {campaign_title} ({session.campaign_id})")
            click.echo(f"  host      {host_name}")
            click.echo(f"  started   {started}")
            click.echo(f"  url lease {lease}")
            click.echo("")
    finally:
        db.close()

def _build_pause_command(db, session_repo):
    """The sweeper's wiring: the real PauseSession, acting as the session host."""
    return PauseSession(
        session_repository=session_repo,
        user_repository=UserRepository(db),
        character_repository=None,  # pause doesn't use it
        campaign_repository=CampaignRepository(db),
        event_manager=EventManager(event_connection_manager, NotificationRepository(db)),
        asset_repository=MediaAssetRepository(db),
    )


@admin.command("pause-all")
@click.option("--yes", is_flag=True, help="Skip the confirmation prompt.")
def pause_all_sessions(yes):
    """Gracefully pause EVERY active session with full ETL.

    Sessions are paused independently — one wedged game doesn't block the
    rest (sweeper pattern). Exit code is non-zero if any session failed.
    """
    db = SessionLocal()
    try:
        session_repo = SessionRepository(db)
        active_sessions = session_repo.get_active_sessions()
        if not active_sessions:
            click.echo("No active sessions.")
            return

        click.echo(f"{len(active_sessions)} active session(s) will be paused.")
        if not yes:
            click.confirm("Pause them all?", abort=True)

        pause = _build_pause_command(db, session_repo)
        paused_count = 0
        failed_count = 0
        for session in active_sessions:
            if session.id is None or session.host_id is None:
                # Unreachable for DB-loaded rows — narrows the aggregate's
                # Optional ids for the type checker.
                continue
            try:
                _run_draining_tasks(pause.execute(session.id, host_id=session.host_id))
                click.echo(f"  paused  {session.id} ('{session.name}')")
                paused_count += 1
            except ValueError as reason:
                # Benign races (e.g. the host paused it between our query and
                # this call) and guarded ETL failures — message says which.
                click.echo(f"  skipped {session.id} ({reason})")
                failed_count += 1
            except Exception as unexpected:
                click.echo(f"  FAILED  {session.id} ({unexpected})")
                failed_count += 1

        click.echo(f"\nDone: {paused_count} paused, {failed_count} skipped/failed.")
        if failed_count:
            raise SystemExit(1)
    finally:
        db.close()


@admin.command("pause-session")
@click.argument("session_id")
def pause_session(session_id):
    """Gracefully pause an ACTIVE session via the full ETL (resumable).

    Acts as the session host (the sweeper precedent) — live players get the
    proper end-of-session flow and all state lands cold.
    """
    try:
        parsed_session_id = UUID(session_id)
    except ValueError:
        raise click.BadParameter(f"'{session_id}' is not a valid session UUID")

    db = SessionLocal()
    try:
        session_repo = SessionRepository(db)
        session = session_repo.get_by_id(parsed_session_id)
        if not session or session.id is None or session.host_id is None:
            raise click.ClickException(f"Session {parsed_session_id} not found")

        pause = _build_pause_command(db, session_repo)

        try:
            _run_draining_tasks(pause.execute(session.id, host_id=session.host_id))
        except ValueError as reason:
            # PauseSession's ACTIVE-only guard and ETL failures surface here
            # with self-explanatory messages (session already paused, api-game
            # unreachable with the game preserved for retry, ...).
            raise click.ClickException(str(reason))

        click.echo(f"Session {session.id} ('{session.name}') paused — state persisted, resumable.")
    finally:
        db.close()


@admin.command("set-max-slots")
@click.argument("email")
@click.argument("max_slots", type=int)
def set_max_slots(email, max_slots):
    """Set a user's character capacity (1-8) by email.

    Decreasing hides characters above the new limit (rows untouched) and
    ejects them from their campaigns; refused while any affected campaign has
    a live session. This command is the knob — a raw UPDATE changes the number
    but skips the ejection.
    """
    db = SessionLocal()
    try:
        user_repo = UserRepository(db)
        user = user_repo.get_by_email(email)
        if not user:
            raise click.ClickException(f"No user with email {email}")

        command = SetMaxSlots(user_repo, CharacterRepository(db), SessionRepository(db))
        try:
            command.execute(user_id=user.id, max_slots=max_slots)
        except (ValueError, UserNotFoundError) as reason:
            raise click.ClickException(str(reason))

        click.echo(f"{email}: max_slots set to {max_slots}")
    finally:
        db.close()


if __name__ == "__main__":
    admin()
