from fastapi.testclient import TestClient
from unittest.mock import patch
from sqlalchemy import select

from app.models import TopicQuizAttempt, TopicQuizAttemptAnswer


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
        assert mocked.called

    # Second call should return stored content without calling AI
    with patch("app.routers.courses.generate_topic_content", return_value="Should not be used") as mocked2:
        r2 = client.post(f"/courses/topics/{topic_id}/generate", headers=auth_headers())
        assert r2.status_code == 200
        assert r2.json()["content"] == "Generated content"
        assert not mocked2.called


def test_list_my_courses_and_topics(client: TestClient, auth_headers):
    with patch("app.routers.courses.generate_course_outline", return_value=[f"A{i}" for i in range(15)]):
        r = client.post("/courses/outline", data={"title": "Course A", "wishes": "w"}, headers=auth_headers())
        assert r.status_code == 200
        course_id = r.json()["course_id"]

    r_courses = client.get("/courses/mine", headers=auth_headers())
    assert r_courses.status_code == 200
    assert any(c["id"] == course_id for c in r_courses.json())

    r_topics = client.get(f"/courses/{course_id}/topics", headers=auth_headers())
    assert r_topics.status_code == 200
    assert len(r_topics.json()) == 15


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
    with patch("app.routers.courses.generate_quiz_advice", return_value={1: "Review the core definition"}):
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
    assert body["wrong_advices"][0]["advice"] == "Review the core definition"

    fetched_quiz = client.get(f"/courses/topics/{topic_id}/quiz", headers=auth_headers())
    assert fetched_quiz.status_code == 200
    assert fetched_quiz.json()["last_result"]["score_percent"] == 80
    assert len(fetched_quiz.json()["last_result"]["question_results"]) == 5

    attempts = db_session.scalars(select(TopicQuizAttempt)).all()
    answers_rows = db_session.scalars(select(TopicQuizAttemptAnswer)).all()
    assert len(attempts) >= 1
    assert len(answers_rows) >= 5
