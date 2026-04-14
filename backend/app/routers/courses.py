from typing import List
import os
import uuid
import shutil

from fastapi import APIRouter, Depends, HTTPException, status, File, Form, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import select
from openai import OpenAIError

from ..db import get_db
from ..core.security import get_current_user
from ..models import Course, CourseTopic, TopicQuiz, TopicQuizAttempt, TopicQuizAttemptAnswer, TopicQuizQuestion
from ..schemas import (
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
    generate_quiz_advice,
    generate_topic_content,
    generate_topic_quiz,
)


router = APIRouter()
PASSING_SCORE_PERCENT = 60


@router.post("/outline", response_model=CourseOutlineResponse)
def create_outline(
    title: str = Form(...),
    wishes: str = Form(...),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
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
        titles = generate_course_outline(title, wishes, pdf_text)
    except OpenAIError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    if len(titles) != 15:
        raise HTTPException(status_code=500, detail="Failed to generate 15 topics")

    course = Course(title=title, wishes=wishes, owner_id=current_user.id, pdf_path=pdf_path)
    db.add(course)
    db.flush()

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

    # If content already exists, return it as-is
    if topic.content and topic.content.strip():
        return TopicContentResponse(course_title=course.title, course_id=course.id, topic_id=topic.id, content=topic.content)

    # Otherwise, generate and save
    pdf_text = None
    if course.pdf_path and os.path.exists(course.pdf_path):
         pdf_text = extract_text_from_pdf(course.pdf_path)

    try:
        content = generate_topic_content(course.title, course.wishes, topic.title, pdf_text)
    except OpenAIError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    topic.content = content
    db.add(topic)
    db.commit()
    db.refresh(topic)

    return TopicContentResponse(course_title=course.title, course_id=course.id, topic_id=topic.id, content=topic.content or "")


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
    if not topic.content or not topic.content.strip():
        raise HTTPException(status_code=400, detail="Generate topic content before quiz")

    existing_quiz = db.scalar(select(TopicQuiz).where(TopicQuiz.topic_id == topic.id))
    if existing_quiz:
        return _serialize_quiz(existing_quiz, db, current_user.id)

    try:
        generated_questions = generate_topic_quiz(
            course_title=course.title,
            topic_title=topic.title,
            topic_content=topic.content,
        )
    except OpenAIError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    quiz = TopicQuiz(topic_id=topic.id)
    db.add(quiz)
    db.flush()

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

    wrong_payload: list[dict] = []
    evaluation_rows: list[dict] = []
    correct_count = 0
    for q in questions:
        selected_option_index = submitted_by_question_id[q.id]
        is_correct = selected_option_index == q.correct_option_index
        if is_correct:
            correct_count += 1
        else:
            wrong_payload.append(
                {
                    "question_index": q.position - 1,
                    "question_text": q.question_text,
                    "options": [q.option_a, q.option_b, q.option_c, q.option_d],
                    "selected_option_index": selected_option_index,
                    "correct_option_index": q.correct_option_index,
                }
            )
        evaluation_rows.append(
            {
                "question": q,
                "selected_option_index": selected_option_index,
                "is_correct": is_correct,
            }
        )

    score_percent = int(round((correct_count / len(questions)) * 100))
    advices_by_index: dict[int, str] = {}
    if wrong_payload:
        try:
            advices_by_index = generate_quiz_advice(topic_content=topic.content or "", wrong_answers_payload=wrong_payload)
        except OpenAIError as e:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

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
            advice = advices_by_index.get(
                question.position - 1,
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
    return courses


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
                last_score_percent=last_score,
                has_attempts=has_attempts,
                has_passed_quiz=has_passed_quiz,
            )
        )
    return result
