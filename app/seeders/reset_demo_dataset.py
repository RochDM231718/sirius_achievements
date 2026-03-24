import asyncio
import base64
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from passlib.context import CryptContext
from sqlalchemy import delete, select

sys.path.insert(0, "/app")

from app.infrastructure.database import async_session_maker
from app.models.achievement import Achievement
from app.models.enums import (
    AchievementCategory,
    AchievementLevel,
    AchievementResult,
    AchievementStatus,
    EducationLevel,
    SupportTicketStatus,
    UserRole,
    UserStatus,
)
from app.models.notification import Notification
from app.models.season_result import SeasonResult
from app.models.support_message import SupportMessage
from app.models.support_ticket import SupportTicket
from app.models.user import Users
from app.models.user_token import UserToken


COMMON_PASSWORD = "Sirius123!"
KEEP_EMAILS = {
    "super.admin@example.com",
    "moderator@example.com",
    "yaroslavroch1@gmail.com",
    "yaroslavroch2@gmail.com",
}
ACTIVE_STUDENTS_COUNT = 82
PENDING_APPLICATIONS_COUNT = 18
SUPPORT_TICKETS_COUNT = 32

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACHIEVEMENTS_DIR = Path("/app/static/uploads/achievements/demo_seed")

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAMUlEQVR42u3PAQ0AAAgDIN8/9K3h"
    "HFQgG2Qyk8lkMplMJpPJZDKZTCaTyWQymUwmk8lkMln8G2oAAS+Vj0cAAAAASUVORK5CYII="
)

COURSE_LIMITS = {
    EducationLevel.COLLEGE: 4,
    EducationLevel.BACHELOR: 4,
    EducationLevel.SPECIALIST: 6,
    EducationLevel.MASTER: 2,
    EducationLevel.POSTGRADUATE: 4,
}

GROUPS = {
    EducationLevel.COLLEGE: ["К-1", "К-2"],
    EducationLevel.BACHELOR: ["Б-1", "Б-2"],
    EducationLevel.SPECIALIST: ["С-1", "С-2"],
    EducationLevel.MASTER: ["М-1", "М-2"],
    EducationLevel.POSTGRADUATE: ["А-1", "А-2"],
}

FIRST_NAMES = [
    "Алексей", "Мария", "Дмитрий", "Екатерина", "Андрей", "Ольга", "Сергей", "Анна",
    "Павел", "Наталья", "Игорь", "Татьяна", "Максим", "Юлия", "Роман", "Артём",
    "Виктория", "Кирилл", "Елена", "Денис", "Алина", "Никита", "Дарья", "Владислав",
    "Полина", "Глеб", "Вероника", "Тимур", "Карина", "Илья", "Софья", "Арсений",
    "Валерия", "Матвей", "Диана", "Георгий", "Ксения", "Леонид", "Милана", "Фёдор",
]

LAST_NAMES = [
    "Иванов", "Петрова", "Сидоров", "Козлова", "Новиков", "Морозова", "Волков",
    "Лебедева", "Соколов", "Кузнецова", "Попов", "Васильева", "Зайцев", "Павлова",
    "Семёнов", "Белов", "Громова", "Орлов", "Фёдорова", "Щербаков", "Тарасова",
    "Жуков", "Медведева", "Крылов", "Егорова", "Антонов", "Степанова", "Филиппов",
    "Комарова", "Захаров", "Данилова", "Борисов", "Гусева", "Титов", "Романова",
    "Калинин", "Воронова", "Савельев", "Абрамова", "Панов",
]

SUPPORT_SUBJECTS = [
    "Не приходит письмо подтверждения",
    "Нужна помощь с загрузкой диплома",
    "Документ завис на проверке",
    "Не отображаются баллы в рейтинге",
    "Хочу уточнить статус обращения",
    "Ошибка при отправке нового документа",
    "Нужно изменить данные профиля",
    "Вопрос по начислению баллов",
]

DOC_TOPICS = [
    "Участие в турнире",
    "Научная конференция",
    "Творческий конкурс",
    "Волонтёрский проект",
    "Хакатон университета",
    "Олимпиада по профилю",
]

