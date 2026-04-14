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
from ..models import Course, CourseTopic
from ..schemas import CourseOutlineResponse, TopicOut, TopicContentResponse, CourseOut
from ..services.ai import generate_course_outline, generate_topic_content, extract_text_from_pdf


router = APIRouter()


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
    return [TopicOut.model_validate(t) for t in topics]
