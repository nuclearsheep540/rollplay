# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Display type enum for active display switching between map and image."""

from enum import Enum


class ActiveDisplayType(str, Enum):
    MAP = "map"
    IMAGE = "image"
