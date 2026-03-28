import asyncio
import base64
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.utils.password import hash_password
from sqlalchemy import delete, select

if "/app" not in sys.path:
    sys.path.insert(0, "/app")

from app.infrastructure.database import async_session_maker
from app.models.achievement import Achievement
from app.models.audit_log import AuditLog
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
SUPER_ADMIN_EMAIL = "super.admin@example.com"
MODERATOR_EMAIL = "moderator@example.com"

ACTIVE_USERS_PER_LEVEL = 100
PENDING_APPLICATIONS_COUNT = 10
PENDING_DOCUMENTS_COUNT = 20
ACTIVE_SUPPORT_TICKETS_COUNT = 10
CLOSED_SUPPORT_TICKETS_COUNT = 20


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

LEVEL_SLUGS = {
    EducationLevel.COLLEGE: "college",
    EducationLevel.BACHELOR: "bachelor",
    EducationLevel.SPECIALIST: "specialist",
    EducationLevel.MASTER: "master",
    EducationLevel.POSTGRADUATE: "postgraduate",
}

FIRST_NAMES = [
    "Алексей",
    "Мария",
    "Дмитрий",
    "Екатерина",
    "Андрей",
    "Ольга",
    "Сергей",
    "Анна",
    "Павел",
    "Наталья",
    "Игорь",
    "Татьяна",
    "Максим",
    "Юлия",
    "Роман",
    "Артем",
    "Виктория",
    "Кирилл",
    "Елена",
    "Денис",
    "Алина",
    "Никита",
    "Дарья",
    "Владислав",
    "Полина",
    "Глеб",
    "Вероника",
    "Тимур",
    "Карина",
    "Илья",
    "Софья",
    "Арсений",
    "Валерия",
    "Матвей",
    "Диана",
    "Георгий",
    "Ксения",
    "Леонид",
    "Милана",
    "Федор",
]

LAST_NAMES = [
    "Иванов",
    "Петрова",
    "Сидоров",
    "Козлова",
    "Новиков",
    "Морозова",
    "Волков",
    "Лебедева",
    "Соколов",
    "Кузнецова",
    "Попов",
    "Васильева",
    "Зайцев",
    "Павлова",
    "Семенов",
    "Белов",
    "Громова",
    "Орлов",
    "Федорова",
    "Щербаков",
    "Тарасова",
    "Жуков",
    "Медведева",
    "Крылов",
    "Егорова",
    "Антонов",
    "Степанова",
    "Филиппов",
    "Комарова",
    "Захаров",
    "Данилова",
    "Борисов",
    "Гусева",
    "Титов",
    "Романова",
    "Калинин",
    "Воронова",
    "Савельев",
    "Абрамова",
    "Панов",
]

DOCUMENT_TEMPLATES = [
    "Участие в профильной олимпиаде",
    "Научная конференция факультета",
    "Творческий конкурс университета",
    "Волонтерский проект семестра",
    "Хакатон по цифровым сервисам",
    "Патриотическая акция кампуса",
    "Проектная сессия кафедры",
    "Сертификат дополнительного курса",
]

ACTIVE_SUPPORT_ISSUES = [
    "Не приходит письмо подтверждения",
    "Не могу загрузить диплом в профиль",
    "Документ слишком долго висит на проверке",
    "Баллы не появились в личном кабинете",
    "Нужно поправить курс и группу в профиле",
    "Не открывается превью документа",
    "Случайно загрузил не тот файл",
    "Не понимаю причину возврата документа",
    "Не вижу обращение в истории поддержки",
    "Ошибка при отправке нового обращения",
]

CLOSED_SUPPORT_ISSUES = [
    "Исправление фамилии в профиле",
    "Пересчет баллов за мероприятие",
    "Замена файла подтверждения",
    "Уточнение статуса модерации",
    "Ошибка отображения GPA",
    "Смена почты аккаунта",
    "Закрытие дубля обращения",
    "Проблема со скачиванием файла",
    "Уточнение категории документа",
    "Помощь с подтверждением регистрации",
]

SEEDED_CATEGORIES = [
    AchievementCategory.SPORT,
    AchievementCategory.SCIENCE,
    AchievementCategory.ART,
    AchievementCategory.VOLUNTEERING,
    AchievementCategory.HACKATHON,
    AchievementCategory.OTHER,
]

