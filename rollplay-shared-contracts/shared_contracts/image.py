# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Image boundary schema for the ETL between api-site and api-game."""

from typing import List, Optional, Tuple, Union

from pydantic import Field, field_validator

from .base import ContractModel
from .cine import MotionConfig, VisualOverlay


class FocalArea(ContractModel):
    """A square sub-region of a source image, native pixels, top-left anchor
    (tokens v2, decision 27). Purpose-keyed on the image asset
    (image_assets.focal_areas: {"token": FocalArea, ...}) so later purposes
    slot in with zero migrations. Square by contract: one side length, no
    width/height pair. For a purpose whose consumer is not square, see
    FocalRegion."""

    x: float = Field(..., ge=0, allow_inf_nan=False)
    y: float = Field(..., ge=0, allow_inf_nan=False)
    size: float = Field(..., gt=0, allow_inf_nan=False)


class FocalRegion(ContractModel):
    """A rectangular sub-region of a source image, native pixels, top-left
    anchor. The sibling of FocalArea for purposes whose consumer is wide —
    the "card" purpose behind campaign cards is picked at 16:4, and a square
    can only say where its centre is. Which shape a purpose stores is that
    purpose's convention; a consumer reads the centre through focal_center
    and need not know."""

    x: float = Field(..., ge=0, allow_inf_nan=False)
    y: float = Field(..., ge=0, allow_inf_nan=False)
    width: float = Field(..., gt=0, allow_inf_nan=False)
    height: float = Field(..., gt=0, allow_inf_nan=False)


FocalShape = Union[FocalArea, FocalRegion]


def focal_center(area) -> Tuple[float, float]:
    """The centre of a focal square or region, in native pixels.

    Accepts either model or a raw dict of either shape, because consumers
    bias a cover-fit image toward the centre and that is the one thing both
    shapes agree on. Raises ValueError for a dict that is neither.
    """
    if isinstance(area, (FocalArea, FocalRegion)):
        values = area.model_dump()
    else:
        values = dict(area)
    if "size" in values:
        return (values["x"] + values["size"] / 2, values["y"] + values["size"] / 2)
    if "width" in values and "height" in values:
        return (values["x"] + values["width"] / 2, values["y"] + values["height"] / 2)
    raise ValueError("a focal area has either size, or width and height")


class ImageConfig(ContractModel):
    """Image state for ETL boundary."""

    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str  # Presigned S3 URL
    file_size: Optional[int] = None  # Size in bytes

    image_fit: str = "float"  # "float" | "wrap" | "letterbox"
    display_mode: str = "standard"  # "standard" | "cine"

    @field_validator('image_fit', mode='before')
    @classmethod
    def coerce_image_fit(cls, v):
        if v == "cine":
            return "letterbox"  # Legacy: old "cine" display_mode treated as letterbox
        return v if v is not None else "float"

    @field_validator('display_mode', mode='before')
    @classmethod
    def coerce_display_mode(cls, v):
        if v in ("standard", "cine"):
            return v
        return "standard"

    aspect_ratio: Optional[str] = None  # e.g. "2.39:1", "16:9" — only for letterbox
    image_position_x: Optional[float] = None  # 0–100%
    image_position_y: Optional[float] = None  # 0–100%

    # Visual effects — independent of display mode
    visual_overlays: Optional[List[VisualOverlay]] = None
    motion: Optional[MotionConfig] = None
