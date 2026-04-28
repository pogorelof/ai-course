from fastapi.testclient import TestClient
from unittest.mock import patch
from sqlalchemy import select

from app.models import TopicContentGeneration, TopicQuizAttempt, TopicQuizAttemptAnswer


def test_create_outline_creates_15_topics(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"Topic {i+1}" for i in range(15)]):
        r = client.post("/courses/outline", data={"title": "Python", "wishes": "Basics"}, headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["course_id"], int)
    assert len(data["topics"]) == 15


def test_generate_topic_content_first_time_and_idempotent(client: TestClient, auth_headers):
    # Prepare a course with outline
    with patch("app.routers.courses.generate_course_outline", return_value=["Intro", "Types", "Control flow"] + [f"T{i}" for i in range(12)]):
        r = client.post("/courses/outline", data={"title": "Py", "wishes": "All"}, headers=auth_headers())
        assert r.status_code == 200
        course = r.json()
        topic_id = course["topics"][0]["id"]

    # First generation should call AI and persist
    with patch("app.routers.courses.generate_topic_content", return_value="Generated content") as mocked:
        r1 = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert r1.status_code == 200
        assert r1.json()["content"] == "Generated content"
        assert r1.json()["content_ai_model"] == "gpt-5-mini"
        assert mocked.called

    # Second call should return stored content without calling AI
    with patch("app.routers.courses.generate_topic_content", return_value="Should not be used") as mocked2:
        r2 = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert r2.status_code == 200
        assert r2.json()["content"] == "Generated content"
        assert r2.json()["content_ai_model"] == "gpt-5-mini"
        assert not mocked2.called


def test_list_my_courses_and_topics(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"A{i}" for i in range(15)]):
        r = client.post("/courses/outline", data={"title": "Course A", "wishes": "w"}, headers=auth_headers())
        assert r.status_code == 200
        course_id = r.json()["course_id"]

    r_courses = client.get("/courses/mine", headers=auth_headers())
    assert r_courses.status_code == 200
    assert any(c["id"] == course_id for c in r_courses.json())
    created_course = next(c for c in r_courses.json() if c["id"] == course_id)
    assert created_course["ai_provider"] == "openai"
    assert created_course["ai_model"] == "gpt-5-mini"

    r_topics = client.get(f"/courses/{course_id}/topics", headers=auth_headers())
    assert r_topics.status_code == 200
    assert len(r_topics.json()) == 15


def test_delete_course(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"A{i}" for i in range(15)]):
        created = client.post("/courses/outline", data={"title": "Delete me", "wishes": "w"}, headers=auth_headers())
        assert created.status_code == 200
        course_id = created.json()["course_id"]

    deleted = client.delete(f"/courses/{course_id}", headers=auth_headers())
    assert deleted.status_code == 204

    mine = client.get("/courses/mine", headers=auth_headers())
    assert mine.status_code == 200
    assert all(item["id"] != course_id for item in mine.json())


def test_course_settings_get_and_update(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"A{i}" for i in range(15)]):
        created = client.post("/courses/outline", data={"title": "Settings", "wishes": "w"}, headers=auth_headers())
        assert created.status_code == 200
        course_id = created.json()["course_id"]

    current = client.get(f"/courses/{course_id}/settings", headers=auth_headers())
    assert current.status_code == 200
    assert current.json()["ai_provider"] == "openai"
    assert current.json()["ai_model"] == "gpt-5-mini"

    updated = client.patch(
        f"/courses/{course_id}/settings",
        json={"ai_provider": "openai", "ai_model": "gpt-5.4-mini"},
        headers=auth_headers(),
    )
    assert updated.status_code == 200
    assert updated.json()["ai_model"] == "gpt-5.4-mini"


def test_legacy_topic_content_model_defaults_to_gpt4o_mini(client: TestClient, auth_headers, db_session):
    with patch("app.routers.courses.generate_course_outline", return_value=["Intro"] + [f"T{i}" for i in range(14)]):
        created = client.post("/courses/outline", data={"title": "Legacy", "wishes": "w"}, headers=auth_headers())
        assert created.status_code == 200
        course_id = created.json()["course_id"]
        topic_id = created.json()["topics"][0]["id"]

    with patch("app.routers.courses.generate_topic_content", return_value="Legacy content"):
        generated = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert generated.status_code == 200
        assert generated.json()["content_ai_model"] == "gpt-5-mini"

    # Simulate legacy row by deleting metadata
    meta = db_session.scalar(select(TopicContentGeneration).where(TopicContentGeneration.topic_id == topic_id))
    if meta:
        db_session.delete(meta)
        db_session.commit()

    listed = client.get(f"/courses/{course_id}/topics", headers=auth_headers())
    assert listed.status_code == 200
    intro = next(item for item in listed.json() if item["id"] == topic_id)
    assert intro["content_ai_model"] == "gpt-4o-mini"


