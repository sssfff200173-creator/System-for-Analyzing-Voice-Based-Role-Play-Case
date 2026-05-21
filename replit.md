# HR Voice Assessment App

## Architecture

- **Frontend**: React + Vite (`artifacts/hr-assessment/`) — runs at port 18664 via `artifacts/hr-stub: web` workflow
- **Backend**: FastAPI + Python (`artifacts/hr-backend/`) — runs at port 8000 via `HR Backend` workflow
- **API Proxy**: Vite dev server proxies `/api/*` to `http://localhost:8000`

## Workflows

| Name | Command | Port | Type |
|------|---------|------|------|
| `artifacts/hr-stub: web` | `pnpm install && pnpm --filter @workspace/hr-assessment run dev` | 18664 | webview |
| `HR Backend` | `cd artifacts/hr-backend && python run.py` | 8000 | console |

## Environment Variables Required

- `OPENAI_API_KEY` — for Whisper STT + TTS audio generation
- `YANDEX_API_KEY` — for YandexGPT HR evaluation
- `YANDEX_FOLDER_ID` — for YandexGPT model URI

## Backend Details

- FastAPI app in `artifacts/hr-backend/main.py`
- SQLite database at `artifacts/hr-backend/hr_assessments.db`
- Audio cache at `artifacts/hr-backend/audio_cache/` (pre-generated phrase_0.mp3, phrase_1.mp3)
- Uses relative imports — must run from `artifacts/hr-backend/` directory

## Key API Endpoints

- `GET /api/healthz` — health check
- `GET /api/assessment/audio/{0|1}` — TTS audio for client phrases
- `POST /api/assessment/transcribe` — Whisper STT (multipart audio upload)
- `POST /api/assessment/evaluate` — YandexGPT HR evaluation + DB save
- `GET /api/assessment/results` — list all saved results
- `GET /api/assessment/results/{id}` — single result

## Artifact Registration

The frontend is registered as artifact `artifacts/hr-stub` (react-vite kind) at previewPath `/`. The actual code lives in `artifacts/hr-assessment/` — the artifact.toml in `artifacts/hr-stub/.replit-artifact/artifact.toml` points the dev/build commands to hr-assessment.
