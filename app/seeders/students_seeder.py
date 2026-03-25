"""Seeder: 100 students with diverse achievements and fake document files."""

import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.achievement import Achievement
from app.models.enums import (
    AchievementCategory,
    AchievementLevel,
    AchievementStatus,
    EducationLevel,
    UserRole,
    UserStatus,
)
from app.models.user import Users

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Данные для генерации ──

FIRST_NAMES_M = [
    "Александр", "Дмитрий", "Максим", "Иван", "Артём", "Никита", "Михаил",
    "Даниил", "Егор", "Андрей", "Кирилл", "Илья", "Роман", "Тимофей",
    "Матвей", "Сергей", "Павел", "Владислав", "Денис", "Олег",
]
FIRST_NAMES_F = [
    "Анна", "Мария", "Елена", "Дарья", "Софья", "Алиса", "Полина",
    "Виктория", "Екатерина", "Ольга", "Наталья", "Татьяна", "Ксения",
    "Валерия", "Юлия", "Ирина", "Светлана", "Анастасия", "Маргарита", "Вера",
]
LAST_NAMES_M = [
    "Иванов", "Петров", "Сидоров", "Кузнецов", "Смирнов", "Попов",
    "Новиков", "Морозов", "Волков", "Соловьёв", "Козлов", "Лебедев",
    "Фёдоров", "Михайлов", "Зайцев", "Павлов", "Семёнов", "Голубев",
    "Виноградов", "Богданов",
]
LAST_NAMES_F = [
    "Иванова", "Петрова", "Сидорова", "Кузнецова", "Смирнова", "Попова",
    "Новикова", "Морозова", "Волкова", "Соловьёва", "Козлова", "Лебедева",
    "Фёдорова", "Михайлова", "Зайцева", "Павлова", "Семёнова", "Голубева",
    "Виноградова", "Богданова",
]

ACHIEVEMENT_TITLES = {
    AchievementCategory.SPORT: [
        "Победа в соревнованиях по плаванию",
        "Призёр турнира по шахматам",
        "Первое место по лёгкой атлетике",
        "Серебро на чемпионате по волейболу",
        "Участие в марафоне",
        "Победитель турнира по баскетболу",
        "Бронза на соревнованиях по дзюдо",
        "Кубок по настольному теннису",
    ],
    AchievementCategory.SCIENCE: [
        "Победа на олимпиаде по математике",
        "Призёр олимпиады по физике",
        "Участие в конференции по биологии",
        "Публикация научной статьи",
        "Диплом олимпиады по информатике",
        "Победитель хакатона",
        "Призёр олимпиады по химии",
        "Грант на научное исследование",
    ],
    AchievementCategory.ART: [
        "Лауреат конкурса вокалистов",
        "Победа в конкурсе живописи",
        "Участие в театральном фестивале",
        "Диплом музыкального конкурса",
        "Призёр фотоконкурса",
        "Выставка графических работ",
        "Победитель конкурса дизайна",
        "Лауреат литературного конкурса",
    ],
    AchievementCategory.VOLUNTEERING: [
        "Волонтёр на экологической акции",
        "Помощь в приюте для животных",
        "Организация донорской акции",
        "Участие в благотворительном забеге",
        "Волонтёр на городском мероприятии",
        "Координатор волонтёрского отряда",
        "Благотворительный сбор средств",
        "Помощь ветеранам",
    ],
    AchievementCategory.HACKATHON: [
        "Победитель хакатона по ИИ",
        "Призёр хакатона по веб-разработке",
        "Участие в хакатоне по кибербезопасности",
        "Финалист хакатона по мобильной разработке",
        "Победа на хакатоне по IoT",
        "Призёр хакатона по Data Science",
        "Участие в хакатоне по блокчейну",
        "Победитель студенческого хакатона",
    ],
    AchievementCategory.OTHER: [
        "Сертификат курсов по Python",
        "Диплом языковой школы",
        "Стажировка в IT-компании",
        "Сертификат по управлению проектами",
        "Курс по финансовой грамотности",
        "Диплом автошколы",
        "Онлайн-курс по Data Science",
        "Сертификат First Certificate in English",
    ],
}

DESCRIPTIONS = {
    AchievementCategory.SPORT: "Спортивное достижение, подтверждённое грамотой/дипломом.",
    AchievementCategory.SCIENCE: "Научное/академическое достижение, подтверждённое дипломом.",
    AchievementCategory.ART: "Творческое достижение, подтверждённое дипломом/сертификатом.",
    AchievementCategory.VOLUNTEERING: "Волонтёрская деятельность, подтверждённая справкой.",
    AchievementCategory.HACKATHON: "Участие в хакатоне, подтверждённое дипломом/сертификатом.",
    AchievementCategory.OTHER: "Дополнительное достижение, подтверждённое сертификатом.",
}