POINTS_BY_LEVEL = {
    AchievementLevel.SCHOOL: 5,
    AchievementLevel.MUNICIPAL: 10,
    AchievementLevel.REGIONAL: 20,
    AchievementLevel.FEDERAL: 35,
    AchievementLevel.INTERNATIONAL: 50,
}

POINTS_BY_RESULT = {
    AchievementResult.PARTICIPANT: 0,
    AchievementResult.PRIZEWINNER: 10,
    AchievementResult.WINNER: 20,
}

SEEDED_CATEGORIES = [
    AchievementCategory.SPORT,
    AchievementCategory.SCIENCE,
    AchievementCategory.ART,
    AchievementCategory.VOLUNTEERING,
    AchievementCategory.OTHER,
]


def write_demo_png(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(PNG_BYTES)


def build_demo_title(index: int, category: AchievementCategory) -> str:
    return f"{DOC_TOPICS[index % len(DOC_TOPICS)]} #{index + 1} ({category.value})"


def calc_points(level: AchievementLevel, result: AchievementResult | None) -> int:
    return POINTS_BY_LEVEL[level] + POINTS_BY_RESULT.get(result, 0)


def db_user_role(role: UserRole) -> str:
    return role.name


def db_user_status(status: UserStatus) -> str:
    return status.name


def db_education_level(level: EducationLevel | None) -> str | None:
    return level.name if level else None


def db_achievement_category(category: AchievementCategory) -> str:
    return category.value if category == AchievementCategory.HACKATHON else category.name


def db_achievement_level(level: AchievementLevel) -> str:
    return level.name


def db_achievement_result(result: AchievementResult | None) -> str | None:
    return result.name if result else None


def db_achievement_status(status: AchievementStatus) -> str:
    return status.name


def db_support_status(status: SupportTicketStatus) -> str:
    return status.value


async def main():
    common_hash = pwd_context.hash(COMMON_PASSWORD)
    now = datetime.now(timezone.utc)

    if ACHIEVEMENTS_DIR.exists():
        shutil.rmtree(ACHIEVEMENTS_DIR)
    ACHIEVEMENTS_DIR.mkdir(parents=True, exist_ok=True)

    async with async_session_maker() as db:
        keep_users = (
            await db.execute(select(Users).where(Users.email.in_(KEEP_EMAILS)).order_by(Users.id))
        ).scalars().all()

        found_keep = {user.email for user in keep_users}
        missing = KEEP_EMAILS - found_keep
        if missing:
            raise RuntimeError(f"Не найдены обязательные аккаунты: {sorted(missing)}")

        moderator = next(user for user in keep_users if user.email == "moderator@example.com")
        keep_ids = [user.id for user in keep_users]

        await db.execute(delete(UserToken))
        await db.execute(delete(Notification).where(~Notification.user_id.in_(keep_ids)))
        await db.execute(delete(SeasonResult).where(~SeasonResult.user_id.in_(keep_ids)))
        await db.execute(delete(Users).where(~Users.id.in_(keep_ids)))

        for user in keep_users:
            user.hashed_password = common_hash
            user.failed_attempts = 0
            user.blocked_until = None
            user.session_version = int(user.session_version or 1) + 1
            user.api_access_version = int(user.api_access_version or 1) + 1
            user.api_refresh_version = int(user.api_refresh_version or 1) + 1

        active_users = []
        levels = list(EducationLevel)
        for index in range(ACTIVE_STUDENTS_COUNT):
            level = levels[index % len(levels)]
            course_limit = COURSE_LIMITS[level]
            course = (index % course_limit) + 1
            group = GROUPS[level][index % len(GROUPS[level])]
            created_at = now - timedelta(days=120 - (index % 90), hours=index % 12)

            user = Users(
                first_name=FIRST_NAMES[index % len(FIRST_NAMES)],
                last_name=LAST_NAMES[(index * 3) % len(LAST_NAMES)],
                email=f"demo.student{index + 1:03d}@sirius.local",
                education_level=db_education_level(level),
                course=course,
                study_group=group,
                session_gpa=f"{4.1 + (index % 8) * 0.1:.1f}",
                hashed_password=common_hash,
                role=db_user_role(UserRole.STUDENT),
                status=db_user_status(UserStatus.ACTIVE),
                is_active=True,
                created_at=created_at,
            )
            active_users.append(user)

        pending_users = []
        for index in range(PENDING_APPLICATIONS_COUNT):
            level = levels[(index + 2) % len(levels)]
            course_limit = COURSE_LIMITS[level]
            course = (index % course_limit) + 1
            group = GROUPS[level][index % len(GROUPS[level])]
            created_at = now - timedelta(days=index % 10, hours=index)

            user = Users(
                first_name=FIRST_NAMES[(index + 7) % len(FIRST_NAMES)],
                last_name=LAST_NAMES[(index * 5 + 2) % len(LAST_NAMES)],
                email=f"demo.pending{index + 1:03d}@sirius.local",
                education_level=db_education_level(level),
                course=course,
                study_group=group,
                hashed_password=common_hash,
                role=db_user_role(UserRole.GUEST),
                status=db_user_status(UserStatus.PENDING),
                is_active=False,
                reviewed_by_id=moderator.id,
                created_at=created_at,
            )
            pending_users.append(user)

        db.add_all(active_users + pending_users)
        await db.flush()

        achievements = []
        document_counter = 0
        categories = SEEDED_CATEGORIES
        achievement_levels = list(AchievementLevel)
        results = list(AchievementResult)

        for index, user in enumerate(active_users):
            category = categories[index % len(categories)]
            level = achievement_levels[index % len(achievement_levels)]
            result = results[index % len(results)]
            file_name = f"achievement_{document_counter + 1:04d}.png"
            file_path = ACHIEVEMENTS_DIR / file_name
            write_demo_png(file_path)

            achievements.append(
                Achievement(
                    user_id=user.id,
                    title=build_demo_title(document_counter, category),
                    description=f"Подтверждающий документ для {category.value.lower()} направления.",
                    file_path=f"uploads/achievements/demo_seed/{file_name}",
                    category=db_achievement_category(category),
                    level=db_achievement_level(level),
                    result=db_achievement_result(result),
                    points=calc_points(level, result),
                    status=db_achievement_status(AchievementStatus.APPROVED),
                    moderator_id=moderator.id,
                    created_at=now - timedelta(days=90 - (index % 45), hours=index % 6),
                )
            )
            document_counter += 1

            if index < 48:
                extra_status = [
                    AchievementStatus.PENDING,
                    AchievementStatus.REVISION,
                    AchievementStatus.REJECTED,
                    AchievementStatus.APPROVED,
                ][index % 4]
                extra_category = categories[(index + 2) % len(categories)]
                extra_level = achievement_levels[(index + 1) % len(achievement_levels)]
                extra_result = results[(index + 1) % len(results)]
                extra_file_name = f"achievement_{document_counter + 1:04d}.png"
                extra_file_path = ACHIEVEMENTS_DIR / extra_file_name
                write_demo_png(extra_file_path)

                achievements.append(
                    Achievement(
                        user_id=user.id,
                        title=build_demo_title(document_counter, extra_category),
                        description="Дополнительное достижение для тестового наполнения.",
                        file_path=f"uploads/achievements/demo_seed/{extra_file_name}",
                        category=db_achievement_category(extra_category),
                        level=db_achievement_level(extra_level),
                        result=db_achievement_result(extra_result),
                        points=calc_points(extra_level, extra_result),
                        status=db_achievement_status(extra_status),
                        moderator_id=moderator.id if extra_status != AchievementStatus.PENDING or index % 3 == 0 else None,
                        rejection_reason="Нужна доработка описания." if extra_status == AchievementStatus.REVISION else (
                            "Документ не подтверждает достижение." if extra_status == AchievementStatus.REJECTED else None
                        ),
                        created_at=now - timedelta(days=40 - (index % 20), hours=index % 9),
                    )
                )
                document_counter += 1

            if index < 18:
                pending_file_name = f"achievement_{document_counter + 1:04d}.png"
                pending_file_path = ACHIEVEMENTS_DIR / pending_file_name
                write_demo_png(pending_file_path)

                pending_category = categories[(index + 3) % len(categories)]
                pending_level = achievement_levels[(index + 2) % len(achievement_levels)]
                pending_result = results[(index + 2) % len(results)]

                achievements.append(
                    Achievement(
                        user_id=user.id,
                        title=build_demo_title(document_counter, pending_category),
                        description="Новый документ в очереди модерации.",
                        file_path=f"uploads/achievements/demo_seed/{pending_file_name}",
                        category=db_achievement_category(pending_category),
                        level=db_achievement_level(pending_level),
                        result=db_achievement_result(pending_result),
                        points=calc_points(pending_level, pending_result),
                        status=db_achievement_status(AchievementStatus.PENDING),
                        moderator_id=moderator.id if index % 2 == 0 else None,
                        created_at=now - timedelta(days=index % 7, hours=index % 5),
                    )
                )
                document_counter += 1

        db.add_all(achievements)
        await db.flush()

        tickets = []
        messages = []
        for index in range(SUPPORT_TICKETS_COUNT):
            owner = active_users[(index * 3) % len(active_users)]
            created_at = now - timedelta(days=index % 14, hours=index)

            if index < 18:
                status = SupportTicketStatus.OPEN
                moderator_id = None
                assigned_at = None
                closed_at = None
            elif index < 26:
                status = SupportTicketStatus.IN_PROGRESS
                moderator_id = moderator.id
                assigned_at = created_at + timedelta(hours=2)
                closed_at = None
            else:
                status = SupportTicketStatus.CLOSED
                moderator_id = moderator.id
                assigned_at = created_at + timedelta(hours=1)
                closed_at = created_at + timedelta(days=1)

            ticket = SupportTicket(
                user_id=owner.id,
                moderator_id=moderator_id,
                subject=f"{SUPPORT_SUBJECTS[index % len(SUPPORT_SUBJECTS)]} #{index + 1}",
                status=db_support_status(status),
                created_at=created_at,
                assigned_at=assigned_at,
                session_expires_at=(assigned_at + timedelta(days=7)) if assigned_at and status != SupportTicketStatus.CLOSED else None,
                closed_at=closed_at,
            )
            tickets.append(ticket)

        db.add_all(tickets)
        await db.flush()

        for index, ticket in enumerate(tickets):
            student = next(user for user in active_users if user.id == ticket.user_id)
            base_time = ticket.created_at or now

            messages.append(
                SupportMessage(
                    ticket_id=ticket.id,
                    sender_id=student.id,
                    text=f"Здравствуйте! {SUPPORT_SUBJECTS[index % len(SUPPORT_SUBJECTS)].lower()}. Нужна помощь.",
                    is_from_moderator=False,
                    created_at=base_time,
                )
            )

            if ticket.status in (SupportTicketStatus.IN_PROGRESS, SupportTicketStatus.CLOSED):
                messages.append(
                    SupportMessage(
                        ticket_id=ticket.id,
                        sender_id=moderator.id,
                        text="Принял обращение в работу, проверяю детали.",
                        is_from_moderator=True,
                        created_at=base_time + timedelta(hours=2),
                    )
                )
                messages.append(
                    SupportMessage(
                        ticket_id=ticket.id,
                        sender_id=student.id,
                        text="Спасибо, отправил дополнительную информацию.",
                        is_from_moderator=False,
                        created_at=base_time + timedelta(hours=4),
                    )
                )

            if ticket.status == SupportTicketStatus.CLOSED:
                messages.append(
                    SupportMessage(
                        ticket_id=ticket.id,
                        sender_id=moderator.id,
                        text="Проблема решена, обращение закрыто.",
                        is_from_moderator=True,
                        created_at=base_time + timedelta(days=1),
                    )
                )

        db.add_all(messages)
        await db.commit()

        print("Demo dataset reset complete.")
        print(f"Preserved users: {len(keep_users)}")
        print(f"Created active students: {len(active_users)}")
        print(f"Created pending applications: {len(pending_users)}")
        print(f"Created achievements: {len(achievements)}")
        print(f"Created support tickets: {len(tickets)}")
        print(f"Created support messages: {len(messages)}")
        print(f"Common password for preserved and new accounts: {COMMON_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
