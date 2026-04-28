import asyncio
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timedelta
from typing import AsyncIterator, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from openai import OpenAIError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.security import get_current_user
from ..db import SessionLocal, get_db
from ..models import (
    Course,
    CourseAISettings,
    CourseContentSettings,
    CourseGenerationJob,
    CourseTopic,
    TopicContentGeneration,
    TopicHtmlContent,
    TopicQuiz,
    TopicQuizAttempt,
    TopicQuizAttemptAnswer,
    TopicQuizQuestion,
    TopicQuizQuestionAdvice,
    UserAPIKeys,
)
from ..schemas import (
    CourseCreate,
    CourseGenerationJobOut,
    CourseOut,
    CourseOutlineResponse,
    CourseSettingsOut,
    CourseSettingsUpdateInput,
    QuizQuestionOut,
    QuizResultOut,
    QuizSubmitInput,
    QuizWrongAdviceOut,
    TopicContentResponse,
    TopicHtmlContentOut,
    TopicMetaOut,
    TopicOut,
    TopicQuizOut,
    TopicQuizProgressOut,
)
from ..services.ai import (
    extract_text_from_pdf,
    generate_course_outline,
    generate_topic_content,
    generate_topic_html,
    generate_topic_quiz,
    stream_topic_content,
    stream_topic_html,
    validate_html_document,
)


router = APIRouter()
logger = logging.getLogger(__name__)
PASSING_SCORE_PERCENT = 60
ACTIVE_AI_PROVIDERS = {"openai", "openrouter"}
LEGACY_DEFAULT_CONTENT_MODEL = "gpt-4o-mini"
LEGACY_DEFAULT_COURSE_MODEL = "gpt-4o-mini"
ACTIVE_JOB_STATUSES = {"pending", "running"}


def _assert_active_ai_provider(ai_provider: str) -> None:
    if ai_provider not in ACTIVE_AI_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported AI provider: {ai_provider}",
        )


def _get_course_ai_settings(course: Course, db: Session) -> Optional[CourseAISettings]:
    return db.scalar(select(CourseAISettings).where(CourseAISettings.course_id == course.id))


def _resolve_course_ai_settings(course: Course, db: Session) -> tuple[str, str]:
    settings = _get_course_ai_settings(course, db)
    if settings:
        return settings.ai_provider, settings.ai_model
    return "openai", "gpt-5-mini"


def _resolve_course_reasoning_effort(course: Course, db: Session) -> str:
    settings = _get_course_ai_settings(course, db)
    if settings and settings.reasoning_effort:
        return settings.reasoning_effort
    return "minimal"


def _get_course_content_settings(course: Course, db: Session) -> Optional[CourseContentSettings]:
    return db.scalar(select(CourseContentSettings).where(CourseContentSettings.course_id == course.id))


def _resolve_course_content_format(course: Course, db: Session) -> str:
    settings = _get_course_content_settings(course, db)
    if settings:
        return settings.content_format
    return "text"


def _resolve_user_api_key(user_id: int, provider: str, db: Session) -> Optional[str]:
    settings = db.scalar(select(UserAPIKeys).where(UserAPIKeys.user_id == user_id))
    if not settings:
        return None
    if provider == "openrouter":
        return settings.openrouter_api_key
    return settings.openai_api_key


def _require_user_api_key(user_id: int, provider: str, db: Session) -> str:
    api_key = _resolve_user_api_key(user_id, provider, db)
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=400,
            detail=f"{provider} API key is not set. Add it in the API keys popup near your profile.",
        )
    return api_key


def _upsert_course_ai_settings(
    course: Course,
    db: Session,
    ai_provider: str,
    ai_model: str,
    reasoning_effort: str = "minimal",
) -> CourseAISettings:
    settings = db.scalar(select(CourseAISettings).where(CourseAISettings.course_id == course.id))
    if not settings:
        settings = CourseAISettings(
            course_id=course.id,
            ai_provider=ai_provider,
            ai_model=ai_model,
            reasoning_effort=reasoning_effort,
        )
        db.add(settings)
        db.flush()
        return settings
    settings.ai_provider = ai_provider
    settings.ai_model = ai_model
    settings.reasoning_effort = reasoning_effort
    db.add(settings)
    return settings


def _upsert_course_content_settings(course: Course, db: Session, content_format: str) -> CourseContentSettings:
    settings = db.scalar(select(CourseContentSettings).where(CourseContentSettings.course_id == course.id))
    if not settings:
        settings = CourseContentSettings(course_id=course.id, content_format=content_format)
        db.add(settings)
        db.flush()
        return settings
    settings.content_format = content_format
    db.add(settings)
    return settings


def _resolve_topic_content_model(topic: CourseTopic, db: Session) -> Optional[str]:
    meta = db.scalar(select(TopicContentGeneration).where(TopicContentGeneration.topic_id == topic.id))
    if meta:
        return meta.ai_model
    if topic.content and topic.content.strip():
        return LEGACY_DEFAULT_CONTENT_MODEL
    return None


