# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Events module for real-time state synchronization via WebSocket.

This module handles:
- WebSocket connection management (per-user)
- Event broadcasting to connected clients
- Optional notification persistence
- Toast trigger flags for frontend
"""
