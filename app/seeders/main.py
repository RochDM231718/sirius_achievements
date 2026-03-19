import asyncio
from app.infrastructure.database import async_session_maker
from app.seeders.users_table_seeder import UsersTableSeeder

# Import all models so SQLAlchemy can resolve relationships
from app.models.support_ticket import SupportTicket  # noqa: F401
from app.models.support_message import SupportMessage  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401


async def seed():
    print("Seeding database...")

    async with async_session_maker() as db:
        try:
            await UsersTableSeeder.run(db)
            print("Database seeded successfully!")
        except Exception as e:
            print(f"Error seeding database: {e}")

if __name__ == "__main__":
    asyncio.run(seed())