LEVELS = list(AchievementLevel)
CATEGORIES = list(AchievementCategory)
EDUCATION_LEVELS = list(EducationLevel)
STATUSES_WEIGHTED = (
    [AchievementStatus.APPROVED] * 5
    + [AchievementStatus.PENDING] * 3
    + [AchievementStatus.REJECTED] * 1
    + [AchievementStatus.REVISION] * 1
)

POINTS_BY_LEVEL = {
    AchievementLevel.SCHOOL: (5, 15),
    AchievementLevel.MUNICIPAL: (10, 25),
    AchievementLevel.REGIONAL: (20, 40),
    AchievementLevel.FEDERAL: (30, 60),
    AchievementLevel.INTERNATIONAL: (50, 100),
}


def _make_stub_file(directory: str, filename: str) -> str:
    """Create a small stub PDF so file_path points to a real file."""
    Path(directory).mkdir(parents=True, exist_ok=True)
    path = os.path.join(directory, filename)
    if not os.path.exists(path):
        # Minimal valid PDF
        with open(path, "wb") as f:
            f.write(
                b"%PDF-1.0\n1 0 obj<</Pages 2 0 R>>endobj\n"
                b"2 0 obj<</Kids[3 0 R]/Count 1>>endobj\n"
                b"3 0 obj<</MediaBox[0 0 612 792]>>endobj\n"
                b"trailer<</Root 1 0 R>>\n%%EOF\n"
            )
    return path


class StudentsSeeder:
    @staticmethod
    async def run(db: AsyncSession, *, moderator_id: int | None = None):
        # Check if we already seeded mass students
        result = await db.execute(
            select(Users).where(
                Users.role == UserRole.STUDENT.value,
                Users.email.like("%seed.student%"),
            ).limit(1)
        )
        if result.scalars().first():
            print("   Skipping 100 students (already seeded)")
            return

        print("   Seeding 100 students with achievements...")
        hashed = pwd_context.hash("Password123!")

        upload_dir = "static/uploads/achievements"
        now = datetime.now(timezone.utc)

        students_created = 0
        achievements_created = 0

        for i in range(1, 101):
            is_female = random.random() < 0.5
            if is_female:
                first = random.choice(FIRST_NAMES_F)
                last = random.choice(LAST_NAMES_F)
            else:
                first = random.choice(FIRST_NAMES_M)
                last = random.choice(LAST_NAMES_M)

            edu = random.choice(EDUCATION_LEVELS)
            course = random.randint(1, 4) if edu in (
                EducationLevel.BACHELOR, EducationLevel.COLLEGE,
            ) else random.randint(1, 6) if edu == EducationLevel.SPECIALIST else random.randint(1, 2)

            status = random.choices(
                [UserStatus.ACTIVE, UserStatus.PENDING],
                weights=[9, 1],
            )[0]

            student = Users(
                email=f"seed.student{i:03d}@example.com",
                hashed_password=hashed,
                first_name=first,
                last_name=last,
                role=UserRole.STUDENT.value,
                status=status.value,
                education_level=edu.value,
                course=course,
                is_active=True,
                created_at=now - timedelta(days=random.randint(30, 365)),
            )
            db.add(student)
            await db.flush()  # get student.id
            students_created += 1

            # Each student gets 1-8 achievements
            num_achievements = random.randint(1, 8)
            for _ in range(num_achievements):
                cat = random.choice(CATEGORIES)
                level = random.choice(LEVELS)
                ach_status = random.choice(STATUSES_WEIGHTED)
                lo, hi = POINTS_BY_LEVEL[level]
                points = random.randint(lo, hi) if ach_status == AchievementStatus.APPROVED else 0

                title = random.choice(ACHIEVEMENT_TITLES[cat])
                filename = f"seed_{student.id}_{achievements_created + 1}.pdf"
                rel_path = f"achievements/{filename}"
                _make_stub_file(upload_dir, filename)

                ach = Achievement(
                    user_id=student.id,
                    title=title,
                    description=DESCRIPTIONS[cat],
                    file_path=rel_path,
                    category=cat.name,
                    level=level.name,
                    points=points,
                    status=ach_status.name,
                    moderator_id=moderator_id if ach_status != AchievementStatus.PENDING else None,
                    created_at=now - timedelta(days=random.randint(1, 300)),
                )
                db.add(ach)
                achievements_created += 1

        await db.commit()
        print(f"   Created {students_created} students, {achievements_created} achievements")
        print("   All student passwords: Password123!")
