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
