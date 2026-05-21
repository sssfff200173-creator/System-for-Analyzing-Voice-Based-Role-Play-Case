# Role Cases AI-ассистент — HR Voice Assessment

Приложение для голосовой оценки кандидатов контакт-центра: кандидат слышит аудио с репликами «клиента», отвечает вслух, система транскрибирует и оценивает речь по заданным HR критериям.

## Run & Operate

| Команда | Что делает |
|---------|-----------|
| HR Backend workflow | `python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` |
| HR Frontend workflow | `cd frontend && npm run dev` (порт 5000) |

- Required env: `OPENAI_API_KEY` — Whisper STT + TTS + GPT-4o-mini evaluation
- Optional env: `DATABASE_URL` — PostgreSQL (по умолчанию SQLite `hr_assessor.db`)

## Stack

- Backend: Python 3.12 + FastAPI + Uvicorn + SQLAlchemy (SQLite/Postgres)
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- STT/TTS: OpenAI Whisper + TTS API (голос nova)
- Оценка: GPT-4o-mini (JSON-режим)

## Where things live

```
backend/
  main.py      — FastAPI, все эндпоинты
  config.py    — фразы клиента + Whisper-галлюцинации
  database.py  — SQLAlchemy модели: Candidate, CandidateRecording, InterviewSession
  prompts.py   — динамический системный промпт для GPT
  audio/       — кешированные TTS mp3 + записи кандидатов
frontend/
  src/
    App.tsx                  — роутинг по параметрам URL
    api.ts                   — fetch-обёртки
    pages/StartPage.tsx      — форма регистрации кандидата
    pages/PreparationPage.tsx
    pages/BriefingPage.tsx
    pages/InterviewPage.tsx  — запись + воспроизведение аудио
    pages/CandidateThanks.tsx
    pages/HRDashboard.tsx    — список сессий (без ?id)
    pages/CandidateDetail.tsx— детальная аналитика кандидата (?candidate=N)
    pages/ResultPage.tsx
```

## Architecture decisions

- Фронтенд проксирует `/api` → `localhost:8000` через Vite proxy (dev-режим)
- SQLite по умолчанию — можно переключить на PostgreSQL через `DATABASE_URL`
- TTS-аудио кешируется на диск при первом старте (нужен `OPENAI_API_KEY`)
- Оценка через GPT-4o-mini (JSON-режим), а не YandexGPT — упрощает интеграцию
- CandidateRecording хранит аудио-blob в БД (персистентно между перезапусками)

## Product

- HR создаёт ссылку на сессию (`/?id=<session_id>`), отправляет кандидату
- Кандидат проходит интервью: слышит фразы клиента, отвечает вслух
- После завершения HR видит оценку в дашборде (`/` без параметров)
- Дашборд показывает вердикт, маркеры (слова-паразиты, грубость, вежливость, связность), цитаты

## Gotchas

- Без `OPENAI_API_KEY` TTS-аудио не генерируется, транскрипция и оценка не работают
- Воркфлоу "HR Frontend" — основной webview (порт 5000)
- Воркфлоу "HR Backend" — console, порт 8000
- БД инициализируется автоматически при старте, включая миграции ALTER TABLE
