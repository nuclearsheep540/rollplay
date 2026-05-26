# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character API router — placeholder for Phase 2.

The v1 routes (POST /create, GET /, PUT /:id, etc.) were removed alongside the
schema rewrite. Phase 2 plugs in the draft / autosave / runtime / level-up
endpoints described in .claude/plans/character-v2.md.

This module still exports ``router`` so main.py's existing import keeps working
without conditionally enabling Phase 2's routes.
"""

from fastapi import APIRouter


router = APIRouter()
