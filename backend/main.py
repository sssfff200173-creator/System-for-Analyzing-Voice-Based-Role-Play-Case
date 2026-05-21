import os
import io
import json
import re
import uuid
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.config import CLIENT_PHRASES, WHISPER_HALLUCINATIONS
from backend.database import Candidate, InterviewSession, get_db, init_db
from backend.prompts import ALL_CRITERIA, build_system_prompt, build_evaluation_prompt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AUDIO_DIR = Path("backend/audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="HR Assessor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    init_db()
    _seed_data()
    await _ensure_tts_audio()


# ── Seed ─────────────────────────────────────────────────────────────────────

def _seed_data():
    db = next(get_db())
    try:
        # Demo session — permanent, always available
        if not db.query(InterviewSession).filter(InterviewSession.session_id == "demo").first():
            db.add(InterviewSession(session_id="demo", status="demo"))
            db.commit()
            logger.info("Seeded demo session")

        # Seed test candidates only if seed sessions don't exist yet
        already_seeded = db.query(InterviewSession).filter(
            InterviewSession.session_id.in_(["seed-1", "seed-2"])
        ).count()
        if already_seeded >= 2:
            return

        criteria = ["filler_words", "rudeness", "politeness", "coherence"]
        criteria_json = json.dumps(criteria, ensure_ascii=False)

        # ── Test candidate 1: Рекомендуется ───────────────────────────────
        ev1 = {
            "verdict": "Рекомендуется",
            "markers": {
                "filler_words_count": 1,
                "filler_words_examples": ["ну"],
                "rudeness_count": 0,
                "rudeness_examples": [],
                "politeness_count": 4,
                "politeness_examples": [
                    "Я вас понимаю",
                    "Приношу свои извинения",
                    "Спасибо за обращение",
                    "Давайте я помогу вам решить этот вопрос",
                ],
                "coherence_score": 9,
                "coherence_issues": [],
            },
            "quotes": ["Я вас понимаю, это неприятная ситуация"],
            "comment": "Кандидат демонстрирует высокую клиентоориентированность, чёткую речь и эмпатию. Рекомендуется к найму.",
            "selected_criteria": criteria,
        }
        c1 = Candidate(
            candidate_name="Анна Сидорова",
            candidate_phone="+7 (999) 123-45-67",
            selected_criteria=criteria_json,
            full_transcript=(
                "[Клиент]: Алё, Здрасте!!.. Я вчера покупала у вас телефон...\n"
                "[Кандидат]: Здравствуйте! Я вас понимаю, это неприятная ситуация. "
                "Приношу свои извинения. Давайте я помогу вам решить этот вопрос."
            ),
            evaluation_json=json.dumps(ev1, ensure_ascii=False),
            created_at=datetime.utcnow() - timedelta(days=2),
        )
        db.add(c1)
        db.commit()
        db.refresh(c1)
        db.add(InterviewSession(
            session_id="seed-1",
            status="completed",
            candidate_id=c1.id,
            created_at=c1.created_at,
        ))

        # ── Test candidate 2: Не рекомендуется ────────────────────────────
        ev2 = {
            "verdict": "Не рекомендуется",
            "markers": {
                "filler_words_count": 5,
                "filler_words_examples": ["ну", "вот", "это самое", "ну", "ладно"],
                "rudeness_count": 1,
                "rudeness_examples": ["я же говорю"],
                "politeness_count": 0,
                "politeness_examples": [],
                "coherence_score": 4,
                "coherence_issues": [
                    "Ответ не соответствует вопросу клиента",
                    "Мысль не завершена, перепрыгивание между темами",
                ],
            },
            "quotes": ["Ну, я же говорю, что вот надо было это самое..."],
            "comment": (
                "Выявлены грубость и большое количество слов-паразитов. "
                "Речь бессвязна. Рекомендуется дополнительное обучение."
            ),
            "selected_criteria": criteria,
        }
        c2 = Candidate(
            candidate_name="Иван Козлов",
            candidate_phone="+7 (999) 987-65-43",
            selected_criteria=criteria_json,
            full_transcript=(
                "[Клиент]: Я уже третий раз звоню вам!..\n"
                "[Кандидат]: Ну, я же говорю, что вот надо было это самое... ладно, давайте."
            ),
            evaluation_json=json.dumps(ev2, ensure_ascii=False),
            created_at=datetime.utcnow() - timedelta(days=1),
        )
        db.add(c2)
        db.commit()
        db.refresh(c2)
        db.add(InterviewSession(
            session_id="seed-2",
            status="completed",
            candidate_id=c2.id,
            created_at=c2.created_at,
        ))
        db.commit()
        logger.info("Seeded 2 test candidates")

    except Exception as e:
        logger.error(f"Seed data error: {e}")
        db.rollback()
    finally:
        db.close()


# ── TTS ───────────────────────────────────────────────────────────────────────

async def _generate_phrase_audio(client, idx: int, phrase: str) -> bytes:
    response = await client.audio.speech.create(
        model="tts-1",
        voice="nova",
        input=phrase,
    )
    return response.content


async def _ensure_tts_audio():
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        logger.warning("OPENAI_API_KEY not set — skipping TTS generation")
        return

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=openai_key)

    for idx, phrase in enumerate(CLIENT_PHRASES, start=1):
        audio_path = AUDIO_DIR / f"phrase_{idx}.mp3"
        if audio_path.exists():
            logger.info(f"TTS audio phrase_{idx}.mp3 already cached")
            continue
        try:
            logger.info(f"Generating TTS for phrase {idx}…")
            audio_bytes = await _generate_phrase_audio(client, idx, phrase)
            audio_path.write_bytes(audio_bytes)
            logger.info(f"TTS phrase_{idx}.mp3 saved")
        except Exception as e:
            logger.error(f"TTS generation failed for phrase {idx}: {e}")


