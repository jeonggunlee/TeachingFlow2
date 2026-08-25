from typing import Optional

from pydantic import BaseModel, Field, field_validator


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

    # NOTE: @field_validator 로 등록하지 않으면 그냥 안 불리는 죽은 코드가 된다.
    # (등록 전에는 임의 문자열이 그대로 통과해 라우터가 조용히 버렸다)
    @field_validator("event_type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in _ALLOWED_EVENT_TYPES:
            raise ValueError(f"unknown event_type: {value}")
        return value


# 배치 봉투는 api/playback.py 가 직접 검사한다 — 이벤트를 한 건씩 검증해
# 잘못된 항목 하나 때문에 배치 전체가 버려지지 않도록 하기 위함.
