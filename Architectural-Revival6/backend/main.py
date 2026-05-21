import os
import io
import json
import re
import uuid
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.config import CLIENT_PHRASES, CASES, WHISPER_HALLUCINATIONS
from backend.database import Candidate, CandidateRecording, InterviewSession, get_db, init_db
from backend.prompts import ALL_CRITERIA, build_system_prompt, build_user_message

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

        # Backfill: any candidate that finished an interview but isn't linked
        # to any session (typically demo-link runs from before this fix) should
        # also appear in the HR dashboard. Wrap each in its own demo session.
        linked_ids = {
            row[0] for row in db.query(InterviewSession.candidate_id)
            .filter(InterviewSession.candidate_id.isnot(None)).all()
        }
        orphans = db.query(Candidate).filter(~Candidate.id.in_(linked_ids)).all() if linked_ids \
            else db.query(Candidate).all()
        for c in orphans:
            new_sid = f"demo-{uuid.uuid4().hex[:8]}"
            db.add(InterviewSession(
                session_id=new_sid,
                status="completed" if c.evaluation_json else "in_progress",
                candidate_id=c.id,
                created_at=c.created_at,
                selected_criteria=c.selected_criteria,
            ))
            logger.info(f"Backfilled orphan candidate {c.id} → session {new_sid}")
        if orphans:
            db.commit()

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


# ── TTS (Yandex SpeechKit) ────────────────────────────────────────────────────

async def _generate_phrase_audio_yandex(phrase: str, voice: str = "jane", emotion: Optional[str] = "evil", speed: Optional[float] = None) -> bytes:
    yandex_key = os.getenv("YANDEX_API_KEY")
    folder_id = os.getenv("YANDEX_FOLDER_ID")
    headers = {"Authorization": f"Api-Key {yandex_key}"}
    is_ssml = phrase.strip().startswith("<speak>")
    data: dict = {
        "lang": "ru-RU",
        "voice": voice,
        "format": "mp3",
        "folderId": folder_id,
    }
    if is_ssml:
        data["ssml"] = phrase
    else:
        data["text"] = phrase
        if emotion:
            data["emotion"] = emotion
    if speed is not None:
        data["speed"] = str(speed)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
            headers=headers,
            data=data,
        )
        if response.status_code != 200:
            logger.error(f"Yandex TTS error {response.status_code}: {response.text}")
        response.raise_for_status()
        return response.content


async def _ensure_tts_audio():
    yandex_key = os.getenv("YANDEX_API_KEY")
    if not yandex_key:
        logger.warning("YANDEX_API_KEY not set — skipping TTS generation")
        return

    for case_key, case_cfg in CASES.items():
        voice = case_cfg["voice"]
        emotion = case_cfg.get("emotion")
        speeds = case_cfg.get("speed", [])
        for idx, phrase in enumerate(case_cfg["phrases"], start=1):
            if case_key == "maria":
                audio_path = AUDIO_DIR / f"phrase_{idx}.mp3"
            else:
                audio_path = AUDIO_DIR / f"{case_key}_phrase_{idx}.mp3"
            if audio_path.exists():
                logger.info(f"TTS audio {audio_path.name} already cached")
                continue
            phrase_speed = speeds[idx - 1] if isinstance(speeds, list) and idx - 1 < len(speeds) else (speeds if isinstance(speeds, float) else None)
            try:
                logger.info(f"Generating TTS for {case_key} phrase {idx} via Yandex SpeechKit…")
                audio_bytes = await _generate_phrase_audio_yandex(phrase, voice=voice, emotion=emotion, speed=phrase_speed)
                audio_path.write_bytes(audio_bytes)
                logger.info(f"TTS {audio_path.name} saved")
            except Exception as e:
                logger.error(f"Yandex TTS generation failed for {case_key} phrase {idx}: {e}")


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
    filler_threshold: int = 2
    fact_sheet: Optional[str] = None


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


VALID_VERDICTS = {"Рекомендуется", "Частичное соответствие", "Не рекомендуется"}
VALID_COHERENCE_LEVELS = {"несвязная", "есть нюансы", "связная"}
VALID_SPEECH_STYLES = {"деловой", "нейтральный", "неформальный"}
VALID_EMPATHY_LEVELS = {"высокий", "средний", "низкий"}
VALID_INFO_CORRECTNESS = {"корректно", "частично корректно", "некорректно"}


