# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Base model for all shared contracts — enforces strict field validation."""

from pydantic import BaseModel, ConfigDict


class ContractModel(BaseModel):
    """Base class for all shared contract models.

    Sets extra='forbid' so unknown fields raise a ValidationError immediately
    rather than being silently dropped. This catches contract drift early —
    if a field is renamed or added on one side of the boundary, the other side
    will fail loudly instead of silently ignoring the data.
    """

    model_config = ConfigDict(extra="forbid")
