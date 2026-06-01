from sqlalchemy import Column, String, Integer, Float, Text, UniqueConstraint, Index
from .database import Base


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String,  unique=True, nullable=False, index=True)
    display_name  = Column(String,  nullable=False)
    password_hash = Column(String,  nullable=False)
    created_at    = Column(String,  nullable=False)


class Session(Base):
    __tablename__ = "sessions"

    token      = Column(String, primary_key=True)
    user_id    = Column(Integer, nullable=False)
    created_at = Column(String, nullable=False)


class Lecture(Base):
    __tablename__ = "lectures"

    id            = Column(String, primary_key=True)
    title         = Column(String, nullable=False)
    created_at    = Column(String, nullable=False)
    slide_count   = Column(Integer, nullable=False)
    seg_count     = Column(Integer, nullable=False)
    duration_ms   = Column(Float, nullable=False)
    registered_at = Column(String, nullable=False)


class Progress(Base):
    __tablename__ = "progress"

    user_id    = Column(Integer, primary_key=True)
    lecture_id = Column(String,  primary_key=True)
    slide_idx  = Column(Integer, nullable=False, default=0)
    seg_idx    = Column(Integer, nullable=False, default=0)
    pct        = Column(Float,   nullable=False, default=0.0)
    updated_at = Column(String,  nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id   = Column(String,  nullable=False, index=True)
    slide_idx    = Column(Integer, nullable=False)
    user_id      = Column(Integer, nullable=False)
    display_name = Column(String,  nullable=False)
    message      = Column(String,  nullable=False)
    created_at   = Column(String,  nullable=False)


class DifficultyRating(Base):
    __tablename__ = "difficulty_ratings"

    user_id    = Column(Integer, primary_key=True)
    lecture_id = Column(String,  primary_key=True)
    slide_idx  = Column(Integer, primary_key=True)
    rating     = Column(Integer, nullable=False)   # 0=쉬움 1=보통 2=어려움
    updated_at = Column(String,  nullable=False)


class SlideKeyword(Base):
    __tablename__ = "slide_keywords"
    __table_args__ = (UniqueConstraint("lecture_id", "slide_idx", "keyword"),)

    id         = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id = Column(String,  nullable=False)
    slide_idx  = Column(Integer, nullable=False)
    keyword    = Column(String,  nullable=False)
    count      = Column(Integer, nullable=False, default=1)
    updated_at = Column(String,  nullable=False)


class PlaybackEvent(Base):
    """재생 행동 텔레메트리 (seek, pause, replay, speed_change).
    슬라이드별 학습 어려움 시그널로 활용."""

    __tablename__ = "playback_events"
    __table_args__ = (
        Index("ix_playback_lecture_slide", "lecture_id", "slide_idx"),
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id  = Column(String,  nullable=False, index=True)
    user_id     = Column(Integer, nullable=False)
    slide_idx   = Column(Integer, nullable=False)
    seg_idx     = Column(Integer, nullable=False, default=0)
    event_type  = Column(String,  nullable=False)   # seek_back, seek_forward, pause, replay, speed_change
    position_ms = Column(Float,   nullable=False, default=0.0)
    payload     = Column(Text,    nullable=True)    # JSON string (delta_ms, old_rate, new_rate 등)
    created_at  = Column(String,  nullable=False)


class QuizResponse(Base):
    """슬라이드별 체크포인트 퀴즈에 대한 학생 응답.
    한 사용자는 한 슬라이드에 단 한 번만 응답 — 재시도 시 갱신."""

    __tablename__ = "quiz_responses"

    user_id      = Column(Integer, primary_key=True)
    lecture_id   = Column(String,  primary_key=True)
    slide_idx    = Column(Integer, primary_key=True)
    answer_index = Column(Integer, nullable=False)        # 학생이 선택한 옵션 인덱스
    is_correct   = Column(Integer, nullable=False)         # 0/1 — Bool 대용 (SQLite 호환)
    answered_at  = Column(String,  nullable=False)
