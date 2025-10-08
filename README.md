# AI Online Courses

Monorepo containing FastAPI backend and React (Vite) frontend.

## Structure

- `backend`: FastAPI app (SQLite, JWT auth)
- `frontend`: React + TypeScript + Vite SPA

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Environment file (`backend/.env`):

```
SECRET_KEY=change_me_in_production
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano
# Optional
# LANGCHAIN_TRACING_V2=true
```
`OPENAI_MODEL` - Models used for testing: `gpt-5` and `gpt-5-nano`.

`SECRET_KEY` - for JWT auth. You can leave `change_me_in_production` for tests.

SQLite database `backend/app.db` is created automatically on startup.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

- POST `/auth/register`: { username, email, password } → User
- POST `/auth/login`: { username, password } → { access_token, token_type }
- GET `/health`: { status: "ok" }
- POST `/courses/outline` (auth): body `{ title, wishes }` → creates course and 15 topics with empty `content`, returns list of topics
- POST `/courses/topics/{topic_id}/generate` (auth): generates and saves `content` for a topic and returns `{ course_title, course_id, topic_id, content }`
- GET `/courses/mine` (auth): returns array of the current user's courses, each `{ id, title }`
- GET `/courses/{course_id}/topics` (auth): returns array of topics for the given course, each `{ id, title, content|null }`