# ── Pydantic models ───────────────────────────────────────────────────────────

class CandidateCreate(BaseModel):
    name: str
    phone: str
    consent: bool
    selected_criteria: List[str] = ALL_CRITERIA
    session_id: Optional[str] = None


class EvaluateRequest(BaseModel):
    candidate_id: int
    dialog: List[dict]
    selected_criteria: List[str] = ALL_CRITERIA


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_hallucination(text: str) -> bool:
    cleaned = text.strip().lower()
    if not cleaned:
        return True
    cleaned_no_punct = re.sub(r"[^\w\s]", "", cleaned).strip()
    if not cleaned_no_punct:
        return True
    for phrase in WHISPER_HALLUCINATIONS:
        if cleaned_no_punct == phrase.lower() or cleaned.startswith(phrase.lower()):
            return True
    if len(cleaned_no_punct.split()) <= 2 and len(cleaned_no_punct) < 10:
        return True
    return False


def _safe_int(val) -> int:
    try:
        return max(0, int(val))
    except (TypeError, ValueError):
        return 0


def _safe_list(val) -> list:
    if isinstance(val, list):
        return val
    return []


def _parse_evaluation(raw_json: str, selected_criteria: List[str]) -> dict:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw_json, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError("Не удалось распарсить JSON от YandexGPT")

    markers_raw = data.get("markers", {}) or {}

    markers: dict = {
        "filler_words_count": 0,
        "filler_words_examples": [],
        "rudeness_count": 0,
        "rudeness_examples": [],
        "politeness_count": 0,
        "politeness_examples": [],
        "coherence_score": 10,
        "coherence_issues": [],
    }
    if "filler_words" in selected_criteria:
        markers["filler_words_count"] = _safe_int(markers_raw.get("filler_words_count", 0))
        markers["filler_words_examples"] = _safe_list(markers_raw.get("filler_words_examples"))
    if "rudeness" in selected_criteria:
        markers["rudeness_count"] = _safe_int(markers_raw.get("rudeness_count", 0))
        markers["rudeness_examples"] = _safe_list(markers_raw.get("rudeness_examples"))
    if "politeness" in selected_criteria:
        markers["politeness_count"] = _safe_int(markers_raw.get("politeness_count", 0))
        markers["politeness_examples"] = _safe_list(markers_raw.get("politeness_examples"))
    if "coherence" in selected_criteria:
        raw_score = _safe_int(markers_raw.get("coherence_score", 10))
        markers["coherence_score"] = max(0, min(10, raw_score))
        markers["coherence_issues"] = _safe_list(markers_raw.get("coherence_issues"))

    return {
        "verdict": data.get("verdict", "Не рекомендуется"),
        "markers": markers,
        "quotes": _safe_list(data.get("quotes")),
        "comment": str(data.get("comment", "")),
        "selected_criteria": selected_criteria,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/sessions")
def create_session(db: Session = Depends(get_db)):
    sid = uuid.uuid4().hex[:10]
    session = InterviewSession(session_id=sid)
    db.add(session)
    db.commit()
    logger.info(f"Created session: {sid}")
    return {"session_id": sid}


@app.get("/api/sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.session_id != "demo")
        .order_by(InterviewSession.created_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        item = {
            "session_id": s.session_id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "status": s.status,
            "candidate": None,
        }
        if s.candidate_id:
            c = db.query(Candidate).filter(Candidate.id == s.candidate_id).first()
            if c:
                ev = json.loads(c.evaluation_json) if c.evaluation_json else None
                item["candidate"] = {
                    "name": c.candidate_name,
                    "phone": c.candidate_phone,
                    "verdict": ev["verdict"] if ev else None,
                    "comment": ev["comment"] if ev else None,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
        result.append(item)
    return result


@app.post("/api/candidates")
def create_candidate(payload: CandidateCreate, db: Session = Depends(get_db)):
    if not payload.consent:
        raise HTTPException(
            status_code=400,
            detail="Необходимо дать согласие на обработку персональных данных",
        )
    valid_criteria = [c for c in payload.selected_criteria if c in ALL_CRITERIA]
    candidate = Candidate(
        candidate_name=payload.name.strip(),
        candidate_phone=payload.phone.strip(),
        selected_criteria=json.dumps(valid_criteria, ensure_ascii=False),
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # Link to session if provided (skip for demo session)
    if payload.session_id and payload.session_id != "demo":
        session = db.query(InterviewSession).filter(
            InterviewSession.session_id == payload.session_id
        ).first()
        if session:
            session.candidate_id = candidate.id
            session.status = "in_progress"
            db.commit()

    return {
        "id": candidate.id,
        "name": candidate.candidate_name,
        "selected_criteria": valid_criteria,
    }


@app.get("/api/audio/{phrase_id}")
async def get_audio(phrase_id: int):
    if phrase_id not in (1, 2):
        raise HTTPException(status_code=404, detail="Фраза не найдена")
    audio_path = AUDIO_DIR / f"phrase_{phrase_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Аудиофайл ещё не готов")
    return FileResponse(str(audio_path), media_type="audio/mpeg")


@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY не настроен")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Пустой аудиофайл")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=openai_key)

    try:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(
                audio.filename or "audio.webm",
                io.BytesIO(audio_bytes),
                audio.content_type or "audio/webm",
            ),
            language="ru",
        )
        text = response.text.strip()
    except Exception as e:
        logger.error(f"Whisper transcription error: {e}")
        raise HTTPException(status_code=502, detail=f"Ошибка транскрипции: {str(e)}")

    if _is_hallucination(text):
        return {"text": "", "hallucination": True}

    return {"text": text, "hallucination": False}


@app.post("/api/evaluate")
async def evaluate_candidate(payload: EvaluateRequest, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")

    yandex_key = os.getenv("YANDEX_API_KEY")
    yandex_folder = os.getenv("YANDEX_FOLDER_ID")
    if not yandex_key or not yandex_folder:
        raise HTTPException(
            status_code=503,
            detail="YANDEX_API_KEY или YANDEX_FOLDER_ID не настроен",
        )

    selected_criteria = payload.selected_criteria or ALL_CRITERIA
    system_prompt = build_system_prompt(selected_criteria)
    user_text = build_evaluation_prompt(payload.dialog)

    request_body = {
        "modelUri": f"gpt://{yandex_folder}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.1, "maxTokens": 1500},
        "messages": [
            {"role": "system", "text": system_prompt},
            {"role": "user", "text": user_text},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as http_client:
            resp = await http_client.post(
                "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
                headers={
                    "Authorization": f"Api-Key {yandex_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            resp.raise_for_status()
            result = resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"YandexGPT API error: {e.response.text}")
        raise HTTPException(status_code=502, detail="Ошибка запроса к YandexGPT")
    except Exception as e:
        logger.error(f"YandexGPT request failed: {e}")
        raise HTTPException(status_code=502, detail="Не удалось получить оценку")

    raw_text = result["result"]["alternatives"][0]["message"]["text"]

    try:
        evaluation = _parse_evaluation(raw_text, selected_criteria)
    except Exception as e:
        logger.error(f"Failed to parse YandexGPT response: {e}\nRaw: {raw_text}")
        raise HTTPException(status_code=502, detail="Не удалось разобрать ответ YandexGPT")

    transcript_lines = [f"{t['role']}: {t['text']}" for t in payload.dialog]
    candidate.full_transcript = "\n".join(transcript_lines)
    candidate.evaluation_json = json.dumps(evaluation, ensure_ascii=False)
    db.commit()

    # Mark the linked session as completed
    session = db.query(InterviewSession).filter(
        InterviewSession.candidate_id == candidate.id
    ).first()
    if session and session.session_id != "demo":
        session.status = "completed"
        db.commit()

    return {"candidate_id": candidate.id, "evaluation": evaluation}


@app.get("/api/results/{candidate_id}")
def get_results(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    evaluation = json.loads(candidate.evaluation_json) if candidate.evaluation_json else None
    selected = json.loads(candidate.selected_criteria) if candidate.selected_criteria else ALL_CRITERIA
    return {
        "id": candidate.id,
        "name": candidate.candidate_name,
        "phone": candidate.candidate_phone,
        "selected_criteria": selected,
        "transcript": candidate.full_transcript,
        "evaluation": evaluation,
    }
