import uuid
from datetime import datetime, timezone
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def _new_id() -> str:
    return str(uuid.uuid4())[:8]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Course(Base):
    __tablename__ = "courses"

    id:          Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    name:        Mapped[str] = mapped_column(String, nullable=False)
    code:        Mapped[str] = mapped_column(String, default="")
    semester:    Mapped[str] = mapped_column(String, default="")
    description: Mapped[str] = mapped_column(String, default="")
    created_at:  Mapped[str] = mapped_column(String, default=_now)


class WeeklyLecture(Base):
    __tablename__ = "weekly_lectures"

    id:         Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    course_id:  Mapped[str] = mapped_column(String, nullable=False)
    week:       Mapped[int] = mapped_column(Integer, nullable=False)
    title:      Mapped[str] = mapped_column(String, default="")
    lecture_id: Mapped[str] = mapped_column(String, default="")
    note:       Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[str] = mapped_column(String, default=_now)
