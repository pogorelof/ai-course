from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .routers.auth import router as auth_router
from .routers.courses import router as courses_router
from .db import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(title="AI Online Courses API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"] ,
        allow_headers=["*"] ,
    )

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(auth_router, prefix="/auth", tags=["auth"]) 
    app.include_router(courses_router, prefix="/courses", tags=["courses"]) 

    return app


app = create_app()

