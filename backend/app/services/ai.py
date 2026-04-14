from typing import List, Optional
import os

from langchain.schema import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableLambda
from openai import OpenAI
from openai import OpenAIError
import httpx
import pypdf

from ..core.config import settings
from .prompts import (
    COURSE_OUTLINE_PDF_APPENDIX,
    COURSE_OUTLINE_SYSTEM_PROMPT,
    TOPIC_CONTENT_PDF_APPENDIX,
    TOPIC_CONTENT_SYSTEM_PROMPT,
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
