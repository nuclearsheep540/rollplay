# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from enum import Enum


class CampaignRole(str, Enum):
    """
    Campaign membership role enumeration.

    Each user has exactly one role per campaign (enforced by unique constraint
    on campaign_members table). Roles are not hierarchical — they are lateral
    assignments with different permissions.

    DM is immutable — set once at campaign creation, cannot be changed via set_role().

    INVITED  — Pending invite acceptance
    SPECTATOR — Accepted invite, default state — can watch sessions, cannot select character
    PLAYER   — Has character locked to campaign — can sit in party seats
    MOD      — Assigned by DM — can moderate, cannot have a character
    DM       — Campaign creator — runs sessions, full control
    """

    INVITED = "invited"
    SPECTATOR = "spectator"
    PLAYER = "player"
    MOD = "mod"
    DM = "dm"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'CampaignRole':
        """Create CampaignRole from string value."""
        for role in cls:
            if role.value == value:
                return role
        raise ValueError(f"Invalid campaign role: {value}")
