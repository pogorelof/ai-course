from pydantic import BaseModel, EmailStr, Field, field_validator
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
    wishes: Optional[str] = None
    has_book: bool = False
    book_name: Optional[str] = None
    book_url: Optional[str] = None

    class Config:
        from_attributes = True


class TopicOut(BaseModel):
    id: int
    title: str
    content: Optional[str]
    last_score_percent: Optional[int] = None
    has_passed_quiz: bool = False
    has_attempts: bool = False

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


class QuizQuestionOut(BaseModel):
    id: int
    question_text: str
    options: List[str]


class TopicQuizProgressOut(BaseModel):
    has_attempts: bool
    last_score_percent: Optional[int] = None
    attempts_count: int = 0


class QuizSubmitAnswerInput(BaseModel):
    question_id: int
    selected_option_index: int = Field(ge=0, le=3)


class QuizSubmitInput(BaseModel):
    answers: List[QuizSubmitAnswerInput]


class QuizWrongAdviceOut(BaseModel):
    question_id: int
    question_text: str
    selected_option_index: int
    correct_option_index: int
    advice: str


class QuizResultOut(BaseModel):
    score_percent: int
    total_questions: int
    correct_answers: int
    wrong_advices: List[QuizWrongAdviceOut]
    question_results: List[QuizWrongAdviceOut]


class TopicQuizOut(BaseModel):
    topic_id: int
    questions: List[QuizQuestionOut]
    progress: TopicQuizProgressOut
    last_result: Optional[QuizResultOut] = None