def test_course_settings_accept_openrouter_models(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"A{i}" for i in range(15)]):
        created = client.post("/courses/outline", data={"title": "OpenRouter", "wishes": "w"}, headers=auth_headers())
        assert created.status_code == 200
        course_id = created.json()["course_id"]

    updated = client.patch(
        f"/courses/{course_id}/settings",
        json={"ai_provider": "openrouter", "ai_model": "deepseek-v4-flash"},
        headers=auth_headers(),
    )
    assert updated.status_code == 200
    assert updated.json()["ai_provider"] == "openrouter"
    assert updated.json()["ai_model"] == "deepseek-v4-flash"


def _create_course_and_topic(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=["Intro"] + [f"T{i}" for i in range(14)]):
        create_course = client.post("/courses/outline", data={"title": "Course", "wishes": "w"}, headers=auth_headers())
        assert create_course.status_code == 200
        topic_id = create_course.json()["topics"][0]["id"]
    with patch("app.routers.courses.generate_topic_content", return_value="Lesson content"):
        generated_topic = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert generated_topic.status_code == 200
    return topic_id


def test_generate_quiz_creates_once_and_reuses(client: TestClient, auth_headers):
    topic_id = _create_course_and_topic(client, auth_headers)
    questions = [
        {
            "question_text": f"Question {i + 1}",
            "options": [f"A{i}", f"B{i}", f"C{i}", f"D{i}"],
            "correct_option_index": 1,
            "advice": f"Advice {i + 1}",
        }
        for i in range(5)
    ]
    with patch("app.routers.courses.generate_topic_quiz", return_value=questions) as mocked:
        first = client.post(f"/courses/topics/{topic_id}/quiz/generate", headers=auth_headers())
        assert first.status_code == 200
        assert len(first.json()["questions"]) == 5
        assert mocked.called

    with patch("app.routers.courses.generate_topic_quiz", return_value=questions) as mocked_second:
        second = client.post(f"/courses/topics/{topic_id}/quiz/generate", headers=auth_headers())
        assert second.status_code == 200
        assert len(second.json()["questions"]) == 5
        assert not mocked_second.called


def test_submit_quiz_returns_score_and_stores_attempt(client: TestClient, auth_headers, db_session):
    topic_id = _create_course_and_topic(client, auth_headers)
    questions = [
        {
            "question_text": f"Question {i + 1}",
            "options": [f"A{i}", f"B{i}", f"C{i}", f"D{i}"],
            "correct_option_index": 0,
            "advice": f"Advice {i + 1}",
        }
        for i in range(5)
    ]
    with patch("app.routers.courses.generate_topic_quiz", return_value=questions):
        generated = client.post(f"/courses/topics/{topic_id}/quiz/generate", headers=auth_headers())
        assert generated.status_code == 200
    quiz_data = generated.json()

    answers = []
    for index, question in enumerate(quiz_data["questions"]):
        answers.append(
            {
                "question_id": question["id"],
                "selected_option_index": 2 if index == 1 else 0,
            }
        )
    submitted = client.post(
        f"/courses/topics/{topic_id}/quiz/submit",
        json={"answers": answers},
        headers=auth_headers(),
    )
    assert submitted.status_code == 200
    body = submitted.json()
    assert body["score_percent"] == 80
    assert body["correct_answers"] == 4
    assert len(body["wrong_advices"]) == 1
    assert len(body["question_results"]) == 5
    assert body["wrong_advices"][0]["advice"] == "Advice 2"

    fetched_quiz = client.get(f"/courses/topics/{topic_id}/quiz", headers=auth_headers())
    assert fetched_quiz.status_code == 200
    assert fetched_quiz.json()["last_result"]["score_percent"] == 80
    assert len(fetched_quiz.json()["last_result"]["question_results"]) == 5

    attempts = db_session.scalars(select(TopicQuizAttempt)).all()
    answers_rows = db_session.scalars(select(TopicQuizAttemptAnswer)).all()
    assert len(attempts) >= 1
    assert len(answers_rows) >= 5
