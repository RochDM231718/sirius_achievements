from enum import Enum


class UserRole(str, Enum):
    GUEST = "GUEST"
    STUDENT = "STUDENT"
    MODERATOR = "MODERATOR"
    SUPER_ADMIN = "SUPER_ADMIN"


class UserStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    REJECTED = "rejected"
    DELETED = "deleted"


class AchievementStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVISION = "revision"
    ARCHIVED = "archived"


class UserTokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"
    RESET_PASSWORD = "reset_password"
    VERIFY_EMAIL = "verify_email"


class AchievementCategory(str, Enum):
    SPORT = "\u0421\u043f\u043e\u0440\u0442"
    SCIENCE = "\u041d\u0430\u0443\u043a\u0430"
    ART = "\u0418\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u043e"
    VOLUNTEERING = "\u0412\u043e\u043b\u043e\u043d\u0442\u0451\u0440\u0441\u0442\u0432\u043e"
    HACKATHON = "\u0425\u0430\u043a\u0430\u0442\u043e\u043d"
    PATRIOTISM = "\u041f\u0430\u0442\u0440\u0438\u043e\u0442\u0438\u0437\u043c"
    PROJECTS = "\u041f\u0440\u043e\u0435\u043a\u0442\u044b"
    OTHER = "\u0414\u0440\u0443\u0433\u043e\u0435"


class AchievementLevel(str, Enum):
    SCHOOL = "\u0428\u043a\u043e\u043b\u044c\u043d\u044b\u0439"
    MUNICIPAL = "\u041c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b\u044c\u043d\u044b\u0439"
    REGIONAL = "\u0420\u0435\u0433\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439"
    FEDERAL = "\u0424\u0435\u0434\u0435\u0440\u0430\u043b\u044c\u043d\u044b\u0439"
    INTERNATIONAL = "\u041c\u0435\u0436\u0434\u0443\u043d\u0430\u0440\u043e\u0434\u043d\u044b\u0439"


class EducationLevel(str, Enum):
    COLLEGE = "\u041a\u043e\u043b\u043b\u0435\u0434\u0436"
    BACHELOR = "\u0411\u0430\u043a\u0430\u043b\u0430\u0432\u0440\u0438\u0430\u0442"
    SPECIALIST = "\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0442\u0435\u0442"
    MASTER = "\u041c\u0430\u0433\u0438\u0441\u0442\u0440\u0430\u0442\u0443\u0440\u0430"
    POSTGRADUATE = "\u0410\u0441\u043f\u0438\u0440\u0430\u043d\u0442\u0443\u0440\u0430"


class AchievementResult(str, Enum):
    PARTICIPANT = "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a"
    PRIZEWINNER = "\u041f\u0440\u0438\u0437\u0451\u0440"
    WINNER = "\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c"


class SupportTicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    CLOSED = "closed"
    ARCHIVED = "archived"
