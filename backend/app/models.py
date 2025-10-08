from sqlalchemy import Column, Integer, String, UniqueConstraint, ForeignKey, Text
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


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wishes: Mapped[str] = mapped_column(Text, nullable=False)

    owner: Mapped[User] = relationship("User", back_populates="courses")
    topics: Mapped[list["CourseTopic"]] = relationship("CourseTopic", back_populates="course", cascade="all, delete-orphan")


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

