from typing import List, Optional
import logging
import os
import uuid
import shutil

from fastapi import APIRouter, Depends, HTTPException, status, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from openai import OpenAIError

from ..db import get_db
from ..core.security import get_current_user
from ..models import (
    Course,
    CourseAISettings,
    UserAPIKeys,
    CourseTopic,
    TopicContentGeneration,
    TopicQuiz,
    TopicQuizAttempt,
    TopicQuizAttemptAnswer,
    TopicQuizQuestion,
    TopicQuizQuestionAdvice,
)
from ..schemas import (
    CourseCreate,
    CourseSettingsOut,
    CourseSettingsUpdateInput,
    CourseOutlineResponse,
    CourseOut,
    QuizResultOut,
    QuizSubmitInput,
    QuizWrongAdviceOut,
    TopicContentResponse,
    TopicOut,
    TopicQuizOut,
    TopicQuizProgressOut,
    QuizQuestionOut,
)
from ..services.ai import (
    extract_text_from_pdf,
    generate_course_outline,
    generate_topic_content,
    generate_topic_quiz,
)


router = APIRouter()
logger = logging.getLogger(__name__)
PASSING_SCORE_PERCENT = 60
ACTIVE_AI_PROVIDERS = {"openai", "openrouter"}
LEGACY_DEFAULT_CONTENT_MODEL = "gpt-4o-mini"
LEGACY_DEFAULT_COURSE_MODEL = "gpt-4o-mini"


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


def _upsert_course_ai_settings(course: Course, db: Session, ai_provider: str, ai_model: str) -> CourseAISettings:
    settings = db.scalar(select(CourseAISettings).where(CourseAISettings.course_id == course.id))
    if not settings:
        settings = CourseAISettings(course_id=course.id, ai_provider=ai_provider, ai_model=ai_model)
        db.add(settings)
        db.flush()
        return settings
    settings.ai_provider = ai_provider
    settings.ai_model = ai_model
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


@router.post("/outline", response_model=CourseOutlineResponse)
def create_outline(
    title: str = Form(...),
    wishes: str = Form(...),
    ai_provider: str = Form("openai"),
    ai_model: str = Form("gpt-5-mini"),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    validated_payload = CourseCreate(title=title, wishes=wishes, ai_provider=ai_provider, ai_model=ai_model)
    _assert_active_ai_provider(validated_payload.ai_provider)
    user_api_key = _require_user_api_key(current_user.id, validated_payload.ai_provider, db)

    pdf_text = None
    pdf_path = None

    print(f"Received outline request. Title: {title}, File provided: {file is not None}")

    if file:
        print(f"File content type: {file.content_type}, Filename: {file.filename}")
        if file.content_type != "application/pdf":
             raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        # Use absolute path relative to this file to ensure correct location
        # This file is in backend/app/routers/
        # We want backend/uploads/
        current_file_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_file_dir))) # Go up to project root? No, let's go to backend root.
        # backend/app/routers -> backend/app -> backend -> ...
        # actually, let's assume the standard structure: backend/ is where we want uploads.
        
        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        upload_dir = os.path.join(backend_root, "uploads")
        
        os.makedirs(upload_dir, exist_ok=True)
        
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        print(f"Saving file to: {file_path}")
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            print("File saved successfully.")
        except Exception as e:
            print(f"Error saving file: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
            
        pdf_path = file_path
        pdf_text = extract_text_from_pdf(file_path)

    try:
        titles = generate_course_outline(
            validated_payload.title,
            validated_payload.wishes,
            model=validated_payload.ai_model,
            provider=validated_payload.ai_provider,
            pdf_text=pdf_text,
            api_key=user_api_key,
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
    _upsert_course_ai_settings(course, db, validated_payload.ai_provider, validated_payload.ai_model)

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
def generate_content(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    topic = db.scalar(select(CourseTopic).where(CourseTopic.id == topic_id))
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    course = db.scalar(select(Course).where(Course.id == topic.course_id))
    if not course or course.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ai_provider, ai_model = _resolve_course_ai_settings(course, db)
    _assert_active_ai_provider(ai_provider)

    # If content already exists, return it as-is
    if topic.content and topic.content.strip():
        model_name = _resolve_topic_content_model(topic, db) or LEGACY_DEFAULT_CONTENT_MODEL
        return TopicContentResponse(
            course_title=course.title,
            course_id=course.id,
            topic_id=topic.id,
            content=topic.content,
            content_ai_model=model_name,
        )

    # Otherwise, generate and save
    pdf_text = None
    if course.pdf_path and os.path.exists(course.pdf_path):
         pdf_text = extract_text_from_pdf(course.pdf_path)
    api_key = _require_user_api_key(current_user.id, ai_provider, db)

    try:
        content = generate_topic_content(
            course.title,
            course.wishes,
            topic.title,
            model=ai_model,
            provider=ai_provider,
            pdf_text=pdf_text,
            api_key=api_key,
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
def generate_topic_quiz_endpoint(topic_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
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
        generated_questions = generate_topic_quiz(
            course_title=course.title,
            topic_title=topic.title,
            topic_content=topic.content,
            model=ai_model,
            provider=ai_provider,
            api_key=api_key,
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
        # Parallel request could create quiz first.
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


@router.get("/mine", response_model=List[CourseOut])
def list_my_courses(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    courses = db.scalars(select(Course).where(Course.owner_id == current_user.id)).all()
    result: list[CourseOut] = []
    for course in courses:
        ai_settings = _get_course_ai_settings(course, db)
        if ai_settings:
            ai_provider, ai_model = ai_settings.ai_provider, ai_settings.ai_model
        else:
            # Legacy courses (created before per-course AI settings) were generated with gpt-4o-mini.
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
    return CourseSettingsOut(ai_provider=ai_provider, ai_model=ai_model)


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
    course_ai_settings = _upsert_course_ai_settings(course, db, payload.ai_provider, payload.ai_model)
    db.commit()
    db.refresh(course_ai_settings)
    return CourseSettingsOut(ai_provider=course_ai_settings.ai_provider, ai_model=course_ai_settings.ai_model)


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
            )
        )
    return result
