import os
import json
import asyncio
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from config import CLIENT_PHRASES, SILENCE_MESSAGE, AUDIO_CACHE_DIR
from database import Assessment, Interview, get_db, init_db
from prompts import build_evaluation_prompt

app = FastAPI(title="HR Assessment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

openai_client = AsyncOpenAI(
    api_key=os.environ.get("OPENAI_API_KEY", ""),
)

YANDEX_API_KEY = os.environ.get("YANDEX_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")

Path(AUDIO_CACHE_DIR).mkdir(exist_ok=True)


async def generate_audio_cache() -> None:
    for i, phrase in enumerate(CLIENT_PHRASES):
        audio_path = Path(AUDIO_CACHE_DIR) / f"phrase_{i}.mp3"
        if audio_path.exists():
            continue
        try:
            response = await openai_client.audio.speech.create(
                model="tts-1",
                voice="nova",
                input=phrase,
            )
            audio_path.write_bytes(response.content)
            print(f"Audio generated: {audio_path}")
        except Exception as e:
            print(f"Error generating audio for phrase {i}: {e}")


@app.on_event("startup")
async def startup_event():
    init_db()


@app.get("/api/healthz")
async def health_check():
    return {"status": "ok"}


@app.get("/api/assessment/audio/{phrase_index}")
async def get_phrase_audio(phrase_index: int):
    if phrase_index < 0 or phrase_index >= len(CLIENT_PHRASES):
        raise HTTPException(status_code=404, detail="Phrase not found")

    audio_path = Path(AUDIO_CACHE_DIR) / f"phrase_{phrase_index}.mp3"

    if not audio_path.exists():
        await generate_audio_cache()

    if not audio_path.exists():
        raise HTTPException(status_code=500, detail="Audio file not available")

    return FileResponse(
        path=str(audio_path),
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/api/sessions")
async def create_session(db: Session = Depends(get_db)):
    import uuid as uuid_lib
    session_uuid = str(uuid_lib.uuid4())
    interview = Interview(uuid=session_uuid, status="pending")
    db.add(interview)
    db.commit()
    db.refresh(interview)
    return {"uuid": session_uuid}


@app.get("/api/sessions")
async def list_sessions(db: Session = Depends(get_db)):
    interviews = db.query(Interview).order_by(Interview.created_at.desc()).all()
    result = []
    for iv in interviews:
        assessment_info = None
        if iv.assessment_id:
            a = db.query(Assessment).filter(Assessment.id == iv.assessment_id).first()
            if a:
                ev = json.loads(a.evaluation_json)
                assessment_info = {
                    "id": a.id,
                    "candidateName": a.candidate_name,
                    "verdict": ev.get("verdict", ""),
                    "createdAt": a.created_at.isoformat() if a.created_at else "",
                }
        result.append({
            "uuid": iv.uuid,
            "status": iv.status,
            "createdAt": iv.created_at.isoformat() if iv.created_at else "",
            "assessment": assessment_info,
        })
    return result


@app.get("/api/sessions/{session_uuid}")
async def get_session(session_uuid: str, db: Session = Depends(get_db)):
    interview = db.query(Interview).filter(Interview.uuid == session_uuid).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"uuid": interview.uuid, "status": interview.status}


@app.post("/api/assessment/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()

        # Сохраняем аудио во временный файл для корректной отправки в OpenAI
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            temp_audio.write(audio_bytes)
            temp_path = temp_audio.name

        try:
            # Открываем файл и отправляем в Whisper
            with open(temp_path, "rb") as audio_file:
                transcript = await openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="ru",
                )
        finally:
            # Обязательно удаляем временный файл, чтобы не засорять сервер
            if os.path.exists(temp_path):
                os.remove(temp_path)

        text = transcript.text.strip()
        is_empty = len(text) < 3

        return {"text": text, "isEmpty": is_empty}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


class DialogTurn(BaseModel):
    role: str
    text: str


class EvaluateRequest(BaseModel):
    candidateName: str
    dialogue: list[DialogTurn]
    sessionUuid: str | None = None


async def call_yandex_gpt(prompt: str) -> str:
    import httpx

    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    headers = {
        "Authorization": f"Api-Key {YANDEX_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt",
        "completionOptions": {
            "stream": False,
            "temperature": 0.1,
            "maxTokens": "1000",
        },
        "messages": [
            {"role": "user", "text": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=headers, json=body)
        if not response.is_success:
            print(f"YandexGPT error {response.status_code}: {response.text}")
            response.raise_for_status()
        data = response.json()
        return data["result"]["alternatives"][0]["message"]["text"]


def build_full_transcript(dialogue: list[DialogTurn]) -> str:
    lines = []
    for turn in dialogue:
        role_label = "Клиент" if turn.role == "client" else "Кандидат"
        lines.append(f"{role_label}: {turn.text}")
    return "\\n".join(lines)


@app.post("/api/assessment/evaluate")
async def evaluate_assessment(req: EvaluateRequest, db: Session = Depends(get_db)):
    try:
        dialogue_dicts = [{"role": t.role, "text": t.text} for t in req.dialogue]
        prompt = build_evaluation_prompt(dialogue_dicts)

        raw_response = await call_yandex_gpt(prompt)

        raw_response = raw_response.strip()
        if raw_response.startswith("```"):
            lines = raw_response.split("\n")
            # strip opening fence (```json or ```) and closing fence (```)
            lines = [l for l in lines if not l.startswith("```")]
            raw_response = "\n".join(lines).strip()

        print(f"[YandexGPT raw response]: {raw_response!r}")
        raw_eval = json.loads(raw_response)
        print(f"[YandexGPT parsed]: {raw_eval}")

        if "verdict" not in raw_eval:
            raise ValueError("Missing verdict in YandexGPT response")

        filler_quotes = raw_eval.get("fillerQuotes", [])
        rudeness_quotes = raw_eval.get("rudenessQuotes", [])
        politeness_quotes = raw_eval.get("politenessQuotes", [])

        flat_quotes = (
            [f"ПАРАЗИТ: {q}" for q in filler_quotes if q] +
            [f"ГРУБОСТЬ: {q}" for q in rudeness_quotes if q] +
            [f"ВЕЖЛИВОСТЬ: {q}" for q in politeness_quotes if q]
        )

        evaluation = {
            "verdict": raw_eval["verdict"],
            "markers": {
                "fillerWordCount": len(filler_quotes),
                "politenessMarkers": len(politeness_quotes),
            },
            "quotes": flat_quotes,
        }

    except (json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[Evaluation parse error]: {e!r}  raw={raw_response!r}")
        evaluation = {
            "verdict": "Не рекомендуется",
            "markers": {"fillerWordCount": 0, "politenessMarkers": 0},
            "quotes": [],
        }

    full_transcript = build_full_transcript(req.dialogue)

    assessment = Assessment(
        candidate_name=req.candidateName,
        full_transcript=full_transcript,
        evaluation_json=json.dumps(evaluation, ensure_ascii=False),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    if req.sessionUuid:
        interview = db.query(Interview).filter(Interview.uuid == req.sessionUuid).first()
        if interview:
            interview.status = "completed"
            interview.assessment_id = assessment.id
            db.commit()

    created_at_str = assessment.created_at.isoformat() if assessment.created_at else ""

    return {
        "id": assessment.id,
        "candidateName": assessment.candidate_name,
        "evaluation": evaluation,
        "fullTranscript": assessment.full_transcript,
        "createdAt": created_at_str,
    }


@app.get("/api/assessment/results")
async def list_results(db: Session = Depends(get_db)):
    assessments = db.query(Assessment).order_by(Assessment.created_at.desc()).all()
    results = []
    for a in assessments:
        results.append(
            {
                "id": a.id,
                "candidateName": a.candidate_name,
                "evaluation": json.loads(a.evaluation_json),
                "fullTranscript": a.full_transcript,
                "createdAt": a.created_at.isoformat() if a.created_at else "",
            }
        )
    return results


@app.get("/api/assessment/results/{result_id}")
async def get_result(result_id: int, db: Session = Depends(get_db)):
    assessment = db.query(Assessment).filter(Assessment.id == result_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {
        "id": assessment.id,
        "candidateName": assessment.candidate_name,
        "evaluation": json.loads(assessment.evaluation_json),
        "fullTranscript": assessment.full_transcript,
        "createdAt": assessment.created_at.isoformat() if assessment.created_at else "",
    }