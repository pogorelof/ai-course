import os
import tempfile
from typing import Generator, Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import create_app
from app.db import Base, get_db


@pytest.fixture(scope="session")
def _test_db_url() -> Generator[str, None, None]:
    fd, path = tempfile.mkstemp(prefix="test_db_", suffix=".sqlite")
    os.close(fd)
    url = f"sqlite:///{path}"
    try:
        yield url
    finally:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


@pytest.fixture(scope="session")
def engine(_test_db_url: str):
    engine = create_engine(_test_db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def db_session(engine):
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def app(db_session):
    # override dependency to use our session
    app = create_app()

    def get_test_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = get_test_db
    # Mark environment as testing for any code paths depending on it
    os.environ["TESTING"] = "1"
    return app


@pytest.fixture()
def client(app) -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers(client: TestClient) -> Callable[..., dict[str, str]]:
    def _make(username: str = "user1", password: str = "secret", email: str = "u1@example.com") -> dict[str, str]:
        client.post("/auth/register", json={"username": username, "email": email, "password": password})
        r = client.post("/auth/login", json={"username": username, "password": password})
        token = r.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _make
