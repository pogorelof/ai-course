from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import List, Optional

SUPPORTED_AI_PROVIDERS = ("openai", "openrouter")
SUPPORTED_OPENAI_MODELS = (
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-4o-mini",
    "gpt-5.4-nano",
    "gpt-5-mini",
    "gpt-5-nano",
)
SUPPORTED_OPENROUTER_BASE_MODELS = (
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "claude-opus-4.7",
    "claude-sonnet-4.6",
    "claude-haiku-4.5",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5-mini",
    "gpt-5-nano",
    "meta-llama/llama-4-maverick",
    "google/gemma-4-31b-it",
    "openai/gpt-oss-120b",
    "minimax/minimax-m2.5",
    "nvidia/nemotron-3-super-120b-a12b",
    "qwen/qwen3-coder",
    "qwen/qwen3.6-plus",
)
NITRO_SUFFIX = ":nitro"
SUPPORTED_CONTENT_FORMATS = ("text", "interactive")
SUPPORTED_REASONING_EFFORTS = ("minimal", "low", "medium", "high")


def _is_supported_openrouter_model(model: str) -> bool:
    normalized = model.strip()
    if not normalized:
        return False
    if normalized.endswith(NITRO_SUFFIX):
        normalized = normalized[: -len(NITRO_SUFFIX)]
    return normalized in SUPPORTED_OPENROUTER_BASE_MODELS


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
    ai_provider: str = "openai"
    ai_model: str = "gpt-5-mini"
    content_format: str = "text"
    reasoning_effort: str = "minimal"

    @field_validator("ai_provider")
    @classmethod
    def validate_ai_provider(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in SUPPORTED_AI_PROVIDERS:
            raise ValueError("Unsupported ai_provider")
        return normalized

    @field_validator("ai_model")
    @classmethod
    def validate_ai_model(cls, v: str) -> str:
        return v.strip()

    @field_validator("wishes", "title")
    @classmethod
    def trim_text_fields(cls, v: str) -> str:
        return v.strip()

    @field_validator("content_format")
    @classmethod
    def validate_content_format(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in SUPPORTED_CONTENT_FORMATS:
            raise ValueError("Unsupported content_format")
        return normalized

    @field_validator("reasoning_effort")
    @classmethod
    def validate_reasoning_effort(cls, v: str) -> str:
        normalized = (v or "minimal").strip().lower()
        if normalized not in SUPPORTED_REASONING_EFFORTS:
            raise ValueError("Unsupported reasoning_effort")
        return normalized

    @model_validator(mode="after")
    def validate_provider_model(self):
        if self.ai_provider == "openai" and self.ai_model not in SUPPORTED_OPENAI_MODELS:
            raise ValueError("Unsupported ai_model for openai")
        if self.ai_provider == "openrouter" and not _is_supported_openrouter_model(self.ai_model):
            raise ValueError("Unsupported ai_model for openrouter")
        return self


class DiagnosticQuestionsInput(BaseModel):
    title: str
    wishes: str = ""
    ai_provider: str = "openai"
    ai_model: str = "gpt-5-mini"
    reasoning_effort: str = "minimal"

    @field_validator("title")
    @classmethod
    def validate_title_nonempty(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("title cannot be empty")
        return t

    @field_validator("wishes", mode="before")
    @classmethod
    def wishes_coerce(cls, v) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("ai_provider")
    @classmethod
    def validate_ai_provider_diag(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in SUPPORTED_AI_PROVIDERS:
            raise ValueError("Unsupported ai_provider")
        return normalized

    @field_validator("ai_model")
    @classmethod
    def validate_ai_model_diag(cls, v: str) -> str:
        return v.strip()

    @field_validator("reasoning_effort")
    @classmethod
    def validate_reasoning_effort_diag(cls, v: str) -> str:
        normalized = (v or "minimal").strip().lower()
        if normalized not in SUPPORTED_REASONING_EFFORTS:
            raise ValueError("Unsupported reasoning_effort")
        return normalized

    @model_validator(mode="after")
    def validate_provider_model_diag(self):
        if self.ai_provider == "openai" and self.ai_model not in SUPPORTED_OPENAI_MODELS:
            raise ValueError("Unsupported ai_model for openai")
        if self.ai_provider == "openrouter" and not _is_supported_openrouter_model(self.ai_model):
            raise ValueError("Unsupported ai_model for openrouter")
        return self


class DiagnosticQuestionsOut(BaseModel):
    questions: List[str]


class DiagnosticEvaluateInput(DiagnosticQuestionsInput):
    questions: List[str]
    answers: List[str]

    @model_validator(mode="after")
    def validate_lengths(self):
        if len(self.questions) != 5 or len(self.answers) != 5:
            raise ValueError("Exactly 5 questions and 5 answers are required")
        for i, (q, a) in enumerate(zip(self.questions, self.answers)):
            if not str(q).strip():
                raise ValueError(f"Question {i + 1} is empty")
            if not str(a).strip():
                raise ValueError(f"Answer {i + 1} is empty")
        return self


class DiagnosticEvaluateOut(BaseModel):
    summary: str


class CourseOut(BaseModel):
    id: int
    title: str
    wishes: Optional[str] = None
    ai_provider: str = "openai"
    ai_model: str = "gpt-5-mini"
    content_format: str = "text"
    has_book: bool = False
    book_name: Optional[str] = None
    book_url: Optional[str] = None

    class Config:
        from_attributes = True


class TopicOut(BaseModel):
    id: int
    title: str
    content: Optional[str]
    content_ai_model: Optional[str] = None
    last_score_percent: Optional[int] = None
    has_passed_quiz: bool = False
    has_attempts: bool = False
    has_html_content: bool = False
    html_ai_model: Optional[str] = None

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
    content_ai_model: str


class TopicMetaOut(BaseModel):
    topic_id: int
    course_id: int
    course_title: str
    topic_title: str
    content_ai_model: Optional[str] = None
    content_ai_provider: Optional[str] = None
    has_text_content: bool = False
    has_html_content: bool = False
    html_ai_model: Optional[str] = None
    html_ai_provider: Optional[str] = None


class TopicHtmlContentOut(BaseModel):
    topic_id: int
    course_id: int
    course_title: str
    html: str
    ai_provider: str
    ai_model: str
    generated_at: datetime


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


class CourseSettingsUpdateInput(BaseModel):
    ai_provider: str
    ai_model: str
    content_format: Optional[str] = None
    reasoning_effort: str = "minimal"

    @field_validator("ai_provider")
    @classmethod
    def validate_ai_provider(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in SUPPORTED_AI_PROVIDERS:
            raise ValueError("Unsupported ai_provider")
        return normalized

    @field_validator("ai_model")
    @classmethod
    def validate_ai_model(cls, v: str) -> str:
        return v.strip()

    @field_validator("content_format")
    @classmethod
    def validate_content_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip().lower()
        if normalized not in SUPPORTED_CONTENT_FORMATS:
            raise ValueError("Unsupported content_format")
        return normalized

    @field_validator("reasoning_effort")
    @classmethod
    def validate_reasoning_effort(cls, v: str) -> str:
        normalized = (v or "minimal").strip().lower()
        if normalized not in SUPPORTED_REASONING_EFFORTS:
            raise ValueError("Unsupported reasoning_effort")
        return normalized

    @model_validator(mode="after")
    def validate_provider_model(self):
        if self.ai_provider == "openai" and self.ai_model not in SUPPORTED_OPENAI_MODELS:
            raise ValueError("Unsupported ai_model for openai")
        if self.ai_provider == "openrouter" and not _is_supported_openrouter_model(self.ai_model):
            raise ValueError("Unsupported ai_model for openrouter")
        return self

class CourseSettingsOut(BaseModel):
    ai_provider: str
    ai_model: str
    content_format: str = "text"
    reasoning_effort: str = "minimal"


class UserAPIKeysUpdateInput(BaseModel):
    openai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None

    @field_validator("openai_api_key", "openrouter_api_key")
    @classmethod
    def validate_api_keys(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None


class UserAPIKeysOut(BaseModel):
    has_openai_key: bool = False
    has_openrouter_key: bool = False


class CourseGenerationJobOut(BaseModel):
    id: int
    course_id: int
    course_title: str
    status: str
    total: int
    completed: int
    current_topic_id: Optional[int] = None
    current_topic_title: Optional[str] = None
    content_format: str
    ai_provider: str
    ai_model: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
