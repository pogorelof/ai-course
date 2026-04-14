import json
from typing import Dict, List, Optional
import os

from openai import OpenAI
from openai import OpenAIError
import httpx
import pypdf

from ..core.config import settings
from .prompts import (
    COURSE_OUTLINE_PDF_APPENDIX,
    COURSE_OUTLINE_SYSTEM_PROMPT,
    QUIZ_ADVICE_SYSTEM_PROMPT,
    TOPIC_CONTENT_PDF_APPENDIX,
    TOPIC_CONTENT_SYSTEM_PROMPT,
    TOPIC_QUIZ_SYSTEM_PROMPT,
)


def _client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise OpenAIError(
            "OPENAI_API_KEY is not configured. Set it via environment or backend/.env."
        )

    proxies: dict | None = None
    http_client = None
    if settings.PROXY_URL:
        # Route both http and https via a single upstream proxy URL
        proxies = {
            "http://": settings.PROXY_URL,
            "https://": settings.PROXY_URL,
        }
        http_client = httpx.Client(proxies=proxies, timeout=60)
    return OpenAI(api_key=settings.OPENAI_API_KEY, http_client=http_client)


def extract_text_from_pdf(file_path: str) -> str:
    try:
        reader = pypdf.PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""


def generate_course_outline(title: str, wishes: str, pdf_text: Optional[str] = None) -> List[str]:
    sys = COURSE_OUTLINE_SYSTEM_PROMPT
    
    user_content = f"Course title: {title}\nPreferences: {wishes}\n"
    
    if pdf_text:
        sys += COURSE_OUTLINE_PDF_APPENDIX
        user_content += f"PDF Content Context:\n{pdf_text[:50000]}\n"  # Truncate to avoid token limits if necessary, though 128k context is common now. Safety cap.
    
    user_content += "Return exactly 15 unique topics, one per line."
    
    client = _client()
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_content},
        ],
    )
    text = resp.choices[0].message.content or ""
    lines = [line.strip("- •\t ") for line in text.splitlines() if line.strip()]
    return lines[:15] if len(lines) >= 15 else lines


def generate_topic_content(course_title: str, wishes: str, topic_title: str, pdf_text: Optional[str] = None) -> str:
    sys = TOPIC_CONTENT_SYSTEM_PROMPT
    
    user_content = f"Course: {course_title}\nPreferences: {wishes}\nTopic: {topic_title}\n"
    
    if pdf_text:
        sys += TOPIC_CONTENT_PDF_APPENDIX
        user_content += f"PDF Content Context:\n{pdf_text[:50000]}\n"

    user_content += "Generate the lesson content now."
    
    client = _client()
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_content},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _parse_json_response(text: str, context_name: str) -> dict:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise OpenAIError(f"{context_name}: model returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise OpenAIError(f"{context_name}: model returned non-object JSON")
    return data


def generate_topic_quiz(course_title: str, topic_title: str, topic_content: str) -> List[dict]:
    user_content = (
        f"Course: {course_title}\n"
        f"Topic: {topic_title}\n"
        f"Chapter content:\n{topic_content[:50000]}\n\n"
        "Generate quiz now."
    )

    client = _client()
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": TOPIC_QUIZ_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
    )
    text = (resp.choices[0].message.content or "").strip()
    data = _parse_json_response(text, "generate_topic_quiz")
    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list) or len(raw_questions) != 5:
        raise OpenAIError("generate_topic_quiz: expected exactly 5 questions")

    normalized: List[dict] = []
    for item in raw_questions:
        if not isinstance(item, dict):
            raise OpenAIError("generate_topic_quiz: invalid question structure")
        question_text = str(item.get("question_text", "")).strip()
        options = item.get("options")
        correct_option_index = item.get("correct_option_index")
        if not question_text:
            raise OpenAIError("generate_topic_quiz: empty question text")
        if not isinstance(options, list) or len(options) != 4:
            raise OpenAIError("generate_topic_quiz: each question must have 4 options")
        normalized_options = [str(opt).strip() for opt in options]
        if any(not opt for opt in normalized_options):
            raise OpenAIError("generate_topic_quiz: empty option found")
        if not isinstance(correct_option_index, int) or correct_option_index < 0 or correct_option_index > 3:
            raise OpenAIError("generate_topic_quiz: invalid correct_option_index")
        normalized.append(
            {
                "question_text": question_text,
                "options": normalized_options,
                "correct_option_index": correct_option_index,
            }
        )
    return normalized


def generate_quiz_advice(topic_content: str, wrong_answers_payload: List[dict]) -> Dict[int, str]:
    if not wrong_answers_payload:
        return {}

    user_content = (
        f"Chapter content:\n{topic_content[:50000]}\n\n"
        f"Wrong answers payload:\n{json.dumps(wrong_answers_payload, ensure_ascii=False)}"
    )
    client = _client()
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": QUIZ_ADVICE_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
    )
    text = (resp.choices[0].message.content or "").strip()
    data = _parse_json_response(text, "generate_quiz_advice")
    raw_advices = data.get("advices")
    if not isinstance(raw_advices, list):
        raise OpenAIError("generate_quiz_advice: expected advices list")

    result: Dict[int, str] = {}
    for item in raw_advices:
        if not isinstance(item, dict):
            continue
        question_index = item.get("question_index")
        advice = str(item.get("advice", "")).strip()
        if isinstance(question_index, int) and advice:
            result[question_index] = advice
    return result
