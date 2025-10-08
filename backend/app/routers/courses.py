from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_db
from ..core.security import get_current_user
from ..models import Course, CourseTopic
from ..schemas import CourseCreate, CourseOutlineResponse, TopicOut, TopicContentResponse, CourseOut
from ..services.ai import generate_course_outline, generate_topic_content


router = APIRouter()


@router.post("/outline", response_model=CourseOutlineResponse)
def create_outline(payload: CourseCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    titles = generate_course_outline(payload.title, payload.wishes)
    if len(titles) != 15:
        raise HTTPException(status_code=500, detail="Failed to generate 15 topics")

    course = Course(title=payload.title, wishes=payload.wishes, owner_id=current_user.id)
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
    content = generate_topic_content(course.title, course.wishes, topic.title)
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