def _parse_evaluation(raw_json: str, selected_criteria: List[str]) -> dict:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw_json, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError("Не удалось распарсить JSON от Claude")

    verdict = data.get("verdict", "Не рекомендуется")
    if verdict not in VALID_VERDICTS:
        verdict = "Не рекомендуется"

    markers_raw = data.get("markers", {}) or {}
    markers: dict = {}

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
        level = markers_raw.get("coherence_level", "есть нюансы")
        if level not in VALID_COHERENCE_LEVELS:
            level = "есть нюансы"
        markers["coherence_level"] = level
        markers["coherence_issues"] = _safe_list(markers_raw.get("coherence_issues"))

    if "business_style" in selected_criteria:
        style = markers_raw.get("speech_style", "нейтральный")
        if style not in VALID_SPEECH_STYLES:
            style = "нейтральный"
        markers["speech_style"] = style
        markers["style_examples"] = _safe_list(markers_raw.get("style_examples"))

    if "empathy" in selected_criteria:
        emp = markers_raw.get("empathy_level", "средний")
        if emp not in VALID_EMPATHY_LEVELS:
            emp = "средний"
        markers["empathy_level"] = emp
        markers["empathy_examples"] = _safe_list(markers_raw.get("empathy_examples"))

    if "information_correctness" in selected_criteria:
        correctness = markers_raw.get("information_correctness", "частично корректно")
        if correctness not in VALID_INFO_CORRECTNESS:
            correctness = "частично корректно"
        markers["information_correctness"] = correctness
        markers["correctness_issues"] = _safe_list(markers_raw.get("correctness_issues"))

    return {
        "verdict": verdict,
        "markers": markers,
        "quotes": _safe_list(data.get("quotes")),
        "comment": "",
        "selected_criteria": selected_criteria,
    }


def generate_summary(verdict: str, markers: dict, selected_criteria: List[str], filler_threshold: int) -> str:
    if verdict == "Рекомендуется":
        return "Все выбранные критерии пройдены успешно."

    if verdict == "Не рекомендуется":
        reasons = []
        if "filler_words" in selected_criteria:
            count = markers.get("filler_words_count", 0)
            if count > filler_threshold:
                reasons.append(
                    f"превышен лимит слов-паразитов ({count} из {filler_threshold} допустимых)"
                )
        if "rudeness" in selected_criteria and markers.get("rudeness_count", 0) > 0:
            reasons.append("зафиксирована грубость")
        if "information_correctness" in selected_criteria and markers.get("information_correctness") == "некорректно":
            reasons.append("предоставлена некорректная информация")
        if "coherence" in selected_criteria and markers.get("coherence_level") == "несвязная":
            reasons.append("несвязная речь")
        if reasons:
            return "Отказ: " + "; ".join(reasons) + "."
        return "Кандидат не соответствует требованиям по выбранным критериям."

    # "Частичное соответствие"
    nuances = []
    if "filler_words" in selected_criteria:
        count = markers.get("filler_words_count", 0)
        if count > 0:
            nuances.append(f"слова-паразиты: {count} шт.")
    if "coherence" in selected_criteria and markers.get("coherence_level") == "есть нюансы":
        nuances.append("связность речи: есть нюансы")
    if "business_style" in selected_criteria and markers.get("speech_style") in ("нейтральный", "неформальный"):
        nuances.append(f"стиль общения: {markers.get('speech_style')}")
    if "empathy" in selected_criteria and markers.get("empathy_level") in ("средний", "низкий"):
        nuances.append(f"эмпатия: {markers.get('empathy_level')} уровень")
    if "politeness" in selected_criteria and markers.get("politeness_count", 0) == 0:
        nuances.append("маркеры вежливости не выявлены")
    if nuances:
        return "Кандидат в целом подходит, но есть нюансы: " + ", ".join(nuances) + "."
    return "Кандидат частично соответствует требованиям."


def _aggregate_verdict(verdicts: List[str]) -> str:
    if all(v == "Рекомендуется" for v in verdicts):
        return "Рекомендуется"
    if any(v == "Не рекомендуется" for v in verdicts):
        return "Не рекомендуется"
    return "Частичное соответствие"


def generate_combined_summary(case_results: List[dict]) -> str:
    parts = []
    for r in case_results:
        parts.append(f"{r['case_name']}: {r['comment']}")
    return " | ".join(parts)


# ── Routes ────────────────────────────────────────────────────────────────────

VALID_CASES = list(CASES.keys())


