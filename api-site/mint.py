"""Mint a dev token for whichever account the allowlist currently names."""
import admin  # noqa: F401 — full model registry
from config.settings import Settings
from shared.jwt_helper import JWTHelper
from shared.dependencies.db import SessionLocal
from modules.user.repositories.user_repository import UserRepository

admin_email = sorted(Settings().admin_email_set)[0]
db = SessionLocal()
user = UserRepository(db).get_by_email(admin_email)
print('TK=' + JWTHelper().create_access_token(str(user.id), user.email))
db.close()
