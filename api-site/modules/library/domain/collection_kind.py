# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Collection kind - manual member list vs stored smart filter."""

from enum import Enum


class CollectionKind(str, Enum):
    MANUAL = "manual"
    SMART = "smart"
