import os
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, LargeBinary
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hr_assessor.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    # Add audio_path column if it doesn't exist (migration for existing DBs)
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE candidates ADD COLUMN audio_path VARCHAR"
            ))
            conn.commit()
    except Exception:
        pass  # Column already exists
    # Add selected_criteria to interview_sessions if it doesn't exist
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE interview_sessions ADD COLUMN selected_criteria VARCHAR"
            ))
            conn.commit()
    except Exception:
        pass  # Column already exists
    # Add interview start/finish timestamps if they don't exist
    for col_sql in (
        "ALTER TABLE candidates ADD COLUMN interview_started_at TIMESTAMP",
        "ALTER TABLE candidates ADD COLUMN interview_finished_at TIMESTAMP",
    ):
        try:
            with engine.connect() as conn:
                conn.execute(__import__("sqlalchemy").text(col_sql))
                conn.commit()
        except Exception:
            pass
