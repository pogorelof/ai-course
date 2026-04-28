from fastapi.testclient import TestClient
from unittest.mock import patch
from openai import OpenAIError
from sqlalchemy import select

from app.models import (
    TopicContentGeneration,
    TopicHtmlContent,
    TopicQuizAttempt,
    TopicQuizAttemptAnswer,
)


SAMPLE_HTML_DOCUMENT = (
    "<!doctype html>"
    "<html lang=\"ru\"><head><meta charset=\"utf-8\"><title>Lesson</title></head>"
    "<body><main><h1>Тема</h1>"
    + ("<p>Lorem ipsum dolor sit amet.</p>" * 30)
    + "</main></body></html>"
)


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
    assert all(item["has_html_content"] is False for item in r_topics.json())


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
    assert current.json()["content_format"] == "text"

    updated = client.patch(
        f"/courses/{course_id}/settings",
        json={"ai_provider": "openai", "ai_model": "gpt-5.4-mini", "content_format": "interactive"},
        headers=auth_headers(),
    )
    assert updated.status_code == 200
    assert updated.json()["ai_model"] == "gpt-5.4-mini"
    assert updated.json()["content_format"] == "interactive"


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
        json={
            "ai_provider": "openrouter",
            "ai_model": "meta-llama/llama-4-maverick:nitro",
            "content_format": "text",
        },
        headers=auth_headers(),
    )
    assert updated.status_code == 200
    assert updated.json()["ai_provider"] == "openrouter"
    assert updated.json()["ai_model"] == "meta-llama/llama-4-maverick:nitro"
    assert updated.json()["content_format"] == "text"


def _create_course_and_topic(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=["Intro"] + [f"T{i}" for i in range(14)]):
        create_course = client.post("/courses/outline", data={"title": "Course", "wishes": "w"}, headers=auth_headers())
        assert create_course.status_code == 200
        topic_id = create_course.json()["topics"][0]["id"]
    with patch("app.routers.courses.generate_topic_content", return_value="Lesson content"):
        generated_topic = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert generated_topic.status_code == 200
    return topic_id


def _create_course_topic_without_content(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=["Intro"] + [f"T{i}" for i in range(14)]):
        create_course = client.post("/courses/outline", data={"title": "HTML Course", "wishes": "w"}, headers=auth_headers())
        assert create_course.status_code == 200
        return create_course.json()["course_id"], create_course.json()["topics"][0]["id"]


def test_outline_accepts_interactive_content_format(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"T{i}" for i in range(15)]):
        created = client.post(
            "/courses/outline",
            data={
                "title": "Interactive only",
                "wishes": "w",
                "content_format": "interactive",
            },
            headers=auth_headers(),
        )
    assert created.status_code == 200
    course_id = created.json()["course_id"]

    settings = client.get(f"/courses/{course_id}/settings", headers=auth_headers())
    assert settings.status_code == 200
    assert settings.json()["content_format"] == "interactive"


def test_topic_meta_returns_course_topic_and_format_flags(client: TestClient, auth_headers):
    _, topic_id = _create_course_topic_without_content(client, auth_headers)
    meta = client.get(f"/courses/topics/{topic_id}/meta", headers=auth_headers())
    assert meta.status_code == 200
    body = meta.json()
    assert body["topic_id"] == topic_id
    assert isinstance(body["course_id"], int)
    assert body["course_title"]
    assert body["topic_title"]
    assert body["has_text_content"] is False
    assert body["has_html_content"] is False


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


def test_topic_html_get_returns_404_when_not_generated(client: TestClient, auth_headers):
    _, topic_id = _create_course_topic_without_content(client, auth_headers)
    response = client.get(f"/courses/topics/{topic_id}/content/html", headers=auth_headers())
    assert response.status_code == 404


def test_generate_topic_html_creates_and_replaces(client: TestClient, auth_headers, db_session):
    course_id, topic_id = _create_course_topic_without_content(client, auth_headers)

    first_html = SAMPLE_HTML_DOCUMENT
    with patch("app.routers.courses.generate_topic_html", return_value=first_html) as mocked:
        created = client.post(f"/courses/topics/{topic_id}/content/html", headers=auth_headers())
        assert created.status_code == 200
        body = created.json()
        assert body["topic_id"] == topic_id
        assert body["course_id"] == course_id
        assert body["html"] == first_html
        assert body["ai_model"] == "gpt-5-mini"
        assert mocked.called

    fetched = client.get(f"/courses/topics/{topic_id}/content/html", headers=auth_headers())
    assert fetched.status_code == 200
    assert fetched.json()["html"] == first_html

    rows = db_session.scalars(select(TopicHtmlContent).where(TopicHtmlContent.topic_id == topic_id)).all()
    assert len(rows) == 1

    second_html = SAMPLE_HTML_DOCUMENT.replace("Тема", "Обновленная тема")
    with patch("app.routers.courses.generate_topic_html", return_value=second_html) as mocked_again:
        regenerated = client.post(f"/courses/topics/{topic_id}/content/html", headers=auth_headers())
        assert regenerated.status_code == 200
        assert regenerated.json()["html"] == second_html
        assert mocked_again.called

    rows_after = db_session.scalars(select(TopicHtmlContent).where(TopicHtmlContent.topic_id == topic_id)).all()
    assert len(rows_after) == 1
    assert rows_after[0].html == second_html


def test_generate_topic_html_invalid_response_returns_503(client: TestClient, auth_headers):
    _, topic_id = _create_course_topic_without_content(client, auth_headers)
    with patch(
        "app.routers.courses.generate_topic_html",
        side_effect=OpenAIError("model returned invalid html"),
    ):
        response = client.post(f"/courses/topics/{topic_id}/content/html", headers=auth_headers())
    assert response.status_code == 503


def test_topics_list_marks_has_html_content(client: TestClient, auth_headers):
    course_id, topic_id = _create_course_topic_without_content(client, auth_headers)

    listed_before = client.get(f"/courses/{course_id}/topics", headers=auth_headers())
    assert listed_before.status_code == 200
    target_before = next(item for item in listed_before.json() if item["id"] == topic_id)
    assert target_before["has_html_content"] is False

    with patch("app.routers.courses.generate_topic_html", return_value=SAMPLE_HTML_DOCUMENT):
        created = client.post(f"/courses/topics/{topic_id}/content/html", headers=auth_headers())
        assert created.status_code == 200

    listed_after = client.get(f"/courses/{course_id}/topics", headers=auth_headers())
    assert listed_after.status_code == 200
    target_after = next(item for item in listed_after.json() if item["id"] == topic_id)
    assert target_after["has_html_content"] is True
    others = [item for item in listed_after.json() if item["id"] != topic_id]
    assert all(item["has_html_content"] is False for item in others)
