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

Staleness is lazily expired on access: v1 sends no mid-drag frames, so a hold
older than HOLD_STALENESS_SECONDS is treated as abandoned (browser gone
mid-drag without a clean disconnect). A same-user re-grab refreshes the clock.
"""

import time
from typing import Dict, List, Optional, Tuple

HOLD_STALENESS_SECONDS = 10.0


class MapTokenHolds:
    def __init__(self, staleness_seconds: float = HOLD_STALENESS_SECONDS, clock=time.monotonic):
        # room_id -> {token_id: (holder_user_id, grabbed_at)}
        self._holds: Dict[str, Dict[str, Tuple[str, float]]] = {}
        self._staleness_seconds = staleness_seconds
        self._clock = clock

    def holder(self, room_id: str, token_id: str) -> Optional[str]:
        """Current holder's user_id, or None if unheld (stale holds expire here)."""
        room_holds = self._holds.get(room_id)
        if not room_holds:
            return None

        entry = room_holds.get(token_id)
        if entry is None:
            return None

        holder_user_id, grabbed_at = entry
        if self._clock() - grabbed_at > self._staleness_seconds:
            del room_holds[token_id]
            if not room_holds:
                del self._holds[room_id]
            return None
        return holder_user_id

    def try_grab(self, room_id: str, token_id: str, user_id: str) -> Optional[str]:
        """Grab a token. Returns None on success, or the blocking holder's
        user_id when denied. A same-user grab succeeds and refreshes the clock."""
        current_holder = self.holder(room_id, token_id)
        if current_holder is not None and current_holder != user_id:
            return current_holder

        self._holds.setdefault(room_id, {})[token_id] = (user_id, self._clock())
        return None

    def release(self, room_id: str, token_id: str, user_id: str) -> bool:
        """Release a token if user_id holds it. Returns whether a hold was cleared."""
        if self.holder(room_id, token_id) != user_id:
            return False

        del self._holds[room_id][token_id]
        if not self._holds[room_id]:
            del self._holds[room_id]
        return True

    def release_all_for_user(self, room_id: str, user_id: str) -> List[str]:
        """Clear every hold user_id has in a room (disconnect cleanup).
        Returns the released token_ids."""
        room_holds = self._holds.get(room_id)
        if not room_holds:
            return []

        released_token_ids = []
        for token_id, (holder_user_id, _grabbed_at) in list(room_holds.items()):
            if holder_user_id == user_id:
                del room_holds[token_id]
                released_token_ids.append(token_id)

        if not room_holds:
            del self._holds[room_id]
        return released_token_ids

    def clear_room(self, room_id: str) -> None:
        """Drop all holds for a room (session ended)."""
        self._holds.pop(room_id, None)