class SessionCreate(BaseModel):
    selected_criteria: List[str] = ALL_CRITERIA
    filler_threshold: int = 2
    selected_cases: List[str] = ["maria"]


@app.post("/api/sessions")
def create_session(payload: SessionCreate = SessionCreate(), db: Session = Depends(get_db)):
    sid = uuid.uuid4().hex[:10]
    valid_criteria = [c for c in payload.selected_criteria if c in ALL_CRITERIA] or ALL_CRITERIA
    threshold = max(0, min(5, payload.filler_threshold))
    valid_cases = [c for c in payload.selected_cases if c in VALID_CASES] or ["maria"]
    session = InterviewSession(
        session_id=sid,
        selected_criteria=json.dumps(valid_criteria, ensure_ascii=False),
        filler_threshold=threshold,
        selected_cases=json.dumps(valid_cases, ensure_ascii=False),
    )
    db.add(session)
    db.commit()
    logger.info(f"Created session: {sid} criteria={valid_criteria} filler_threshold={threshold} cases={valid_cases}")
    return {"session_id": sid, "selected_criteria": valid_criteria, "filler_threshold": threshold, "selected_cases": valid_cases}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    criteria = json.loads(session.selected_criteria) if session.selected_criteria else ALL_CRITERIA
    threshold = session.filler_threshold if session.filler_threshold is not None else 2
    cases = json.loads(session.selected_cases) if session.selected_cases else ["maria"]
    return {
        "session_id": session.session_id,
        "status": session.status,
        "selected_criteria": criteria,
        "filler_threshold": threshold,
        "selected_cases": cases,
    }


@app.get("/api/sessions")
def list_sessions(db: Session = Depends(get_db)):
    # Hide only the "demo" template session itself; per-candidate demo runs
    # (session_id like "demo-xxxx") should appear in the dashboard.
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
                    "id": c.id,
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
    # Use criteria/threshold/cases from session if available, otherwise from payload
    session_criteria = None
    session_threshold = 2
    session_cases = ["maria"]
    if payload.session_id and payload.session_id != "demo":
        sess = db.query(InterviewSession).filter(
            InterviewSession.session_id == payload.session_id
        ).first()
        if sess and sess.selected_criteria:
            session_criteria = json.loads(sess.selected_criteria)
        if sess and sess.filler_threshold is not None:
            session_threshold = sess.filler_threshold
        if sess and sess.selected_cases:
            session_cases = json.loads(sess.selected_cases)

    if session_criteria:
        valid_criteria = [c for c in session_criteria if c in ALL_CRITERIA]
    else:
        valid_criteria = [c for c in payload.selected_criteria if c in ALL_CRITERIA]

    if not valid_criteria:
        valid_criteria = ALL_CRITERIA

    candidate = Candidate(
        candidate_name=payload.name.strip(),
        candidate_phone=payload.phone.strip(),
        selected_criteria=json.dumps(valid_criteria, ensure_ascii=False),
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # Link to session. For the special "demo" session_id, spawn a fresh
    # per-candidate session so demo results show up in the HR dashboard.
    if payload.session_id == "demo":
        new_sid = f"demo-{uuid.uuid4().hex[:8]}"
        db.add(InterviewSession(
            session_id=new_sid,
            status="in_progress",
            candidate_id=candidate.id,
            selected_criteria=json.dumps(valid_criteria, ensure_ascii=False),
            filler_threshold=session_threshold,
            selected_cases=json.dumps(session_cases, ensure_ascii=False),
        ))
        db.commit()
    elif payload.session_id:
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
        "filler_threshold": session_threshold,
        "selected_cases": session_cases,
    }


