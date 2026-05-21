#!/bin/sh
# Start FastAPI backend on port 8000 in background
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start Vite frontend on port 5000
cd frontend && ./node_modules/.bin/vite --host 0.0.0.0 --port 5000

# If frontend exits, kill backend
kill $BACKEND_PID
