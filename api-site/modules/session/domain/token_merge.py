# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Three-way token board merge at session start (tokens v2, decision 24).

The seed (sessions.map_token_seed) is a copy of each board as seeded at the
previous start — a diff base, exactly a git merge-base: it never feeds the
game directly. At every start the board the players see is
merge(seed, paused board, current baseline) with play-wins resolution:

- pc tokens always come from the paused board (never in a baseline).
- A DM token untouched by play (board version == seed version, or absent
  from both) is the baseline's to decide: update, add, or remove.
- A DM token touched by play (moved/configured/toggled/removed in-game)
  keeps its board state; a killed goblin stays dead even if the baseline
  still lists it.

A fresh session (empty seed, empty board) degenerates to "baseline decides
everything" — one uniform code path, no flags. Equality ignores the
server-stamped fields (updated_at, created_by).

`board_in_play` derives the workshop guard's predicate from the same
equality (decision 25: in-play is never stored): a board is in play iff it
differs from its seed. A pc token placed then removed leaves the board
equal to its seed, so it is not in play.
"""

from typing import Any, Dict, List, Optional

TOKEN_EQUALITY_IGNORED_FIELDS = ("updated_at", "created_by")


def _comparable_token(token: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if token is None:
        return None
    comparable = {}
    for field_name, field_value in token.items():
        if field_name not in TOKEN_EQUALITY_IGNORED_FIELDS:
            comparable[field_name] = field_value
    return comparable


def tokens_equal(token_a: Optional[Dict[str, Any]], token_b: Optional[Dict[str, Any]]) -> bool:
    """Whole-token equality ignoring server-stamped fields. Both-None is
    equal (a token absent from seed AND board is untouched by play)."""
    return _comparable_token(token_a) == _comparable_token(token_b)


def _tokens_by_id(tokens: Optional[List[Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    by_id = {}
    for board_token in tokens or []:
        token_id = board_token.get("id")
        if token_id:
            by_id[token_id] = board_token
    return by_id


def board_in_play(seed_tokens: Optional[List[Dict[str, Any]]],
                  board_tokens: Optional[List[Dict[str, Any]]]) -> bool:
    """True when the stored board differs from its seed in any way. A
    missing seed with a non-empty board reads as in-play (pre-seed rows:
    preserve, never destroy)."""
    seed_by_id = _tokens_by_id(seed_tokens)
    board_by_id = _tokens_by_id(board_tokens)
    if seed_by_id.keys() != board_by_id.keys():
        return True
    for token_id, seed_token in seed_by_id.items():
        if not tokens_equal(seed_token, board_by_id[token_id]):
            return True
    return False


def merge_token_boards(seed_tokens: Optional[List[Dict[str, Any]]],
                       board_tokens: Optional[List[Dict[str, Any]]],
                       baseline_tokens: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Per-token whole-token three-way merge, play wins on conflict."""
    seed_by_id = _tokens_by_id(seed_tokens)
    board_by_id = _tokens_by_id(board_tokens)
    baseline_by_id = _tokens_by_id(baseline_tokens)

    merged_tokens = []

    # pc tokens are players' state — always from the board, in board order.
    for board_token in board_tokens or []:
        if board_token.get("kind") == "pc":
            merged_tokens.append(board_token)

    # npc resolution order: authored baseline order first, then any
    # play-only npc ids (runtime-added or baseline-retired) in board order.
    npc_token_ids = []
    for baseline_token in baseline_tokens or []:
        npc_token_ids.append(baseline_token.get("id"))
    for board_token in board_tokens or []:
        if board_token.get("kind") != "pc" and board_token.get("id") not in baseline_by_id:
            npc_token_ids.append(board_token.get("id"))
    # Seed-only ids (removed from both board and baseline) need no walk:
    # both resolutions would produce nothing for them.

    seen_npc_ids = set()
    for token_id in npc_token_ids:
        if not token_id or token_id in seen_npc_ids:
            continue
        seen_npc_ids.add(token_id)

        seed_version = seed_by_id.get(token_id)
        board_version = board_by_id.get(token_id)
        baseline_version = baseline_by_id.get(token_id)

        play_touched = not tokens_equal(seed_version, board_version)
        if play_touched:
            # Play wins: keep the board's version; a play-removal (board
            # absent, seed present) stays removed even if still authored.
            if board_version is not None:
                merged_tokens.append(board_version)
        else:
            # Untouched by play: the current baseline decides — update,
            # add, or (by absence) remove.
            if baseline_version is not None:
                merged_tokens.append(baseline_version)

    return merged_tokens
