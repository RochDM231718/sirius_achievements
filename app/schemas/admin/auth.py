import re
from pydantic import BaseModel, Field, field_validator, model_validator, EmailStr
from app.models.enums import EducationLevel


class ResetPasswordSchema(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)
    password_confirm: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v):
        if not re.search(r"[A-ZА-Я]", v):
            raise ValueError("Пароль должен содержать хотя бы одну заглавную букву.")
        if not re.search(r"[a-zа-я]", v):
            raise ValueError("Пароль должен содержать хотя бы одну строчную букву.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру.")
        if not re.search(r"[\W_]", v):
            raise ValueError("Пароль должен содержать хотя бы один спецсимвол.")
        return v

    @model_validator(mode="after")
    def check_password_match(self):
        if self.password != self.password_confirm:
            raise ValueError("Пароли не совпадают.")
        return self


_EMOJI_RE = re.compile(
    '[\U0001F600-\U0001F64F'
    '\U0001F300-\U0001F5FF'
    '\U0001F680-\U0001F6FF'
    '\U0001F700-\U0001F77F'
    '\U0001F780-\U0001F7FF'
    '\U0001F800-\U0001F8FF'
    '\U0001F900-\U0001F9FF'
    '\U0001FA00-\U0001FA6F'
    '\U0001FA70-\U0001FAFF'
    '\U00002702-\U000027B0'
    '\U000024C2-\U0001F251]+',
    flags=re.UNICODE,
)


class UserRegister(BaseModel):
    first_name: str = Field(..., min_length=2)
    last_name: str = Field(..., min_length=2)
    email: EmailStr

    education_level: EducationLevel
    course: int = Field(..., ge=1, le=6, description="Номер курса от 1 до 6")
    group: str = Field(..., min_length=1, max_length=10)

    password: str = Field(..., min_length=8, max_length=128)
    password_confirm: str

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_emoji_from_name(cls, v):
        cleaned = _EMOJI_RE.sub('', v).strip()
        if len(cleaned) < 2:
            raise ValueError("Имя и фамилия не должны содержать эмодзи и должны быть не короче 2 символов.")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v):
        if not re.search(r"[A-ZА-Я]", v):
            raise ValueError("Пароль должен содержать хотя бы одну заглавную букву.")
        if not re.search(r"[a-zа-я]", v):
            raise ValueError("Пароль должен содержать хотя бы одну строчную букву.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру.")
        if not re.search(r"[\W_]", v):
            raise ValueError("Пароль должен содержать хотя бы один спецсимвол.")
        return v

    @model_validator(mode="after")
    def check_password_match(self):
        if self.password != self.password_confirm:
            raise ValueError("Пароли не совпадают.")
        return self