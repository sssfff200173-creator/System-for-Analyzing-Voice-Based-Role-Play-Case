import os
import json
import asyncio
import aiofiles
from pathlib import Path
from datetime import timezone

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from config import CLIENT_PHRASES, SILENCE_MESSAGE, AUDIO_CACHE_DIR
from database import Assessment, get_db, init_db
from prompts import build_evaluation_prompt

app = FastAPI(title="HR Assessment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

openai_client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
YANDEX_API_KEY = os.environ.get("YANDEX_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")

Path(AUDIO_CACHE_DIR).mkdir(exist_ok=True)


@app.on_event("startup")
async def startup_event():
    init_db()
    await generate_audio_cache()


async def generate_audio_cache():
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
            async with aiofiles.open(audio_path, "wb") as f:
                await f.write(response.content)
        except Exception as e:
            print(f"Error generating audio for phrase {i}: {e}")


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


@app.post("/api/assessment/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()

        transcript = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio.filename or "audio.webm", audio_bytes, audio.content_type or "audio/webm"),
            language="ru",
        )

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


async def call_yandex_gpt(prompt: str) -> str:
    import httpx

    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    headers = {
        "Authorization": f"Api-Key {YANDEX_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt-lite",
        "completionOptions": {
            "stream": False,
            "temperature": 0.1,
            "maxTokens": 1000,
        },
        "messages": [
            {"role": "user", "text": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
        return data["result"]["alternatives"][0]["message"]["text"]


def build_full_transcript(dialogue: list[DialogTurn]) -> str:
    lines = []
    for turn in dialogue:
        role_label = "Клиент" if turn.role == "client" else "Кандидат"
        lines.append(f"{role_label}: {turn.text}")
    return "\n".join(lines)


@app.post("/api/assessment/evaluate")
async def evaluate_assessment(req: EvaluateRequest, db: Session = Depends(get_db)):
    try:
        dialogue_dicts = [{"role": t.role, "text": t.text} for t in req.dialogue]
        prompt = build_evaluation_prompt(dialogue_dicts)

        raw_response = await call_yandex_gpt(prompt)

        raw_response = raw_response.strip()
        if raw_response.startswith("```"):
            lines = raw_response.split("\n")
            raw_response = "\n".join(lines[1:-1])

        evaluation = json.loads(raw_response)

        required_keys = {"verdict", "markers", "quotes"}
        if not required_keys.issubset(evaluation.keys()):
            raise ValueError("Invalid evaluation structure from YandexGPT")

    except (json.JSONDecodeError, ValueError, KeyError) as e:
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
        results.append({
            "id": a.id,
            "candidateName": a.candidate_name,
            "evaluation": json.loads(a.evaluation_json),
            "fullTranscript": a.full_transcript,
            "createdAt": a.created_at.isoformat() if a.created_at else "",
        })
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
