from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text, update

from .core.config import settings
from .db import Base, SessionLocal, engine
from .models import CourseGenerationJob
from .routers.auth import router as auth_router
from .routers.courses import router as courses_router


def _ensure_reasoning_effort_column() -> None:
    """Add ``reasoning_effort`` to ``course_ai_settings`` for already-existing DBs.

    SQLAlchemy's ``create_all`` does not modify existing tables, so projects
    upgraded in place (the on-disk SQLite file) need an inline ALTER. SQLite
    accepts ``ADD COLUMN`` cheaply.
    """
    try:
        inspector = inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("course_ai_settings")}
    except Exception:
        return
    if "reasoning_effort" in columns:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE course_ai_settings ADD COLUMN reasoning_effort "
                "VARCHAR(16) NOT NULL DEFAULT 'minimal'"
            )
        )


def create_app() -> FastAPI:
    app = FastAPI(title="AI Online Courses API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)
        _ensure_reasoning_effort_column()

        # Any "running" job we see here was killed by a process restart.
        # Mark it as error so the UI does not poll a stuck progress bar.
        session = SessionLocal()
        try:
            session.execute(
                update(CourseGenerationJob)
                .where(CourseGenerationJob.status.in_(("pending", "running")))
                .values(
                    status="error",
                    error_message="Server restarted before queue finished",
                    updated_at=datetime.utcnow(),
                )
            )
            session.commit()
        finally:
            session.close()

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(auth_router, prefix="/auth", tags=["auth"])
    app.include_router(courses_router, prefix="/courses", tags=["courses"])

    return app


app = create_app()

