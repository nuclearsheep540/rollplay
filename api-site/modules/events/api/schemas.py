# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from datetime import datetime
from typing import Dict, Any

class NotificationResponse(BaseModel):
    id: str
    event_type: str
    data: Dict[str, Any]
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True
