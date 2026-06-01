from sqlalchemy import Column, String, Text
from .database import Base


class CQIReport(Base):
    __tablename__ = "cqi_reports"

    id            = Column(String, primary_key=True)   # UUID
    lecture_id    = Column(String, nullable=False, index=True)
    lecture_title = Column(String, nullable=False)
    generated_at  = Column(String, nullable=False)
    # pending | processing | done | error
    status        = Column(String, nullable=False, default="pending")
    error_message = Column(Text,   nullable=True)
    report_json   = Column(Text,   nullable=True)      # 완성된 CQI JSON
