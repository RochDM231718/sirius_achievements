from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.admin.crud_repository import CrudRepository
from app.models.user_token import UserToken
from app.models.enums import UserTokenType

class UserTokenRepository(CrudRepository):
    def __init__(self, db: AsyncSession):
        super().__init__(db, UserToken)

    async def find_active_token(self, user_id: int, token_type: UserTokenType | str, token: str):
        token_value = token_type.value if hasattr(token_type, "value") else str(token_type)
        stmt = (
            select(self.model)
            .filter(
                UserToken.user_id == user_id,
                UserToken.token_type == token_value,
                UserToken.token == token,
                UserToken.used_at.is_(None),
            )
            .order_by(UserToken.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def invalidate_user_tokens(self, user_id: int, token_type: UserTokenType | str):
        token_value = token_type.value if hasattr(token_type, "value") else str(token_type)
        stmt = (
            update(self.model)
            .where(
                self.model.user_id == user_id,
                self.model.token_type == token_value,
                self.model.used_at.is_(None),
            )
            .values(used_at=datetime.now(timezone.utc))
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def mark_used(self, token_id: int):
        stmt = (
            update(self.model)
            .where(
                self.model.id == token_id,
                self.model.used_at.is_(None),
            )
            .values(used_at=datetime.now(timezone.utc))
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount > 0