@app.get("/api/audio/{case_key}/{phrase_id}")
async def get_audio_case(case_key: str, phrase_id: int):
    if case_key not in CASES:
        raise HTTPException(status_code=404, detail="Кейс не найден")
    case_cfg = CASES[case_key]
    if phrase_id < 1 or phrase_id > len(case_cfg["phrases"]):
        raise HTTPException(status_code=404, detail="Фраза не найдена")
    if case_key == "maria":
        audio_path = AUDIO_DIR / f"phrase_{phrase_id}.mp3"
    else:
        audio_path = AUDIO_DIR / f"{case_key}_phrase_{phrase_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=503, detail="Аудиофайл ещё не готов")
    return FileResponse(str(audio_path), media_type="audio/mpeg")


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
    import base64

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY не настроен")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Пустой аудиофайл")

    content_type = audio.content_type or "audio/webm"
    if "wav" in content_type or "wave" in content_type:
        fmt = "wav"
    elif "ogg" in content_type:
        fmt = "ogg"
    elif "mp4" in content_type or "m4a" in content_type:
        fmt = "mp4"
    elif "mp3" in content_type or "mpeg" in content_type:
        fmt = "mp3"
    else:
        fmt = "webm"

    b64_audio = base64.b64encode(audio_bytes).decode("utf-8")

    payload = {
        "model": "openai/whisper-large-v3",
        "input_audio": {
            "data": b64_audio,
            "format": fmt,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/audio/transcriptions",
                headers={
                    "Authorization": f"Bearer {openrouter_key}",
                    "Content-Type": "application/json",
                },
                content=json.dumps(payload),
            )
            response.raise_for_status()
            result = response.json()
            text = result.get("text", "").strip()
    except httpx.HTTPStatusError as e:
        logger.error(f"OpenRouter STT HTTP error {e.response.status_code}: {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Ошибка OpenRouter STT: {e.response.text}")
    except Exception as e:
        logger.error(f"OpenRouter STT error: {e}")
        raise HTTPException(status_code=502, detail=f"Ошибка транскрипции: {str(e)}")

    if _is_hallucination(text):
        return {"text": "", "hallucination": True}

    return {"text": text, "hallucination": False}


@app.post("/api/evaluate")
async def evaluate_candidate(payload: EvaluateRequest, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY не настроен",
        )

    selected_criteria = payload.selected_criteria or ALL_CRITERIA
    system_prompt = build_system_prompt(selected_criteria)
    user_text = build_user_message(
        payload.dialog,
        selected_criteria,
        filler_threshold=payload.filler_threshold,
        fact_sheet=payload.fact_sheet,
    )

    import openai
    client = openai.AsyncOpenAI(
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
    )

    PRIMARY_MODEL = "anthropic/claude-sonnet-4-5"
    FALLBACK_MODEL = "google/gemini-2.5-flash"

    async def _chat(model: str) -> str:
        resp = await client.chat.completions.create(
            model=model,
            max_tokens=1500,
            temperature=0.1,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
        )
        return resp.choices[0].message.content or ""

    try:
        raw_text = await _chat(PRIMARY_MODEL)
    except Exception as e:
        logger.warning(f"Primary model {PRIMARY_MODEL} failed: {e}. Trying fallback {FALLBACK_MODEL}…")
        try:
            raw_text = await _chat(FALLBACK_MODEL)
        except Exception as e2:
            logger.error(f"Fallback model {FALLBACK_MODEL} also failed: {e2}")
            raise HTTPException(status_code=502, detail="Ошибка запроса к OpenRouter (Gemini + Claude)")

    try:
        evaluation = _parse_evaluation(raw_text, selected_criteria)
    except Exception as e:
        logger.error(f"Failed to parse OpenRouter response: {e}\nRaw: {raw_text}")
        raise HTTPException(status_code=502, detail="Не удалось разобрать ответ Claude")

    evaluation["comment"] = generate_summary(
        evaluation["verdict"],
        evaluation["markers"],
        selected_criteria,
        payload.filler_threshold,
    )

    transcript_lines = [f"{t['role']}: {t['text']}" for t in payload.dialog]
    candidate.full_transcript = "\n".join(transcript_lines)
    candidate.evaluation_json = json.dumps(evaluation, ensure_ascii=False)
    if not candidate.interview_finished_at:
        candidate.interview_finished_at = datetime.utcnow()
    db.commit()

    # Mark the linked session as completed
    session = db.query(InterviewSession).filter(
        InterviewSession.candidate_id == candidate.id
    ).first()
    if session and session.session_id != "demo":
        session.status = "completed"
        db.commit()

    return {"candidate_id": candidate.id, "evaluation": evaluation}


class EvaluateCaseInput(BaseModel):
    case_key: str
    dialog: List[dict]


class EvaluateMultiRequest(BaseModel):
    candidate_id: int
    cases: List[EvaluateCaseInput]
    selected_criteria: List[str] = ALL_CRITERIA
    filler_threshold: int = 2


@app.post("/api/evaluate-multi")
async def evaluate_multi(payload: EvaluateMultiRequest, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY не настроен")

    import openai
    client = openai.AsyncOpenAI(
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
    )

    PRIMARY_MODEL = "anthropic/claude-sonnet-4-5"
    FALLBACK_MODEL = "google/gemini-2.5-flash"

    selected_criteria = payload.selected_criteria or ALL_CRITERIA
    system_prompt = build_system_prompt(selected_criteria)

    case_results = []
    for case_input in payload.cases:
        case_key = case_input.case_key
        case_cfg = CASES.get(case_key, CASES["maria"])

        user_text = build_user_message(
            case_input.dialog,
            selected_criteria,
            filler_threshold=payload.filler_threshold,
        )

        async def _chat_multi(model: str, _user_text: str = user_text) -> str:
            resp = await client.chat.completions.create(
                model=model,
                max_tokens=1500,
                temperature=0.1,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": _user_text},
                ],
            )
            return resp.choices[0].message.content or ""

        try:
            raw_text = await _chat_multi(PRIMARY_MODEL)
        except Exception as e:
            logger.warning(f"Primary model {PRIMARY_MODEL} failed for case {case_key}: {e}. Trying fallback…")
            try:
                raw_text = await _chat_multi(FALLBACK_MODEL)
            except Exception as e2:
                logger.error(f"Fallback also failed for case {case_key}: {e2}")
                raise HTTPException(status_code=502, detail=f"Ошибка запроса к OpenRouter для кейса {case_key}")

        try:
            evaluation = _parse_evaluation(raw_text, selected_criteria)
        except Exception as e:
            logger.error(f"Failed to parse response for case {case_key}: {e}\nRaw: {raw_text}")
            raise HTTPException(status_code=502, detail=f"Не удалось разобрать ответ Claude для кейса {case_key}")

        evaluation["comment"] = generate_summary(
            evaluation["verdict"],
            evaluation["markers"],
            selected_criteria,
            payload.filler_threshold,
        )
        evaluation["case_key"] = case_key
        evaluation["case_name"] = case_cfg["name"]
        evaluation["case_description"] = case_cfg["description"]
        case_results.append(evaluation)

    overall_verdict = _aggregate_verdict([r["verdict"] for r in case_results])
    combined_comment = generate_combined_summary(case_results)

    evaluation_json = {
        "is_multi_case": True,
        "verdict": overall_verdict,
        "comment": combined_comment,
        "combined_comment": combined_comment,
        "cases": case_results,
        "selected_criteria": selected_criteria,
    }

    transcript_parts = []
    for r in case_results:
        transcript_parts.append(f"=== {r['case_name']} ===")
    candidate.full_transcript = "\n".join(transcript_parts)
    candidate.evaluation_json = json.dumps(evaluation_json, ensure_ascii=False)
    if not candidate.interview_finished_at:
        candidate.interview_finished_at = datetime.utcnow()
    db.commit()

    session = db.query(InterviewSession).filter(
        InterviewSession.candidate_id == candidate.id
    ).first()
    if session and session.session_id != "demo":
        session.status = "completed"
        db.commit()

    return {
        "candidate_id": candidate.id,
        "evaluations": case_results,
        "combined_comment": combined_comment,
    }


@app.get("/api/results/{candidate_id}")
def get_results(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    evaluation = json.loads(candidate.evaluation_json) if candidate.evaluation_json else None
    selected = json.loads(candidate.selected_criteria) if candidate.selected_criteria else ALL_CRITERIA
    # Build audio URLs: prefer DB-stored recordings (persistent), fall back to
    # legacy disk files (may disappear after container restart).
    db_recs = (
        db.query(CandidateRecording)
        .filter(CandidateRecording.candidate_id == candidate_id)
        .order_by(CandidateRecording.recording_index)
        .all()
    )
    if db_recs:
        audio_urls = [
            f"/api/candidates/{candidate_id}/recording/{r.recording_index}"
            for r in db_recs
        ]
    else:
        # Legacy: only include disk files that still exist
        audio_paths = _parse_audio_paths(candidate.audio_path)
        audio_urls = [
            f"/api/candidates/{candidate_id}/recording/{i}"
            for i, p in enumerate(audio_paths)
            if Path(p).exists()
        ]
    started = candidate.interview_started_at
    finished = candidate.interview_finished_at
    duration_sec = None
    if started and finished:
        duration_sec = max(0, int((finished - started).total_seconds()))
    is_multi = evaluation and evaluation.get("is_multi_case")
    return {
        "id": candidate.id,
        "name": candidate.candidate_name,
        "phone": candidate.candidate_phone,
        "selected_criteria": selected,
        "transcript": candidate.full_transcript,
        "evaluation": None if is_multi else evaluation,
        "evaluations": evaluation.get("cases") if is_multi else None,
        "combined_comment": evaluation.get("combined_comment") if is_multi else None,
        "audio_urls": audio_urls,
        "interview_started_at": started.isoformat() if started else None,
        "interview_finished_at": finished.isoformat() if finished else None,
        "interview_duration_sec": duration_sec,
    }


@app.post("/api/candidates/{candidate_id}/start")
def mark_interview_started(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    if not candidate.interview_started_at:
        candidate.interview_started_at = datetime.utcnow()
        db.commit()
    return {"started_at": candidate.interview_started_at.isoformat()}


def _parse_audio_paths(raw: Optional[str]) -> List[str]:
    """audio_path may be a JSON list (new) or a single path string (legacy)."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    return [raw]  # legacy single-path format


@app.post("/api/candidates/{candidate_id}/recording")
async def upload_recording(
    candidate_id: int,
    audio: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    if not audio:
        raise HTTPException(status_code=400, detail="Нет аудиофайлов")

    # Delete any existing DB recordings for this candidate before saving new ones
    db.query(CandidateRecording).filter(
        CandidateRecording.candidate_id == candidate_id
    ).delete()

    saved_count = 0
    for idx, file in enumerate(audio):
        audio_bytes = await file.read()
        if not audio_bytes:
            continue
        ct = file.content_type or "audio/webm"
        rec = CandidateRecording(
            candidate_id=candidate_id,
            recording_index=idx,
            audio_data=audio_bytes,
            content_type=ct,
        )
        db.add(rec)
        saved_count += 1

        # Also write to disk as fallback (best-effort, may be lost on restart)
        if ct.startswith("audio/wav") or ct.startswith("audio/wave"):
            ext = "wav"
        elif ct.startswith("audio/ogg"):
            ext = "ogg"
        else:
            ext = "webm"
        try:
            path = AUDIO_DIR / f"candidate_{candidate_id}_{idx}.{ext}"
            path.write_bytes(audio_bytes)
        except Exception:
            pass

    if saved_count == 0:
        raise HTTPException(status_code=400, detail="Пустые аудиофайлы")

    db.commit()
    logger.info(f"Saved {saved_count} recording(s) for candidate {candidate_id} in DB")
    return {
        "status": "ok",
        "audio_urls": [
            f"/api/candidates/{candidate_id}/recording/{i}" for i in range(saved_count)
        ],
    }


@app.delete("/api/candidates/{candidate_id}")
def delete_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")

    # Remove DB recordings
    db.query(CandidateRecording).filter(
        CandidateRecording.candidate_id == candidate_id
    ).delete()

    # Remove stored audio files from disk (best-effort)
    for path_str in _parse_audio_paths(candidate.audio_path):
        try:
            p = Path(path_str)
            if p.exists():
                p.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete audio file {path_str}: {e}")

    # Detach from any linked sessions (keep the session row, mark as removed)
    sessions = db.query(InterviewSession).filter(
        InterviewSession.candidate_id == candidate_id
    ).all()
    for s in sessions:
        s.candidate_id = None
        if s.session_id != "demo":
            s.status = "removed"

    db.delete(candidate)
    db.commit()
    logger.info(f"Deleted candidate {candidate_id}")
    return {"status": "ok"}


@app.get("/api/candidates/{candidate_id}/recording/{index}")
def get_recording(candidate_id: int, index: int, db: Session = Depends(get_db)):
    # Primary source: database (persists across container restarts)
    rec = db.query(CandidateRecording).filter(
        CandidateRecording.candidate_id == candidate_id,
        CandidateRecording.recording_index == index,
    ).first()
    if rec:
        return Response(
            content=rec.audio_data,
            media_type=rec.content_type or "audio/webm",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # Fallback: legacy disk file (may be missing after container restart)
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    paths = _parse_audio_paths(candidate.audio_path)
    if 0 <= index < len(paths):
        audio_path = Path(paths[index])
        if audio_path.exists():
            suffix = audio_path.suffix.lstrip(".")
            media_type = f"audio/{suffix}" if suffix else "audio/webm"
            return FileResponse(str(audio_path), media_type=media_type)

    raise HTTPException(status_code=404, detail="Аудиофайл не найден")


# ── Static frontend (production) ──────────────────────────────────────────────
# In production the Vite dev server is not used; the built SPA is served by
# FastAPI from frontend/dist. Keep this mount LAST so /api/* routes win.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")