def _upsert_topic_content_generation(topic_id: int, ai_provider: str, ai_model: str, db: Session) -> None:
    meta = db.scalar(select(TopicContentGeneration).where(TopicContentGeneration.topic_id == topic_id))
    if not meta:
        meta = TopicContentGeneration(topic_id=topic_id, ai_provider=ai_provider, ai_model=ai_model)
    else:
        meta.ai_provider = ai_provider
        meta.ai_model = ai_model
    db.add(meta)


def _upsert_topic_html_content(topic_id: int, html: str, ai_provider: str, ai_model: str, db: Session) -> TopicHtmlContent:
    record = db.scalar(select(TopicHtmlContent).where(TopicHtmlContent.topic_id == topic_id))
    if not record:
        record = TopicHtmlContent(
            topic_id=topic_id,
            html=html,
            ai_provider=ai_provider,
            ai_model=ai_model,
        )
    else:
        record.html = html
        record.ai_provider = ai_provider
        record.ai_model = ai_model
        record.generated_at = datetime.utcnow()
    db.add(record)
    return record


@router.post("/outline", response_model=CourseOutlineResponse)
async def create_outline(
    title: str = Form(...),
    wishes: str = Form(...),
    ai_provider: str = Form("openai"),
    ai_model: str = Form("gpt-5-mini"),
    content_format: str = Form("text"),
    reasoning_effort: str = Form("minimal"),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    validated_payload = CourseCreate(
        title=title,
        wishes=wishes,
        ai_provider=ai_provider,
        ai_model=ai_model,
        content_format=content_format,
        reasoning_effort=reasoning_effort,
    )
    _assert_active_ai_provider(validated_payload.ai_provider)
    user_api_key = _require_user_api_key(current_user.id, validated_payload.ai_provider, db)

    pdf_text = None
    pdf_path = None

    if file:
        if file.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")

        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        upload_dir = os.path.join(backend_root, "uploads")
        os.makedirs(upload_dir, exist_ok=True)

        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(upload_dir, unique_filename)

        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

        pdf_path = file_path
        pdf_text = extract_text_from_pdf(file_path)

    try:
        titles = await generate_course_outline(
            validated_payload.title,
            validated_payload.wishes,
            model=validated_payload.ai_model,
            provider=validated_payload.ai_provider,
            pdf_text=pdf_text,
            api_key=user_api_key,
            reasoning_effort=validated_payload.reasoning_effort,
        )
    except OpenAIError as e:
        logger.exception(
            "AI outline generation failed: user_id=%s provider=%s model=%s title=%r error=%s",
            current_user.id,
            validated_payload.ai_provider,
            validated_payload.ai_model,
            validated_payload.title,
            str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    if len(titles) != 15:
        raise HTTPException(status_code=500, detail="Failed to generate 15 topics")

    course = Course(
        title=validated_payload.title,
        wishes=validated_payload.wishes,
        owner_id=current_user.id,
        pdf_path=pdf_path,
    )
    db.add(course)
    db.flush()
    _upsert_course_ai_settings(
        course,
        db,
        validated_payload.ai_provider,
        validated_payload.ai_model,
        validated_payload.reasoning_effort,
    )
    _upsert_course_content_settings(course, db, validated_payload.content_format)

    topics: list[CourseTopic] = []
    for t in titles:
        topics.append(CourseTopic(course_id=course.id, title=t, content=None))
    db.add_all(topics)
    db.commit()
    db.refresh(course)

    return CourseOutlineResponse(
        course_id=course.id,
        topics=[TopicOut(id=topic.id, title=topic.title, content=topic.content) for topic in course.topics],
    )


@router.post("/topics/{topic_id}/generate", response_model=TopicContentResponse)
async def generate_content(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    topic = db.scalar(select(CourseTopic).where(CourseTopic.id == topic_id))
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    course = db.scalar(select(Course).where(Course.id == topic.course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)

    if topic.content and topic.content.strip():
        model_name = _resolve_topic_content_model(topic, db) or LEGACY_DEFAULT_CONTENT_MODEL
        return TopicContentResponse(
            course_title=course.title,
            course_id=course.id,
            topic_id=topic.id,
            content=topic.content,
            content_ai_model=model_name,
        )

    pdf_text = None
    if course.pdf_path and os.path.exists(course.pdf_path):
        pdf_text = extract_text_from_pdf(course.pdf_path)
    api_key = _require_user_api_key(current_user.id, ai_provider, db)
    reasoning_effort = _resolve_course_reasoning_effort(course, db)

    try:
        content = await generate_topic_content(
            course.title,
            course.wishes,
            topic.title,
            model=ai_model,
            provider=ai_provider,
            pdf_text=pdf_text,
            api_key=api_key,
            reasoning_effort=reasoning_effort,
        )
    except OpenAIError as e:
        logger.exception(
            "AI topic content generation failed: user_id=%s course_id=%s topic_id=%s provider=%s model=%s error=%s",
            current_user.id,
            course.id,
            topic.id,
            ai_provider,
            ai_model,
            str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    topic.content = content
    db.add(topic)
    _upsert_topic_content_generation(topic.id, ai_provider, ai_model, db)
    db.commit()
    db.refresh(topic)

    return TopicContentResponse(
        course_title=course.title,
        course_id=course.id,
        topic_id=topic.id,
        content=topic.content or "",
        content_ai_model=ai_model,
    )


def _sse_pack(event: dict) -> bytes:
    """Serialize an event as a single NDJSON line.

    We deliberately use newline-delimited JSON instead of the SSE wire format
    so the client can use a plain ``fetch`` with auth headers (EventSource
    cannot send custom headers) and parse each line as JSON.
    """
    return (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")


@router.post("/topics/{topic_id}/generate/stream")
async def generate_content_stream(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    topic = db.scalar(select(CourseTopic).where(CourseTopic.id == topic_id))
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    course = db.scalar(select(Course).where(Course.id == topic.course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)
    api_key = _require_user_api_key(current_user.id, ai_provider, db)

    cached_content = topic.content if (topic.content and topic.content.strip()) else None
    cached_model = _resolve_topic_content_model(topic, db) if cached_content else None

    pdf_text = None
    if course.pdf_path and os.path.exists(course.pdf_path):
        pdf_text = extract_text_from_pdf(course.pdf_path)
    reasoning_effort = _resolve_course_reasoning_effort(course, db)

    course_title = course.title
    course_wishes = course.wishes
    topic_title = topic.title
    topic_id_value = topic.id
    course_id_value = course.id

    async def event_stream() -> AsyncIterator[bytes]:
        yield _sse_pack(
            {
                "type": "started",
                "topic_id": topic_id_value,
                "course_id": course_id_value,
                "ai_model": ai_model,
                "ai_provider": ai_provider,
                "course_title": course_title,
            }
        )
        if cached_content is not None:
            yield _sse_pack(
                {
                    "type": "cached",
                    "content": cached_content,
                    "ai_model": cached_model or LEGACY_DEFAULT_CONTENT_MODEL,
                }
            )
            yield _sse_pack({"type": "done", "from_cache": True})
            return

        accumulator: list[str] = []
        try:
            async for piece in stream_topic_content(
                course_title,
                course_wishes,
                topic_title,
                model=ai_model,
                provider=ai_provider,
                pdf_text=pdf_text,
                api_key=api_key,
                reasoning_effort=reasoning_effort,
            ):
                accumulator.append(piece)
                yield _sse_pack({"type": "chunk", "delta": piece})
        except OpenAIError as exc:
            logger.exception("Streaming content failed: %s", exc)
            yield _sse_pack({"type": "error", "detail": str(exc)})
            return
        except Exception as exc:
            logger.exception("Streaming content failed unexpectedly: %s", exc)
            yield _sse_pack({"type": "error", "detail": "internal error"})
            return

        full_text = "".join(accumulator).strip()
        if not full_text:
            yield _sse_pack({"type": "error", "detail": "empty content from model"})
            return

        try:
            persist_session = SessionLocal()
            try:
                stored_topic = persist_session.scalar(
                    select(CourseTopic).where(CourseTopic.id == topic_id_value)
                )
                if stored_topic and (not stored_topic.content or not stored_topic.content.strip()):
                    stored_topic.content = full_text
                    persist_session.add(stored_topic)
                    _upsert_topic_content_generation(
                        stored_topic.id, ai_provider, ai_model, persist_session
                    )
                    persist_session.commit()
            finally:
                persist_session.close()
        except Exception as exc:
            logger.exception("Failed to persist streamed content: %s", exc)
            yield _sse_pack({"type": "error", "detail": "failed to persist content"})
            return

        yield _sse_pack(
            {
                "type": "done",
                "from_cache": False,
                "content": full_text,
                "ai_model": ai_model,
            }
        )

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


def _get_topic_and_course_or_404(topic_id: int, db: Session, user_id: int) -> tuple[CourseTopic, Course]:
    topic = db.scalar(select(CourseTopic).where(CourseTopic.id == topic_id))
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    course = db.scalar(select(Course).where(Course.id == topic.course_id))
    if not course or course.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return topic, course


def _serialize_quiz(quiz: TopicQuiz, db: Session, user_id: int) -> TopicQuizOut:
    questions = db.scalars(
        select(TopicQuizQuestion)
        .where(TopicQuizQuestion.quiz_id == quiz.id)
        .order_by(TopicQuizQuestion.position.asc())
    ).all()
    attempts = db.scalars(
        select(TopicQuizAttempt)
        .where(TopicQuizAttempt.quiz_id == quiz.id, TopicQuizAttempt.user_id == user_id)
        .order_by(TopicQuizAttempt.created_at.desc())
    ).all()
    last_attempt = attempts[0] if attempts else None
    last_result = None
    if last_attempt:
        attempt_answers = db.scalars(
            select(TopicQuizAttemptAnswer).where(TopicQuizAttemptAnswer.attempt_id == last_attempt.id)
        ).all()
        answer_map = {item.question_id: item for item in attempt_answers}
        question_results: list[QuizWrongAdviceOut] = []
        wrong_advices: list[QuizWrongAdviceOut] = []
        correct_answers = 0
        for question in questions:
            answer = answer_map.get(question.id)
            if not answer:
                continue
            if answer.is_correct:
                correct_answers += 1
            entry = QuizWrongAdviceOut(
                question_id=question.id,
                question_text=question.question_text,
                selected_option_index=answer.selected_option_index,
                correct_option_index=question.correct_option_index,
                advice=answer.advice or "",
            )
            question_results.append(entry)
            if not answer.is_correct:
                wrong_advices.append(entry)
        last_result = QuizResultOut(
            score_percent=last_attempt.score_percent,
            total_questions=len(questions),
            correct_answers=correct_answers,
            wrong_advices=wrong_advices,
            question_results=question_results,
        )
    return TopicQuizOut(
        topic_id=quiz.topic_id,
        questions=[
            QuizQuestionOut(
                id=q.id,
                question_text=q.question_text,
                options=[q.option_a, q.option_b, q.option_c, q.option_d],
            )
            for q in questions
        ],
        progress=TopicQuizProgressOut(
            has_attempts=last_attempt is not None,
            last_score_percent=last_attempt.score_percent if last_attempt else None,
            attempts_count=len(attempts),
        ),
        last_result=last_result,
    )


@router.post("/topics/{topic_id}/quiz/generate", response_model=TopicQuizOut)
async def generate_topic_quiz_endpoint(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    topic, course = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)
    if not topic.content or not topic.content.strip():
        raise HTTPException(status_code=400, detail="Generate topic content before quiz")

    existing_quiz = db.scalar(select(TopicQuiz).where(TopicQuiz.topic_id == topic.id))
    if existing_quiz:
        return _serialize_quiz(existing_quiz, db, current_user.id)
    api_key = _require_user_api_key(current_user.id, ai_provider, db)

    try:
        generated_questions = await generate_topic_quiz(
            course_title=course.title,
            topic_title=topic.title,
            topic_content=topic.content,
            model=ai_model,
            provider=ai_provider,
            api_key=api_key,
            reasoning_effort=_resolve_course_reasoning_effort(course, db),
        )
    except OpenAIError as e:
        logger.exception(
            "AI quiz generation failed: user_id=%s course_id=%s topic_id=%s provider=%s model=%s error=%s",
            current_user.id,
            course.id,
            topic.id,
            ai_provider,
            ai_model,
            str(e),
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    quiz = TopicQuiz(topic_id=topic.id)
    db.add(quiz)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing_quiz = db.scalar(select(TopicQuiz).where(TopicQuiz.topic_id == topic.id))
        if existing_quiz:
            return _serialize_quiz(existing_quiz, db, current_user.id)
        raise HTTPException(status_code=409, detail="Quiz is being generated. Please retry.")

    records: list[TopicQuizQuestion] = []
    for idx, question in enumerate(generated_questions, start=1):
        options = question["options"]
        records.append(
            TopicQuizQuestion(
                quiz_id=quiz.id,
                position=idx,
                question_text=question["question_text"],
                option_a=options[0],
                option_b=options[1],
                option_c=options[2],
                option_d=options[3],
                correct_option_index=question["correct_option_index"],
            )
        )
    db.add_all(records)
    db.flush()
    advice_rows: list[TopicQuizQuestionAdvice] = []
    for idx, question_record in enumerate(records):
        advice_rows.append(
            TopicQuizQuestionAdvice(
                question_id=question_record.id,
                advice=generated_questions[idx]["advice"],
            )
        )
    db.add_all(advice_rows)
    db.commit()
    db.refresh(quiz)
    return _serialize_quiz(quiz, db, current_user.id)


@router.get("/topics/{topic_id}/quiz", response_model=TopicQuizOut)
def get_topic_quiz(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    topic, _ = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    quiz = db.scalar(select(TopicQuiz).where(TopicQuiz.topic_id == topic.id))
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return _serialize_quiz(quiz, db, current_user.id)


@router.post("/topics/{topic_id}/quiz/submit", response_model=QuizResultOut)
def submit_topic_quiz(
    topic_id: int,
    payload: QuizSubmitInput,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    topic, _ = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    course = db.scalar(select(Course).where(Course.id == topic.course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)
    quiz = db.scalar(select(TopicQuiz).where(TopicQuiz.topic_id == topic.id))
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = db.scalars(
        select(TopicQuizQuestion)
        .where(TopicQuizQuestion.quiz_id == quiz.id)
        .order_by(TopicQuizQuestion.position.asc())
    ).all()
    if not questions:
        raise HTTPException(status_code=400, detail="Quiz has no questions")

    submitted_by_question_id = {a.question_id: a.selected_option_index for a in payload.answers}
    expected_ids = {q.id for q in questions}
    if set(submitted_by_question_id.keys()) != expected_ids:
        raise HTTPException(status_code=400, detail="Answers must include every quiz question exactly once")

    question_advices = db.scalars(
        select(TopicQuizQuestionAdvice).where(
            TopicQuizQuestionAdvice.question_id.in_([q.id for q in questions])
        )
    ).all()
    advice_by_question_id = {item.question_id: item.advice for item in question_advices}

    evaluation_rows: list[dict] = []
    correct_count = 0
    for q in questions:
        selected_option_index = submitted_by_question_id[q.id]
        is_correct = selected_option_index == q.correct_option_index
        if is_correct:
            correct_count += 1
        evaluation_rows.append(
            {
                "question": q,
                "selected_option_index": selected_option_index,
                "is_correct": is_correct,
            }
        )

    score_percent = int(round((correct_count / len(questions)) * 100))
    attempt = TopicQuizAttempt(quiz_id=quiz.id, user_id=current_user.id, score_percent=score_percent)
    db.add(attempt)
    db.flush()

    answer_rows: list[TopicQuizAttemptAnswer] = []
    wrong_advices: list[QuizWrongAdviceOut] = []
    question_results: list[QuizWrongAdviceOut] = []
    for row in evaluation_rows:
        question: TopicQuizQuestion = row["question"]
        advice = None
        if not row["is_correct"]:
            advice = advice_by_question_id.get(
                question.id,
                "Повтори раздел главы, связанный с этим вопросом, и попробуй выделить ключевое определение своими словами.",
            )
            wrong_advices.append(
                QuizWrongAdviceOut(
                    question_id=question.id,
                    question_text=question.question_text,
                    selected_option_index=row["selected_option_index"],
                    correct_option_index=question.correct_option_index,
                    advice=advice,
                )
            )
        question_results.append(
            QuizWrongAdviceOut(
                question_id=question.id,
                question_text=question.question_text,
                selected_option_index=row["selected_option_index"],
                correct_option_index=question.correct_option_index,
                advice=advice or "",
            )
        )
        answer_rows.append(
            TopicQuizAttemptAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected_option_index=row["selected_option_index"],
                is_correct=row["is_correct"],
                advice=advice,
            )
        )
    db.add_all(answer_rows)
    db.commit()

    return QuizResultOut(
        score_percent=score_percent,
        total_questions=len(questions),
        correct_answers=correct_count,
        wrong_advices=wrong_advices,
        question_results=question_results,
    )


@router.get("/topics/{topic_id}/meta", response_model=TopicMetaOut)
def get_topic_meta(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    topic, course = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    has_html = db.scalar(select(TopicHtmlContent.id).where(TopicHtmlContent.topic_id == topic.id)) is not None
    return TopicMetaOut(
        topic_id=topic.id,
        course_id=course.id,
        course_title=course.title,
        topic_title=topic.title,
        content_ai_model=_resolve_topic_content_model(topic, db),
        has_text_content=bool(topic.content and topic.content.strip()),
        has_html_content=has_html,
    )


@router.get("/topics/{topic_id}/content/html", response_model=TopicHtmlContentOut)
def get_topic_html(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    topic, course = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    record = db.scalar(select(TopicHtmlContent).where(TopicHtmlContent.topic_id == topic.id))
    if not record:
        raise HTTPException(status_code=404, detail="Interactive lesson is not generated yet")
    return TopicHtmlContentOut(
        topic_id=topic.id,
        course_id=course.id,
        course_title=course.title,
        html=record.html,
        ai_provider=record.ai_provider,
        ai_model=record.ai_model,
        generated_at=record.generated_at,
    )


@router.post("/topics/{topic_id}/content/html", response_model=TopicHtmlContentOut)
async def generate_topic_html_endpoint(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    topic, course = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)
    api_key = _require_user_api_key(current_user.id, ai_provider, db)

    pdf_text = None
    if course.pdf_path and os.path.exists(course.pdf_path):
        pdf_text = extract_text_from_pdf(course.pdf_path)
    reasoning_effort = _resolve_course_reasoning_effort(course, db)

    try:
        html = await generate_topic_html(
            course_title=course.title,
            wishes=course.wishes,
            topic_title=topic.title,
            model=ai_model,
            provider=ai_provider,
            pdf_text=pdf_text,
            api_key=api_key,
            reasoning_effort=reasoning_effort,
        )
    except OpenAIError as e:
        logger.exception(
            "AI topic html generation failed: user_id=%s course_id=%s topic_id=%s provider=%s model=%s error=%s",
            current_user.id,
            course.id,
            topic.id,
            ai_provider,
            ai_model,
            str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )

    record = _upsert_topic_html_content(topic.id, html, ai_provider, ai_model, db)
    db.commit()
    db.refresh(record)

    return TopicHtmlContentOut(
        topic_id=topic.id,
        course_id=course.id,
        course_title=course.title,
        html=record.html,
        ai_provider=record.ai_provider,
        ai_model=record.ai_model,
        generated_at=record.generated_at,
    )


@router.post("/topics/{topic_id}/content/html/stream")
async def generate_topic_html_stream(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    topic, course = _get_topic_and_course_or_404(topic_id, db, current_user.id)
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)
    api_key = _require_user_api_key(current_user.id, ai_provider, db)

    pdf_text = None
    if course.pdf_path and os.path.exists(course.pdf_path):
        pdf_text = extract_text_from_pdf(course.pdf_path)
    reasoning_effort = _resolve_course_reasoning_effort(course, db)

    course_title = course.title
    course_wishes = course.wishes
    topic_title = topic.title
    topic_id_value = topic.id
    course_id_value = course.id

    async def event_stream() -> AsyncIterator[bytes]:
        yield _sse_pack(
            {
                "type": "started",
                "topic_id": topic_id_value,
                "course_id": course_id_value,
                "ai_model": ai_model,
                "ai_provider": ai_provider,
                "course_title": course_title,
            }
        )
        accumulator: list[str] = []
        try:
            async for piece in stream_topic_html(
                course_title,
                course_wishes,
                topic_title,
                model=ai_model,
                provider=ai_provider,
                pdf_text=pdf_text,
                api_key=api_key,
                reasoning_effort=reasoning_effort,
            ):
                accumulator.append(piece)
                yield _sse_pack({"type": "chunk", "delta": piece})
        except OpenAIError as exc:
            logger.exception("Streaming HTML failed: %s", exc)
            yield _sse_pack({"type": "error", "detail": str(exc)})
            return
        except Exception as exc:
            logger.exception("Streaming HTML failed unexpectedly: %s", exc)
            yield _sse_pack({"type": "error", "detail": "internal error"})
            return

        full_text = "".join(accumulator)
        try:
            html = validate_html_document(full_text, "generate_topic_html_stream")
        except OpenAIError as exc:
            yield _sse_pack({"type": "error", "detail": str(exc)})
            return

        try:
            persist_session = SessionLocal()
            try:
                record = _upsert_topic_html_content(topic_id_value, html, ai_provider, ai_model, persist_session)
                persist_session.commit()
                persist_session.refresh(record)
                generated_at = record.generated_at.isoformat() if record.generated_at else None
            finally:
                persist_session.close()
        except Exception as exc:
            logger.exception("Failed to persist streamed HTML: %s", exc)
            yield _sse_pack({"type": "error", "detail": "failed to persist html"})
            return

        yield _sse_pack(
            {
                "type": "done",
                "html": html,
                "ai_provider": ai_provider,
                "ai_model": ai_model,
                "generated_at": generated_at,
            }
        )

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@router.get("/mine", response_model=List[CourseOut])
def list_my_courses(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    courses = db.scalars(select(Course).where(Course.owner_id == current_user.id)).all()
    result: list[CourseOut] = []
    for course in courses:
        ai_settings = _get_course_ai_settings(course, db)
        content_format = _resolve_course_content_format(course, db)
        if ai_settings:
            ai_provider, ai_model = ai_settings.ai_provider, ai_settings.ai_model
        else:
            ai_provider, ai_model = "openai", LEGACY_DEFAULT_COURSE_MODEL
        has_book = bool(course.pdf_path and os.path.exists(course.pdf_path))
        book_name = os.path.basename(course.pdf_path) if has_book and course.pdf_path else None
        book_url = f"/courses/{course.id}/book" if has_book else None
        wishes = course.wishes.strip() if course.wishes and course.wishes.strip() else None
        result.append(
            CourseOut(
                id=course.id,
                title=course.title,
                wishes=wishes,
                ai_provider=ai_provider,
                ai_model=ai_model,
                content_format=content_format,
                has_book=has_book,
                book_name=book_name,
                book_url=book_url,
            )
        )
    return result


@router.get("/{course_id}/settings", response_model=CourseSettingsOut)
def get_course_settings(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    content_format = _resolve_course_content_format(course, db)
    reasoning_effort = _resolve_course_reasoning_effort(course, db)
    return CourseSettingsOut(
        ai_provider=ai_provider,
        ai_model=ai_model,
        content_format=content_format,
        reasoning_effort=reasoning_effort,
    )


@router.patch("/{course_id}/settings", response_model=CourseSettingsOut)
def update_course_settings(
    course_id: int,
    payload: CourseSettingsUpdateInput,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    _assert_active_ai_provider(payload.ai_provider)
    course_ai_settings = _upsert_course_ai_settings(
        course,
        db,
        payload.ai_provider,
        payload.ai_model,
        payload.reasoning_effort,
    )
    course_content_settings = _upsert_course_content_settings(course, db, payload.content_format)
    db.commit()
    db.refresh(course_ai_settings)
    db.refresh(course_content_settings)
    return CourseSettingsOut(
        ai_provider=course_ai_settings.ai_provider,
        ai_model=course_ai_settings.ai_model,
        content_format=course_content_settings.content_format,
        reasoning_effort=course_ai_settings.reasoning_effort,
    )


@router.get("/{course_id}/book")
def download_course_book(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not course.pdf_path or not os.path.exists(course.pdf_path):
        raise HTTPException(status_code=404, detail="Book not found")
    return FileResponse(course.pdf_path, media_type="application/pdf", filename=os.path.basename(course.pdf_path))


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    pdf_path = course.pdf_path
    db.delete(course)
    db.commit()

    if pdf_path and os.path.exists(pdf_path):
        try:
            os.remove(pdf_path)
        except OSError:
            pass
    return None


@router.get("/{course_id}/topics", response_model=List[TopicOut])
def list_course_topics(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    topics = db.scalars(select(CourseTopic).where(CourseTopic.course_id == course_id)).all()

    topic_ids = [topic.id for topic in topics]
    html_topic_ids: set[int] = set()
    if topic_ids:
        html_topic_ids = set(
            db.scalars(
                select(TopicHtmlContent.topic_id).where(TopicHtmlContent.topic_id.in_(topic_ids))
            ).all()
        )

    result: list[TopicOut] = []
    for topic in topics:
        quiz = db.scalar(select(TopicQuiz).where(TopicQuiz.topic_id == topic.id))
        last_score = None
        has_attempts = False
        has_passed_quiz = False
        if quiz:
            latest_attempt = db.scalar(
                select(TopicQuizAttempt)
                .where(TopicQuizAttempt.quiz_id == quiz.id, TopicQuizAttempt.user_id == current_user.id)
                .order_by(TopicQuizAttempt.created_at.desc())
            )
            if latest_attempt:
                has_attempts = True
                last_score = latest_attempt.score_percent
                has_passed_quiz = latest_attempt.score_percent > PASSING_SCORE_PERCENT
        result.append(
            TopicOut(
                id=topic.id,
                title=topic.title,
                content=topic.content,
                content_ai_model=_resolve_topic_content_model(topic, db),
                last_score_percent=last_score,
                has_attempts=has_attempts,
                has_passed_quiz=has_passed_quiz,
                has_html_content=topic.id in html_topic_ids,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Background queue: generate every topic of a course in the background.
# Multiple courses can run in parallel; only one active job per course.
# ---------------------------------------------------------------------------


def _serialize_job(job: CourseGenerationJob, course_title: Optional[str]) -> CourseGenerationJobOut:
    return CourseGenerationJobOut(
        id=job.id,
        course_id=job.course_id,
        course_title=course_title or "",
        status=job.status,
        total=job.total,
        completed=job.completed,
        current_topic_id=job.current_topic_id,
        current_topic_title=job.current_topic_title,
        content_format=job.content_format,
        ai_provider=job.ai_provider,
        ai_model=job.ai_model,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _job_is_active(job: CourseGenerationJob) -> bool:
    return job.status in ACTIVE_JOB_STATUSES


async def _run_course_queue(job_id: int) -> None:
    """Background coroutine that generates every missing artifact for a course."""

    def _open_session() -> Session:
        return SessionLocal()

    db = _open_session()
    try:
        job = db.scalar(select(CourseGenerationJob).where(CourseGenerationJob.id == job_id))
        if not job:
            return
        course = db.scalar(select(Course).where(Course.id == job.course_id))
        if not course:
            job.status = "error"
            job.error_message = "Course not found"
            db.add(job)
            db.commit()
            return

        api_key = _resolve_user_api_key(job.user_id, job.ai_provider, db)
        if not api_key or not api_key.strip():
            job.status = "error"
            job.error_message = f"{job.ai_provider} API key is not set"
            db.add(job)
            db.commit()
            return

        topics = db.scalars(
            select(CourseTopic).where(CourseTopic.course_id == course.id).order_by(CourseTopic.id.asc())
        ).all()

        pdf_text = None
        if course.pdf_path and os.path.exists(course.pdf_path):
            pdf_text = extract_text_from_pdf(course.pdf_path)

        course_title = course.title
        course_wishes = course.wishes
        ai_provider = job.ai_provider
        ai_model = job.ai_model
        content_format = job.content_format
        reasoning_effort = _resolve_course_reasoning_effort(course, db)

        job.status = "running"
        job.total = len(topics)
        job.completed = 0
        job.current_topic_id = None
        job.current_topic_title = None
        job.error_message = None
        job.updated_at = datetime.utcnow()
        db.add(job)
        db.commit()

        for topic in topics:
            db.refresh(job)
            if job.status == "cancelled":
                return

            job.current_topic_id = topic.id
            job.current_topic_title = topic.title
            job.updated_at = datetime.utcnow()
            db.add(job)
            db.commit()

            try:
                if content_format == "interactive":
                    has_html = db.scalar(
                        select(TopicHtmlContent.id).where(TopicHtmlContent.topic_id == topic.id)
                    )
                    if not has_html:
                        html = await generate_topic_html(
                            course_title=course_title,
                            wishes=course_wishes,
                            topic_title=topic.title,
                            model=ai_model,
                            provider=ai_provider,
                            pdf_text=pdf_text,
                            api_key=api_key,
                            reasoning_effort=reasoning_effort,
                        )
                        _upsert_topic_html_content(topic.id, html, ai_provider, ai_model, db)
                        db.commit()
                else:
                    if not topic.content or not topic.content.strip():
                        content = await generate_topic_content(
                            course_title,
                            course_wishes,
                            topic.title,
                            model=ai_model,
                            provider=ai_provider,
                            pdf_text=pdf_text,
                            api_key=api_key,
                            reasoning_effort=reasoning_effort,
                        )
                        topic.content = content
                        db.add(topic)
                        _upsert_topic_content_generation(topic.id, ai_provider, ai_model, db)
                        db.commit()
            except OpenAIError as exc:
                logger.exception("Queue topic generation failed: %s", exc)
                job.status = "error"
                job.error_message = str(exc)
                job.updated_at = datetime.utcnow()
                db.add(job)
                db.commit()
                return
            except Exception as exc:
                logger.exception("Queue topic generation crashed: %s", exc)
                job.status = "error"
                job.error_message = f"internal error: {exc}"
                job.updated_at = datetime.utcnow()
                db.add(job)
                db.commit()
                return

            job.completed += 1
            job.updated_at = datetime.utcnow()
            db.add(job)
            db.commit()

        job.status = "done"
        job.current_topic_id = None
        job.current_topic_title = None
        job.updated_at = datetime.utcnow()
        db.add(job)
        db.commit()
    finally:
        db.close()


def _spawn_queue_job(job_id: int) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.create_task(_run_course_queue(job_id))


@router.post("/{course_id}/queue", response_model=CourseGenerationJobOut)
async def enqueue_course_generation(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)
    content_format = _resolve_course_content_format(course, db)
    _require_user_api_key(current_user.id, ai_provider, db)

    existing = db.scalar(
        select(CourseGenerationJob)
        .where(
            CourseGenerationJob.course_id == course.id,
            CourseGenerationJob.user_id == current_user.id,
            CourseGenerationJob.status.in_(list(ACTIVE_JOB_STATUSES)),
        )
        .order_by(CourseGenerationJob.created_at.desc())
    )
    if existing:
        return _serialize_job(existing, course.title)

    topic_count = db.scalar(
        select(CourseTopic).where(CourseTopic.course_id == course.id).order_by(CourseTopic.id.asc()).limit(1)
    )
    if topic_count is None:
        raise HTTPException(status_code=400, detail="Course has no topics yet")

    total_topics = len(
        db.scalars(select(CourseTopic.id).where(CourseTopic.course_id == course.id)).all()
    )

    job = CourseGenerationJob(
        course_id=course.id,
        user_id=current_user.id,
        status="pending",
        total=total_topics,
        completed=0,
        content_format=content_format,
        ai_provider=ai_provider,
        ai_model=ai_model,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    _spawn_queue_job(job.id)
    return _serialize_job(job, course.title)


@router.get("/queues", response_model=List[CourseGenerationJobOut])
def list_my_queues(
    include_finished: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(CourseGenerationJob).where(CourseGenerationJob.user_id == current_user.id)
    if not include_finished:
        cutoff = datetime.utcnow() - timedelta(minutes=5)
        stmt = stmt.where(
            (CourseGenerationJob.status.in_(list(ACTIVE_JOB_STATUSES)))
            | (CourseGenerationJob.updated_at >= cutoff)
        )
    stmt = stmt.order_by(CourseGenerationJob.created_at.desc())
    jobs = db.scalars(stmt).all()
    if not jobs:
        return []
    course_titles: dict[int, str] = {}
    course_ids = list({job.course_id for job in jobs})
    if course_ids:
        for course in db.scalars(select(Course).where(Course.id.in_(course_ids))).all():
            course_titles[course.id] = course.title
    return [_serialize_job(job, course_titles.get(job.course_id)) for job in jobs]


@router.get("/{course_id}/queue", response_model=Optional[CourseGenerationJobOut])
def get_course_queue(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    job = db.scalar(
        select(CourseGenerationJob)
        .where(CourseGenerationJob.course_id == course.id, CourseGenerationJob.user_id == current_user.id)
        .order_by(CourseGenerationJob.created_at.desc())
    )
    if not job:
        return None
    return _serialize_job(job, course.title)


@router.delete("/queues/{job_id}", response_model=CourseGenerationJobOut)
def cancel_queue_job(job_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    job = db.scalar(select(CourseGenerationJob).where(CourseGenerationJob.id == job_id))
    if not job or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in {"done", "error", "cancelled"}:
        course = db.scalar(select(Course).where(Course.id == job.course_id))
        return _serialize_job(job, course.title if course else None)
    job.status = "cancelled"
    job.updated_at = datetime.utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)
    course = db.scalar(select(Course).where(Course.id == job.course_id))
    return _serialize_job(job, course.title if course else None)
