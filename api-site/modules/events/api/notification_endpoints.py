# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import logging

from modules.events.application.queries import GetRecentNotifications
from modules.events.application.commands import MarkNotificationAsRead, MarkAllNotificationsAsRead
from modules.events.domain.event_config import EventConfig
from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.dependencies.providers import get_notification_repository, get_event_manager
from shared.dependencies.auth import get_current_user_id
from .schemas import NotificationResponse
from modules.events.event_manager import EventManager
from config.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notifications"])


def _to_notification_response(notification) -> NotificationResponse:
    """Convert notification aggregate to response model"""
    return NotificationResponse(
        id=str(notification.id),
        event_type=notification.event_type,
        data=notification.data,
        read=notification.read,
        created_at=notification.created_at
    )


@router.get("/unread", response_model=List[NotificationResponse])
async def get_unread_notifications(
    user_id: UUID = Depends(get_current_user_id),
    notification_repo: NotificationRepository = Depends(get_notification_repository)
):
    """Get 7 most recent notifications (read and unread)"""
    query = GetRecentNotifications(notification_repo)
    notifications = query.execute(user_id, limit=7, unread_only=False)
    return [_to_notification_response(n) for n in notifications]


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    notification_repo: NotificationRepository = Depends(get_notification_repository)
):
    """Mark notification as read"""
    try:
        command = MarkNotificationAsRead(notification_repo)
        success = command.execute(notification_id, user_id)
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/read-all")
async def mark_all_read(
    user_id: UUID = Depends(get_current_user_id),
    notification_repo: NotificationRepository = Depends(get_notification_repository)
):
    """Mark all notifications as read for current user"""
    command = MarkAllNotificationsAsRead(notification_repo)
    count = command.execute(user_id)
    return {"success": True, "marked_read": count}


@router.post("/test-notification")
async def send_test_notification(
    user_id: UUID = Depends(get_current_user_id),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Send test notification (development only)"""
    settings = Settings()
    logger.info(f"Test notification endpoint - environment: {settings.ENVIRONMENT}")
    if settings.ENVIRONMENT != "development":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only available in development (current: {settings.ENVIRONMENT})"
        )

    # Broadcast test event
    await event_manager.broadcast(EventConfig(
        user_id=user_id,
        event_type="friend_request_received",
        data={
            "requester_id": str(user_id),
            "requester_screen_name": "Test User",
            "request_id": str(uuid4())
        },
        show_toast=True,
        save_notification=True
    ))

    return {"success": True, "message": "Test notification sent"}
