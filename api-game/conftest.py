# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Pytest anchor for api-game.

Loading this conftest puts the api-game root on sys.path, so tests import
application modules (`from map_token_ops import ...`) identically under both
`pytest` and `python -m pytest`, matching how uvicorn resolves them at runtime.
"""
