# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from modules.news.domain.news_post_aggregate import NewsPostAggregate
from modules.news.repositories.news_repository import NewsRepository


class GetLatestPublishedPost:
    """The one post Home shows."""

    def __init__(self, news_repo: NewsRepository):
        self.news_repo = news_repo

    def execute(self) -> Optional[NewsPostAggregate]:
        return self.news_repo.get_latest_published()


class GetNewsPostById:
    def __init__(self, news_repo: NewsRepository):
        self.news_repo = news_repo

    def execute(self, post_id: UUID) -> Optional[NewsPostAggregate]:
        return self.news_repo.get_by_id(post_id)


class GetAllNewsPosts:
    """Every post, for the editor index."""

    def __init__(self, news_repo: NewsRepository):
        self.news_repo = news_repo

    def execute(self) -> List[NewsPostAggregate]:
        return self.news_repo.get_all()