POINTS_BY_LEVEL = {
    AchievementLevel.SCHOOL: 10,
    AchievementLevel.MUNICIPAL: 20,
    AchievementLevel.REGIONAL: 40,
    AchievementLevel.FEDERAL: 75,
    AchievementLevel.INTERNATIONAL: 100,
}

POINTS_BY_RESULT = {
    AchievementResult.PARTICIPANT: 0,
    AchievementResult.PRIZEWINNER: 15,
    AchievementResult.WINNER: 30,
}


def write_demo_png(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(PNG_BYTES)


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


def calc_points(level: AchievementLevel, result: AchievementResult) -> int:
    return POINTS_BY_LEVEL[level] + POINTS_BY_RESULT[result]


def build_document_title(user_index: int, doc_index: int, category: AchievementCategory) -> str:
    topic = DOCUMENT_TEMPLATES[(user_index + doc_index) % len(DOCUMENT_TEMPLATES)]
    return f"{topic} - {category.value} #{doc_index + 1}"


async def ensure_staff_users(db, password_hash: str, now: datetime) -> tuple[Users, Users]:
    specs = [
        {
            "email": SUPER_ADMIN_EMAIL,
            "first_name": "Super",
            "last_name": "Admin",
            "role": UserRole.SUPER_ADMIN,
        },
        {
            "email": MODERATOR_EMAIL,
            "first_name": "Demo",
            "last_name": "Moderator",
            "role": UserRole.MODERATOR,
        },
    ]

    created_users: dict[UserRole, Users] = {}

    for spec in specs:
        result = await db.execute(select(Users).where(Users.email == spec["email"]))
        user = result.scalars().first()

        if user is None:
            user = Users(
                email=spec["email"],
                created_at=now - timedelta(days=365),
            )

        user.first_name = spec["first_name"]
        user.last_name = spec["last_name"]
        user.hashed_password = password_hash
        user.role = db_user_role(spec["role"])
        user.status = db_user_status(UserStatus.ACTIVE)
        user.education_level = None
        user.course = None
        user.study_group = None
        user.session_gpa = None
        user.is_active = True
        user.reviewed_by_id = None
        user.failed_attempts = 0
        user.blocked_until = None
        user.session_version = int(user.session_version or 1) + 1
        user.api_access_version = int(user.api_access_version or 1) + 1
        user.api_refresh_version = int(user.api_refresh_version or 1) + 1

        db.add(user)
        await db.flush()
        created_users[spec["role"]] = user

    return created_users[UserRole.SUPER_ADMIN], created_users[UserRole.MODERATOR]


async def main():
    common_hash = hash_password(COMMON_PASSWORD)
    now = datetime.now(timezone.utc)

    if ACHIEVEMENTS_DIR.exists():
        shutil.rmtree(ACHIEVEMENTS_DIR)
    ACHIEVEMENTS_DIR.mkdir(parents=True, exist_ok=True)

    async with async_session_maker() as db:
        super_admin, moderator = await ensure_staff_users(db, common_hash, now)
        staff_ids = [super_admin.id, moderator.id]

        await db.execute(delete(UserToken))
        await db.execute(delete(Notification))
        await db.execute(delete(SeasonResult))
        await db.execute(delete(SupportMessage))
        await db.execute(delete(SupportTicket))
        await db.execute(delete(Achievement))
        await db.execute(delete(AuditLog))
        await db.execute(delete(Users).where(~Users.id.in_(staff_ids)))
        await db.flush()

        active_users: list[Users] = []
        levels = list(EducationLevel)

        for level_index, level in enumerate(levels):
            course_limit = COURSE_LIMITS[level]
            groups = GROUPS[level]
            slug = LEVEL_SLUGS[level]

            for index in range(ACTIVE_USERS_PER_LEVEL):
                global_index = level_index * ACTIVE_USERS_PER_LEVEL + index
                course = (index % course_limit) + 1
                group = groups[(index // course_limit) % len(groups)]
                created_at = now - timedelta(days=180 - (global_index % 120), hours=global_index % 12)

                user = Users(
                    first_name=FIRST_NAMES[global_index % len(FIRST_NAMES)],
                    last_name=LAST_NAMES[(global_index * 3) % len(LAST_NAMES)],
                    email=f"{slug}.student{index + 1:03d}@sirius.local",
                    education_level=db_education_level(level),
                    course=course,
                    study_group=group,
                    session_gpa=f"{4.0 + (global_index % 11) * 0.1:.1f}",
                    hashed_password=common_hash,
                    role=db_user_role(UserRole.STUDENT),
                    status=db_user_status(UserStatus.ACTIVE),
                    is_active=True,
                    created_at=created_at,
                )
                active_users.append(user)

        pending_users: list[Users] = []
        for index in range(PENDING_APPLICATIONS_COUNT):
            level = levels[index % len(levels)]
            course_limit = COURSE_LIMITS[level]
            group = GROUPS[level][index % len(GROUPS[level])]
            created_at = now - timedelta(days=index, hours=index * 2)

            pending_users.append(
                Users(
                    first_name=FIRST_NAMES[(index + 9) % len(FIRST_NAMES)],
                    last_name=LAST_NAMES[(index * 5 + 7) % len(LAST_NAMES)],
                    email=f"registration.request{index + 1:02d}@sirius.local",
                    education_level=db_education_level(level),
                    course=(index % course_limit) + 1,
                    study_group=group,
                    hashed_password=common_hash,
                    role=db_user_role(UserRole.GUEST),
                    status=db_user_status(UserStatus.PENDING),
                    is_active=True,
                    reviewed_by_id=moderator.id if index % 2 == 0 else None,
                    created_at=created_at,
                )
            )

        db.add_all(active_users + pending_users)
        await db.flush()

        achievements: list[Achievement] = []
        achievement_levels = list(AchievementLevel)
        achievement_results = list(AchievementResult)
        pending_documents_left = PENDING_DOCUMENTS_COUNT
        document_counter = 0

        for user_index, user in enumerate(active_users):
            doc_count = 3 + (user_index % 2)

            for doc_index in range(doc_count):
                category = SEEDED_CATEGORIES[(user_index + doc_index) % len(SEEDED_CATEGORIES)]
                level = achievement_levels[(user_index + doc_index) % len(achievement_levels)]
                result = achievement_results[(user_index + doc_index + 1) % len(achievement_results)]
                status = AchievementStatus.APPROVED
                rejection_reason = None
                moderator_id = moderator.id

                if pending_documents_left > 0 and doc_index == 0:
                    status = AchievementStatus.PENDING
                    moderator_id = moderator.id if user_index % 2 == 0 else None
                    pending_documents_left -= 1
                elif doc_index == doc_count - 1 and user_index % 17 == 0:
                    status = AchievementStatus.REVISION
                    rejection_reason = "Нужно загрузить более читаемый файл и уточнить описание."
                elif doc_index == doc_count - 1 and user_index % 23 == 0:
                    status = AchievementStatus.REJECTED
                    rejection_reason = "Документ не подтверждает указанную активность."

                file_name = f"document_{document_counter + 1:05d}.png"
                file_path = ACHIEVEMENTS_DIR / file_name
                write_demo_png(file_path)

                achievements.append(
                    Achievement(
                        user_id=user.id,
                        title=build_document_title(user_index, doc_index, category),
                        description=(
                            f"Подтверждающий документ для категории {category.value}. "
                            f"Курс {user.course}, группа {user.study_group}."
                        ),
                        file_path=f"uploads/achievements/demo_seed/{file_name}",
                        category=db_achievement_category(category),
                        level=db_achievement_level(level),
                        result=db_achievement_result(result),
                        points=calc_points(level, result) if status == AchievementStatus.APPROVED else 0,
                        status=db_achievement_status(status),
                        rejection_reason=rejection_reason,
                        moderator_id=moderator_id,
                        created_at=now - timedelta(days=document_counter % 160, hours=(user_index + doc_index) % 12),
                    )
                )
                document_counter += 1

        db.add_all(achievements)
        await db.flush()

        tickets: list[SupportTicket] = []

        for index in range(ACTIVE_SUPPORT_TICKETS_COUNT):
            owner = active_users[(index * 11) % len(active_users)]
            status = SupportTicketStatus.OPEN if index < 5 else SupportTicketStatus.IN_PROGRESS
            created_at = now - timedelta(days=index % 5, hours=index * 2)
            assigned_at = created_at + timedelta(hours=1) if status == SupportTicketStatus.IN_PROGRESS else None

            tickets.append(
                SupportTicket(
                    user_id=owner.id,
                    moderator_id=moderator.id if status == SupportTicketStatus.IN_PROGRESS else None,
                    subject=ACTIVE_SUPPORT_ISSUES[index],
                    status=db_support_status(status),
                    created_at=created_at,
                    assigned_at=assigned_at,
                    session_expires_at=assigned_at + timedelta(days=7) if assigned_at else None,
                    closed_at=None,
                )
            )

        for index in range(CLOSED_SUPPORT_TICKETS_COUNT):
            owner = active_users[(index * 13 + 7) % len(active_users)]
            created_at = now - timedelta(days=10 + index, hours=index % 6)
            assigned_at = created_at + timedelta(hours=2)
            closed_at = assigned_at + timedelta(hours=6 + index % 12)
            issue = CLOSED_SUPPORT_ISSUES[index % len(CLOSED_SUPPORT_ISSUES)]

            tickets.append(
                SupportTicket(
                    user_id=owner.id,
                    moderator_id=moderator.id,
                    subject=f"{issue} #{index + 1}",
                    status=db_support_status(SupportTicketStatus.CLOSED),
                    created_at=created_at,
                    assigned_at=assigned_at,
                    session_expires_at=assigned_at + timedelta(days=7),
                    closed_at=closed_at,
                )
            )

        db.add_all(tickets)
        await db.flush()

        messages: list[SupportMessage] = []

        for index, ticket in enumerate(tickets[:ACTIVE_SUPPORT_TICKETS_COUNT]):
            student = next(user for user in active_users if user.id == ticket.user_id)
            base_time = ticket.created_at or now

            messages.append(
                SupportMessage(
                    ticket_id=ticket.id,
                    sender_id=student.id,
                    text=f"Здравствуйте. {ticket.subject.lower()}. Нужна помощь с решением проблемы.",
                    is_from_moderator=False,
                    created_at=base_time,
                )
            )

            if index >= 5:
                messages.append(
                    SupportMessage(
                        ticket_id=ticket.id,
                        sender_id=moderator.id,
                        text="Обращение взял в работу, сейчас проверяю детали и документы.",
                        is_from_moderator=True,
                        created_at=base_time + timedelta(hours=1),
                    )
                )
                messages.append(
                    SupportMessage(
                        ticket_id=ticket.id,
                        sender_id=student.id,
                        text="Спасибо, отправил дополнительные пояснения в ответ.",
                        is_from_moderator=False,
                        created_at=base_time + timedelta(hours=3),
                    )
                )

        for index, ticket in enumerate(tickets[ACTIVE_SUPPORT_TICKETS_COUNT:]):
            student = next(user for user in active_users if user.id == ticket.user_id)
            base_time = ticket.created_at or now

            messages.append(
                SupportMessage(
                    ticket_id=ticket.id,
                    sender_id=student.id,
                    text=f"Здравствуйте. {ticket.subject.lower()}. Нужна консультация по ситуации.",
                    is_from_moderator=False,
                    created_at=base_time,
                )
            )
            messages.append(
                SupportMessage(
                    ticket_id=ticket.id,
                    sender_id=moderator.id,
                    text="Обращение принято, проверяю историю документа и настройки профиля.",
                    is_from_moderator=True,
                    created_at=base_time + timedelta(hours=2),
                )
            )
            messages.append(
                SupportMessage(
                    ticket_id=ticket.id,
                    sender_id=student.id,
                    text="Дополнительные данные отправлены, можно завершать проверку.",
                    is_from_moderator=False,
                    created_at=base_time + timedelta(hours=4),
                )
            )
            messages.append(
                SupportMessage(
                    ticket_id=ticket.id,
                    sender_id=moderator.id,
                    text="Проблема решена, обращение закрыто. Изменения уже применены в системе.",
                    is_from_moderator=True,
                    created_at=(ticket.closed_at or base_time) - timedelta(minutes=10),
                )
            )

        db.add_all(messages)
        await db.commit()

        print("Demo dataset reset complete.")
        print(f"Active students per direction: {ACTIVE_USERS_PER_LEVEL}")
        print(f"Total active students: {len(active_users)}")
        print(f"Pending registration requests: {len(pending_users)}")
        print(f"Total documents: {len(achievements)}")
        print(f"Pending moderation documents: {PENDING_DOCUMENTS_COUNT}")
        print(f"Active support tickets: {ACTIVE_SUPPORT_TICKETS_COUNT}")
        print(f"Closed support tickets: {CLOSED_SUPPORT_TICKETS_COUNT}")
        print(f"Super admin: {SUPER_ADMIN_EMAIL} / {COMMON_PASSWORD}")
        print(f"Moderator: {MODERATOR_EMAIL} / {COMMON_PASSWORD}")
        print(f"All demo users password: {COMMON_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
