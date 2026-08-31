import admin  # noqa: F401
from uuid import UUID
from shared.dependencies.db import SessionLocal
from modules.news.repositories.news_repository import NewsRepository
from modules.news.application.commands import UpdateNewsPost
from shared.services.s3_service import get_s3_service

db = SessionLocal()
repo = NewsRepository(db)
pid = UUID("45fb72ae-693e-4099-b68d-0e2dadbd7a73")

post = repo.get_by_id(pid)
print('before:', repr(post.banner_home_top))

post.update_content(banners={'banner_home_top': 'news_media/images/test.png'})
print('after update_content:', repr(post.banner_home_top))

saved = repo.save(post)
print('after repo.save returned:', repr(saved.banner_home_top))

db.close()

db2 = SessionLocal()
fresh = NewsRepository(db2).get_by_id(pid)
print('re-read from db:', repr(fresh.banner_home_top))
db2.close()
