from typing import Optional

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    username:     str = Field(min_length=3, max_length=30)
    display_name: str = Field(min_length=1, max_length=50)
    password:     str = Field(min_length=4)


class LoginIn(BaseModel):
    username: str
    password: str


class ProgressIn(BaseModel):
    slide_idx: int
    seg_idx:   int
    pct:       float


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class LectureSettingsIn(BaseModel):
    ai_answer:     bool
    auto_question: bool


class DifficultyIn(BaseModel):
    rating: int = Field(ge=0, le=2)   # 0=쉬움 1=보통 2=어려움


_ALLOWED_EVENT_TYPES = {
    "seek_back", "seek_forward", "pause", "replay", "speed_change",
}


class PlaybackEventIn(BaseModel):
    slide_idx:   int   = Field(ge=0)
    seg_idx:     int   = Field(ge=0, default=0)
    event_type:  str
    position_ms: float = 0.0
    payload:     Optional[dict] = None

    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in _ALLOWED_EVENT_TYPES:
            raise ValueError(f"unknown event_type: {value}")
        return value


class PlaybackEventBatchIn(BaseModel):
    lecture_id: str
    events:     list[PlaybackEventIn] = Field(default_factory=list, max_length=200)
