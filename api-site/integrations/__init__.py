# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""External-service integrations (anti-corruption layers).

Unlike `modules/`, which holds core business aggregates, this package holds
integrations with third-party services (e.g. Spotify OAuth). These are not
domain aggregates — they talk to external APIs and store only the credentials/
state needed to do so.
"""
