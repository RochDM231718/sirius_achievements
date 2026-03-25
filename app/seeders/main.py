import asyncio
from sqlalchemy import select
from app.infrastructure.database import async_session_maker
from app.seeders.users_table_seeder import UsersTableSeeder
from app.seeders.students_seeder import StudentsSeeder

# Import all models so SQLAlchemy can resolve relationships
from app.models.support_ticket import SupportTicket  # noqa: F401
from app.models.support_message import SupportMessage  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.user import Users
from app.models.enums import UserRole


async def seed():
    print("Seeding database...")

    async with async_session_maker() as db:
        try:
            await UsersTableSeeder.run(db)

            # Find moderator for linking approved achievements
            result = await db.execute(
                select(Users.id).where(Users.role == UserRole.MODERATOR.value).limit(1)
            )
            mod_id = result.scalar_one_or_none()

            await StudentsSeeder.run(db, moderator_id=mod_id)
            print("Database seeded successfully!")
        except Exception as e:
            print(f"Error seeding database: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(seed())