from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from .db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    courses: Mapped[list["Course"]] = relationship("Course", back_populates="owner", cascade="all, delete-orphan")
    api_keys: Mapped[Optional["UserAPIKeys"]] = relationship(
        "UserAPIKeys", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wishes: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    owner: Mapped[User] = relationship("User", back_populates="courses")
    topics: Mapped[list["CourseTopic"]] = relationship("CourseTopic", back_populates="course", cascade="all, delete-orphan")
    ai_settings: Mapped[Optional["CourseAISettings"]] = relationship(
        "CourseAISettings", back_populates="course", uselist=False, cascade="all, delete-orphan"
    )


class CourseAISettings(Base):
    __tablename__ = "course_ai_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    ai_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="openai")
    ai_model: Mapped[str] = mapped_column(String(64), nullable=False, default="gpt-5-mini")

    course: Mapped[Course] = relationship("Course", back_populates="ai_settings")


class UserAPIKeys(Base):
    __tablename__ = "user_api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    openai_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    openrouter_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="api_keys")


class CourseTopic(Base):
    __tablename__ = "course_topics"
    __table_args__ = (
        UniqueConstraint("course_id", "title", name="uq_course_topic_unique"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    course: Mapped[Course] = relationship("Course", back_populates="topics")
    quiz: Mapped[Optional["TopicQuiz"]] = relationship(
        "TopicQuiz", back_populates="topic", uselist=False, cascade="all, delete-orphan"
    )
    content_generation: Mapped[Optional["TopicContentGeneration"]] = relationship(
        "TopicContentGeneration", back_populates="topic", uselist=False, cascade="all, delete-orphan"
    )
    html_content: Mapped[Optional["TopicHtmlContent"]] = relationship(
        "TopicHtmlContent", back_populates="topic", uselist=False, cascade="all, delete-orphan"
    )


class TopicContentGeneration(Base):
    __tablename__ = "topic_content_generation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("course_topics.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    ai_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="openai")
    ai_model: Mapped[str] = mapped_column(String(64), nullable=False, default="gpt-5-mini")
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    topic: Mapped[CourseTopic] = relationship("CourseTopic", back_populates="content_generation")


class TopicHtmlContent(Base):
    __tablename__ = "topic_html_content"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("course_topics.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    html: Mapped[str] = mapped_column(Text, nullable=False)
    ai_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="openai")
    ai_model: Mapped[str] = mapped_column(String(64), nullable=False, default="gpt-5-mini")
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    topic: Mapped[CourseTopic] = relationship("CourseTopic", back_populates="html_content")


class TopicQuiz(Base):
    __tablename__ = "topic_quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("course_topics.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    topic: Mapped[CourseTopic] = relationship("CourseTopic", back_populates="quiz")
    questions: Mapped[list["TopicQuizQuestion"]] = relationship(
        "TopicQuizQuestion", back_populates="quiz", cascade="all, delete-orphan"
    )
    attempts: Mapped[list["TopicQuizAttempt"]] = relationship(
        "TopicQuizAttempt", back_populates="quiz", cascade="all, delete-orphan"
    )


class TopicQuizQuestion(Base):
    __tablename__ = "topic_quiz_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("topic_quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(String(500), nullable=False)
    option_b: Mapped[str] = mapped_column(String(500), nullable=False)
    option_c: Mapped[str] = mapped_column(String(500), nullable=False)
    option_d: Mapped[str] = mapped_column(String(500), nullable=False)
    correct_option_index: Mapped[int] = mapped_column(Integer, nullable=False)

    quiz: Mapped[TopicQuiz] = relationship("TopicQuiz", back_populates="questions")
    generated_advice: Mapped[Optional["TopicQuizQuestionAdvice"]] = relationship(
        "TopicQuizQuestionAdvice", back_populates="question", uselist=False, cascade="all, delete-orphan"
    )
    answers: Mapped[list["TopicQuizAttemptAnswer"]] = relationship(
        "TopicQuizAttemptAnswer", back_populates="question", cascade="all, delete-orphan"
    )


class TopicQuizQuestionAdvice(Base):
    __tablename__ = "topic_quiz_question_advices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("topic_quiz_questions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    advice: Mapped[str] = mapped_column(Text, nullable=False)

    question: Mapped[TopicQuizQuestion] = relationship("TopicQuizQuestion", back_populates="generated_advice")


class TopicQuizAttempt(Base):
    __tablename__ = "topic_quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("topic_quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    score_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    quiz: Mapped[TopicQuiz] = relationship("TopicQuiz", back_populates="attempts")
    answers: Mapped[list["TopicQuizAttemptAnswer"]] = relationship(
        "TopicQuizAttemptAnswer", back_populates="attempt", cascade="all, delete-orphan"
    )


class TopicQuizAttemptAnswer(Base):
    __tablename__ = "topic_quiz_attempt_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("topic_quiz_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("topic_quiz_questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    selected_option_index: Mapped[int] = mapped_column(Integer, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    advice: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attempt: Mapped[TopicQuizAttempt] = relationship("TopicQuizAttempt", back_populates="answers")
    question: Mapped[TopicQuizQuestion] = relationship("TopicQuizQuestion", back_populates="answers")
