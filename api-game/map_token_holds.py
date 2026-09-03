# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""In-memory registry of actively-held (grabbed) map tokens, per room.

This is presence state, not game state: it records whose hand is on which
mini right now. It is never persisted, dies with the process, and can never
become committed state without a lane-1 map_token_update the server writes.

The hold-lock is concurrency, not ownership (product decision 11): anyone may
move any token — just not one currently in someone else's hand. First grab
wins; a competing grab is denied and the requester's optimistic drag snaps
back.

Holds are keyed (asset_id, token_id) within a room: token ids are only
unique per map board, and NPC drafts deliberately reuse one id across maps
(per-map stamps) — a hold on map A must never block or steer the same-id
token on map B across an active-map switch.

A hold lives until its holder releases it or disconnects, and there is
deliberately NO idle expiry (decision 54). A hand held still is still a hand:
holding a mini in place while the table talks is ordinary play, and the
10-second staleness this module used to enforce ended those holds mid-drag,
telling the table a mini was free while its owner's hand was visibly on it.
Liveness is the websocket connection, never the pointer — a browser that
vanishes without a clean close is caught by uvicorn's websocket ping
(--ws-ping-interval / --ws-ping-timeout, set explicitly in the api-game
Dockerfiles), whose disconnect runs release_all_for_user below.
"""

from typing import Dict, List, Optional, Tuple


class MapTokenHolds:
    def __init__(self):
        # room_id -> {(asset_id, token_id): holder_user_id}
        self._holds: Dict[str, Dict[Tuple[str, str], str]] = {}

    def holder(self, room_id: str, asset_id: str, token_id: str) -> Optional[str]:
        """Current holder's user_id, or None if unheld."""
        room_holds = self._holds.get(room_id)
        if not room_holds:
            return None
        return room_holds.get((asset_id, token_id))

    def try_grab(self, room_id: str, asset_id: str, token_id: str, user_id: str) -> Optional[str]:
        """Grab a token. Returns None on success, or the blocking holder's
        user_id when denied. A same-user grab succeeds as an idempotent
        re-grab (a client that reconnects mid-drag reclaims its own hold)."""
        current_holder = self.holder(room_id, asset_id, token_id)
        if current_holder is not None and current_holder != user_id:
            return current_holder

        self._holds.setdefault(room_id, {})[(asset_id, token_id)] = user_id
        return None

    def release(self, room_id: str, asset_id: str, token_id: str, user_id: str) -> bool:
        """Release a token if user_id holds it. Returns whether a hold was cleared."""
        if self.holder(room_id, asset_id, token_id) != user_id:
            return False

        del self._holds[room_id][(asset_id, token_id)]
        if not self._holds[room_id]:
            del self._holds[room_id]
        return True

    def release_all_for_user(self, room_id: str, user_id: str) -> List[Tuple[str, str]]:
        """Clear every hold user_id has in a room (disconnect cleanup — the
        only thing besides an explicit release that ends a hold).
        Returns the released (asset_id, token_id) pairs."""
        room_holds = self._holds.get(room_id)
        if not room_holds:
            return []

        released_keys = []
        for hold_key, holder_user_id in list(room_holds.items()):
            if holder_user_id == user_id:
                del room_holds[hold_key]
                released_keys.append(hold_key)

        if not room_holds:
            del self._holds[room_id]
        return released_keys

    def clear_room(self, room_id: str) -> None:
        """Drop all holds for a room (session ended)."""
        self._holds.pop(room_id, None)
