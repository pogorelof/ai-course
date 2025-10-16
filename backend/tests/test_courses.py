from fastapi.testclient import TestClient
from unittest.mock import patch


def test_create_outline_creates_15_topics(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"Topic {i+1}" for i in range(15)]):
        r = client.post("/courses/outline", json={"title": "Python", "wishes": "Basics"}, headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["course_id"], int)
    assert len(data["topics"]) == 15


def test_generate_topic_content_first_time_and_idempotent(client: TestClient, auth_headers):
    # Prepare a course with outline
    with patch("app.routers.courses.generate_course_outline", return_value=["Intro", "Types", "Control flow"] + [f"T{i}" for i in range(12)]):
        r = client.post("/courses/outline", json={"title": "Py", "wishes": "All"}, headers=auth_headers())
        assert r.status_code == 200
        course = r.json()
        topic_id = course["topics"][0]["id"]

    # First generation should call AI and persist
    with patch("app.routers.courses.generate_topic_content", return_value="Generated content") as mocked:
        r1 = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert r1.status_code == 200
        assert r1.json()["content"] == "Generated content"
        assert mocked.called

    # Second call should return stored content without calling AI
    with patch("app.routers.courses.generate_topic_content", return_value="Should not be used") as mocked2:
        r2 = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert r2.status_code == 200
        assert r2.json()["content"] == "Generated content"
        assert not mocked2.called


def test_list_my_courses_and_topics(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"A{i}" for i in range(15)]):
        r = client.post("/courses/outline", json={"title": "Course A", "wishes": "w"}, headers=auth_headers())
        assert r.status_code == 200
        course_id = r.json()["course_id"]

    r_courses = client.get("/courses/mine", headers=auth_headers())
    assert r_courses.status_code == 200
    assert any(c["id"] == course_id for c in r_courses.json())

    r_topics = client.get(f"/courses/{course_id}/topics", headers=auth_headers())
    assert r_topics.status_code == 200
    assert len(r_topics.json()) == 15
