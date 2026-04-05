# Role Cases AI-assessor

## Overview

A full-stack Russian HR voice assessment MVP for contact center hiring. Candidates listen to simulated client phrases via TTS audio and record voice responses, which are transcribed via Whisper and evaluated by YandexGPT.

## Architecture

### Frontend (artifacts/hr-assessment)
- React + TypeScript + Vite + Tailwind CSS
- Serves at `/` (port 19570)
- Pages: Start (`/`), Assessment (`/assessment`), Result (`/result/:id`), Results List (`/results`)
- Uses MediaRecorder API for voice recording
- Generated API hooks from `@workspace/api-client-react`

### Backend (artifacts/hr-backend)
- Python FastAPI + SQLAlchemy (SQLite via `hr_assessments.db`)
- Serves at `/api` (port 8080) via the api-server artifact proxy
- **config.py** — hardcoded client phrases and silence message
- **database.py** — SQLite setup with `Assessment` model
- **prompts.py** — YandexGPT evaluation prompt builder
- **main.py** — FastAPI app with all routes

### Proxy Routing
- The api-server artifact (port 8080) is configured to run the Python uvicorn backend
- All `/api` traffic is proxied to port 8080 → Python FastAPI

## API Endpoints
- `GET /api/healthz` — health check
- `GET /api/assessment/audio/{phraseIndex}` — serve TTS audio (0 or 1)
- `POST /api/assessment/transcribe` — Whisper STT (multipart/form-data with `audio` field)
- `POST /api/assessment/evaluate` — YandexGPT HR evaluation + DB save
- `GET /api/assessment/results` — list all assessments
- `GET /api/assessment/results/{id}` — get single assessment

## Required Secrets
- `OPENAI_API_KEY` — OpenAI API key for Whisper STT and TTS (must be a standard OpenAI key, not OpenRouter)
- `YANDEX_API_KEY` — YandexGPT API key
- `YANDEX_FOLDER_ID` — Yandex Cloud folder ID

## Assessment Flow
1. Candidate enters their name on start screen
2. Auto-plays client phrase 1 (TTS audio) → candidate records answer → Whisper transcribes
3. Auto-plays client phrase 2 (TTS audio) → candidate records answer → Whisper transcribes
4. YandexGPT evaluates full dialogue → saves to SQLite → shows HR report

## Key Commands
- `pnpm --filter @workspace/hr-assessment run dev` — run frontend dev server
- `cd artifacts/hr-backend && uvicorn main:app --host 0.0.0.0 --port 8080 --reload` — run Python backend
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks

## Monorepo Stack
- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Python version**: 3.11
- **API framework**: FastAPI (Python)
- **Database**: SQLite (Python) via SQLAlchemy
- **Validation**: Zod (frontend), SQLAlchemy (backend)
- **API codegen**: Orval (from OpenAPI spec)
