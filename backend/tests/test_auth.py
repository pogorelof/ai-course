from fastapi.testclient import TestClient


def test_register_and_login_success(client: TestClient):
    reg = client.post("/auth/register", json={
        "username": "alice",
        "email": "alice@example.com",
        "password": "pass1234"
    })
    assert reg.status_code == 201
    assert reg.json()["username"] == "alice"

    login = client.post("/auth/login", json={
        "username": "alice",
        "password": "pass1234"
    })
    assert login.status_code == 200
    body = login.json()
    assert "access_token" in body and body["access_token"]
    assert body["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient):
    client.post("/auth/register", json={
        "username": "bob",
        "email": "bob@example.com",
        "password": "right"
    })
    bad = client.post("/auth/login", json={
        "username": "bob",
        "password": "wrong"
    })
    assert bad.status_code == 401


def test_api_keys_get_and_update(client: TestClient):
    client.post("/auth/register", json={
        "username": "carol",
        "email": "carol@example.com",
        "password": "pass1234"
    })
    login = client.post("/auth/login", json={
        "username": "carol",
        "password": "pass1234"
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    empty = client.get("/auth/api-keys", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["has_openai_key"] is False

    updated = client.patch("/auth/api-keys", json={"openai_api_key": "sk-test-123"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["has_openai_key"] is True

    blocked = client.patch("/auth/api-keys", json={"openrouter_api_key": "or-key"}, headers=headers)
    assert blocked.status_code == 400
