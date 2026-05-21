import os
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, LargeBinary
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./hr_assessor.db")
# SQLAlchemy requires "postgresql://" not "postgres://" (older Heroku/Replit format)
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)
DATABASE_URL = _raw_url

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    candidate_name = Column(String, nullable=False)
    candidate_phone = Column(String, nullable=False)
    selected_criteria = Column(String, nullable=True)
    full_transcript = Column(Text, nullable=True)
    evaluation_json = Column(Text, nullable=True)
    audio_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    interview_started_at = Column(DateTime, nullable=True)
    interview_finished_at = Column(DateTime, nullable=True)


class CandidateRecording(Base):
    __tablename__ = "candidate_recordings"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, index=True, nullable=False)
    recording_index = Column(Integer, nullable=False)
    audio_data = Column(LargeBinary, nullable=False)
    content_type = Column(String, default="audio/webm")
    created_at = Column(DateTime, default=datetime.utcnow)


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    session_id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    candidate_id = Column(Integer, nullable=True)
    status = Column(String, default="pending")  # pending / in_progress / completed / demo
    selected_criteria = Column(String, nullable=True)  # JSON list, set by HR on link creation
    filler_threshold = Column(Integer, default=2)
    selected_cases = Column(String, nullable=True)  # JSON list e.g. ["maria"] or ["maria","filipp"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    migrations = [
        "ALTER TABLE candidates ADD COLUMN audio_path VARCHAR",
        "ALTER TABLE interview_sessions ADD COLUMN selected_criteria VARCHAR",
        "ALTER TABLE candidates ADD COLUMN interview_started_at TIMESTAMP",
        "ALTER TABLE candidates ADD COLUMN interview_finished_at TIMESTAMP",
        "ALTER TABLE interview_sessions ADD COLUMN filler_threshold INTEGER DEFAULT 2",
        "ALTER TABLE interview_sessions ADD COLUMN selected_cases VARCHAR",
    ]
    for sql in migrations:
        try:
            with engine.connect() as conn:
                conn.execute(__import__("sqlalchemy").text(sql))
                conn.commit()
        except Exception:
            pass
