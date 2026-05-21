# Role Cases AI-ассистент — HR Voice Assessment

## Обзор

Full-stack приложение для голосовой оценки кандидатов контакт-центра.

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Python 3.12 + FastAPI + Uvicorn |
| БД | PostgreSQL (SQLAlchemy, DATABASE_URL из env) |
| STT | OpenAI Whisper API |
| TTS | OpenAI TTS API (голос nova) |
| Оценка | YandexGPT API |

## Структура

```
backend/
  main.py       — FastAPI-приложение, все эндпоинты
  config.py     — фразы клиента + список Whisper-галлюцинаций
  database.py   — SQLAlchemy модель Candidate (включая audio_path)
  prompts.py    — динамическая генерация системного промпта для YandexGPT
  audio/        — кешированные TTS mp3-файлы + записи кандидатов
frontend/
  src/
    App.tsx                       — роутинг между экранами
    api.ts                        — fetch-обёртки для всех эндпоинтов
    pages/StartPage.tsx           — имя, телефон, 3 критерия, согласие
    pages/InterviewPage.tsx       — воспроизведение аудио + запись + upload
    pages/ResultPage.tsx          — итоговый отчёт (вид кандидата)
    pages/HRDashboard.tsx         — список сессий, кликабельные кандидаты
    pages/CandidateDetail.tsx     — детальная аналитика HR (плашка, аудио, KPI, цитаты, транскрипт)
start.sh        — запускает backend (port 8000) + frontend dev (port 5000)
```

## Запуск

```
sh start.sh
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5000 (Vite proxy /api → backend)

## Переменные окружения

| Переменная | Описание |
|-----------|---------|
| `OPENAI_API_KEY` | Whisper STT + TTS |
| `YANDEX_API_KEY` | YandexGPT |
| `YANDEX_FOLDER_ID` | ID папки Yandex Cloud |
| `DATABASE_URL` | PostgreSQL (или sqlite:///./hr_assessor.db) |

## API эндпоинты

| Метод | Путь | Описание |
|-------|------|---------|
| POST | /api/sessions | Создать сессию, вернуть session_id |
| GET | /api/sessions | Список всех сессий с кандидатами (включая candidate.id) |
| POST | /api/candidates | Создать кандидата (имя, телефон, согласие, критерии) |
| GET | /api/audio/{1\|2} | TTS-аудио клиентских фраз |
| POST | /api/transcribe | Whisper STT (multipart audio) |
| POST | /api/evaluate | YandexGPT оценка + сохранение в БД |
| GET | /api/results/{id} | Результаты по кандидату (включая audio_url) |
| POST | /api/candidates/{id}/recording | Сохранить аудиозапись кандидата на диск |
| GET | /api/candidates/{id}/recording | Получить аудиозапись кандидата |

## Ключевые особенности

- **Стартовый экран**: имя, телефон, согласие на ПД, 3 чекбокса критериев (все включены по умолчанию)
- **Whisper-фильтр**: при пустом тексте / галлюцинациях — ошибка "Вас не было слышно" + кнопка повтора
- **Динамический промпт**: YandexGPT оценивает только выбранные критерии
- **Результаты**: скрывает карточки невыбранных критериев; пустые счётчики строго = 0


