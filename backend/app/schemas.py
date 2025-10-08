from pydantic import BaseModel, EmailStr, field_validator
from typing import List, Optional


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("username cannot be empty")
        return v


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginInput(BaseModel):
    username: str
    password: str


class CourseCreate(BaseModel):
    title: str
    wishes: str


class CourseOut(BaseModel):
    id: int
    title: str

    class Config:
        from_attributes = True


class TopicOut(BaseModel):
    id: int
    title: str
    content: Optional[str]

    class Config:
        from_attributes = True


class CourseOutlineResponse(BaseModel):
    course_id: int
    topics: List[TopicOut]


class TopicContentResponse(BaseModel):
    course_title: str
    course_id: int
    topic_id: int
    content: str

