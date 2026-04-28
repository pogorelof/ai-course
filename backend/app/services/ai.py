import json
import re
from typing import Dict, List, Optional

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
    TOPIC_HTML_PDF_APPENDIX,
    TOPIC_HTML_SYSTEM_PROMPT,
    TOPIC_QUIZ_SYSTEM_PROMPT,
)


MAX_HTML_DOCUMENT_LENGTH = 200_000


def _extract_response_text(resp, context_name: str) -> str:
    choices = getattr(resp, "choices", None)
    if not choices:
        raise OpenAIError(f"{context_name}: model returned no choices")

    message = getattr(choices[0], "message", None)
    if message is None:
        raise OpenAIError(f"{context_name}: model returned no message")

    content = getattr(message, "content", None)
    if isinstance(content, str):
        text = content.strip()
        if text:
            return text
    elif isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict):
                chunk = str(part.get("text", "")).strip()
            else:
                chunk = str(getattr(part, "text", "")).strip()
            if chunk:
                parts.append(chunk)
        if parts:
            return "\n".join(parts)

    refusal = getattr(message, "refusal", None)
    if refusal:
        raise OpenAIError(f"{context_name}: model refused to answer")
    raise OpenAIError(f"{context_name}: model returned empty content")


def _safe_chat_completion_create(client: OpenAI, context_name: str, **kwargs):
    try:
        return client.chat.completions.create(**kwargs)
    except OpenAIError:
        raise
    except Exception as exc:
        raise OpenAIError(f"{context_name}: upstream response parse failed ({exc})") from exc


def _openrouter_model_candidates(model: str) -> List[str]:
    normalized = model.strip()
    if not normalized:
        return [model]
    if "/" in normalized:
        return [normalized]

    candidates = [normalized]
    lowered = normalized.lower()
    if lowered.startswith("claude-"):
        candidates.append(f"anthropic/{normalized}")
    elif lowered.startswith("gemini-") or lowered.startswith("gemma-"):
        candidates.append(f"google/{normalized}")
    elif lowered.startswith("deepseek-"):
        candidates.append(f"deepseek/{normalized}")
    return candidates


def _chat_completion_with_model_fallback(
    client: OpenAI,
    context_name: str,
    provider: str,
    model: str,
    **kwargs,
):
    model_candidates = _openrouter_model_candidates(model) if provider == "openrouter" else [model]
    last_error: Optional[OpenAIError] = None
    for candidate in model_candidates:
        try:
            return _safe_chat_completion_create(
                client,
                context_name,
                model=candidate,
                **kwargs,
            )
        except OpenAIError as exc:
            last_error = exc
            continue

    if last_error is not None:
        raise OpenAIError(f"{context_name}: failed for model '{model}' ({last_error})")
    raise OpenAIError(f"{context_name}: failed for model '{model}'")


def _client(api_key: Optional[str] = None, provider: str = "openai") -> OpenAI:
    resolved_api_key = (api_key or "").strip()
    if not resolved_api_key:
        raise OpenAIError(
            f"{provider} API key is not configured for this account."
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
    if provider == "openrouter":
        return OpenAI(
            api_key=resolved_api_key,
            base_url="https://openrouter.ai/api/v1",
            http_client=http_client,
        )
    return OpenAI(api_key=resolved_api_key, http_client=http_client)


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


def generate_course_outline(
    title: str,
    wishes: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
) -> List[str]:
    sys = COURSE_OUTLINE_SYSTEM_PROMPT
    
    user_content = f"Course title: {title}\nPreferences: {wishes}\n"
    
    if pdf_text:
        sys += COURSE_OUTLINE_PDF_APPENDIX
        user_content += f"PDF Content Context:\n{pdf_text[:50000]}\n"  # Truncate to avoid token limits if necessary, though 128k context is common now. Safety cap.
    
    user_content += "Return exactly 15 unique topics, one per line."
    
    client = _client(api_key=api_key, provider=provider)
    resp = _chat_completion_with_model_fallback(
        client,
        "generate_course_outline",
        provider=provider,
        model=model,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_content},
        ],
    )
    text = _extract_response_text(resp, "generate_course_outline")
    lines = [line.strip("- •\t ") for line in text.splitlines() if line.strip()]
    return lines[:15] if len(lines) >= 15 else lines


def generate_topic_content(
    course_title: str,
    wishes: str,
    topic_title: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
) -> str:
    sys = TOPIC_CONTENT_SYSTEM_PROMPT
    
    user_content = f"Course: {course_title}\nPreferences: {wishes}\nTopic: {topic_title}\n"
    
    if pdf_text:
        sys += TOPIC_CONTENT_PDF_APPENDIX
        user_content += f"PDF Content Context:\n{pdf_text[:50000]}\n"

    user_content += "Generate the lesson content now."
    
    client = _client(api_key=api_key, provider=provider)
    resp = _chat_completion_with_model_fallback(
        client,
        "generate_topic_content",
        provider=provider,
        model=model,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_content},
        ],
    )
    return _extract_response_text(resp, "generate_topic_content")


def _strip_code_fences(text: str) -> str:
    normalized = text.strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        normalized = "\n".join(lines).strip()
    return normalized


def _extract_html_document(text: str, context_name: str) -> str:
    normalized = _strip_code_fences(text)

    lower = normalized.lower()
    doctype_idx = lower.find("<!doctype")
    html_idx = lower.find("<html")

    candidates = [idx for idx in (doctype_idx, html_idx) if idx != -1]
    if not candidates:
        raise OpenAIError(f"{context_name}: model did not return an HTML document")
    start = min(candidates)

    end_idx = lower.rfind("</html>")
    if end_idx == -1:
        raise OpenAIError(f"{context_name}: HTML document is missing closing </html>")
    end = end_idx + len("</html>")

    document = normalized[start:end].strip()

    if "<body" not in document.lower():
        raise OpenAIError(f"{context_name}: HTML document has no <body>")
    if len(document) < 500:
        raise OpenAIError(f"{context_name}: HTML document is too short to be a real lesson")
    if len(document) > MAX_HTML_DOCUMENT_LENGTH:
        raise OpenAIError(
            f"{context_name}: HTML document exceeds {MAX_HTML_DOCUMENT_LENGTH} characters"
        )

    return document


def generate_topic_html(
    course_title: str,
    wishes: str,
    topic_title: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
) -> str:
    sys = TOPIC_HTML_SYSTEM_PROMPT

    user_content = (
        f"Course: {course_title}\n"
        f"Preferences: {wishes}\n"
        f"Topic: {topic_title}\n"
    )

    if pdf_text:
        sys += TOPIC_HTML_PDF_APPENDIX
        user_content += f"PDF Content Context:\n{pdf_text[:50000]}\n"

    user_content += (
        "Generate the full self-contained interactive HTML lesson now. "
        "Return only the HTML document, no prose, no markdown, no code fences."
    )

    client = _client(api_key=api_key, provider=provider)
    resp = _chat_completion_with_model_fallback(
        client,
        "generate_topic_html",
        provider=provider,
        model=model,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_content},
        ],
    )
    text = _extract_response_text(resp, "generate_topic_html")
    return _extract_html_document(text, "generate_topic_html")


def _parse_json_response(text: str, context_name: str) -> dict:
    normalized = text.strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        normalized = "\n".join(lines).strip()

    try:
        data = json.loads(normalized)
    except json.JSONDecodeError:
        start = normalized.find("{")
        end = normalized.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise OpenAIError(f"{context_name}: model returned invalid JSON")
        try:
            data = json.loads(normalized[start : end + 1])
        except json.JSONDecodeError as exc:
            raise OpenAIError(f"{context_name}: model returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise OpenAIError(f"{context_name}: model returned non-object JSON")
    return data


def generate_topic_quiz(
    course_title: str,
    topic_title: str,
    topic_content: str,
    model: str,
    provider: str = "openai",
    api_key: Optional[str] = None,
) -> List[dict]:
    user_content = (
        f"Course: {course_title}\n"
        f"Topic: {topic_title}\n"
        f"Chapter content:\n{topic_content[:50000]}\n\n"
        "Generate quiz now."
    )

    client = _client(api_key=api_key, provider=provider)
    try:
        resp = _chat_completion_with_model_fallback(
            client,
            "generate_topic_quiz",
            provider=provider,
            model=model,
            messages=[
                {"role": "system", "content": TOPIC_QUIZ_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
        )
    except OpenAIError:
        # Some OpenRouter models may not fully support response_format=json_object.
        resp = _chat_completion_with_model_fallback(
            client,
            "generate_topic_quiz",
            provider=provider,
            model=model,
            messages=[
                {"role": "system", "content": TOPIC_QUIZ_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
    text = _extract_response_text(resp, "generate_topic_quiz")
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
        advice = str(item.get("advice", "")).strip()
        if not question_text:
            raise OpenAIError("generate_topic_quiz: empty question text")
        if not isinstance(options, list) or len(options) != 4:
            raise OpenAIError("generate_topic_quiz: each question must have 4 options")
        normalized_options = [str(opt).strip() for opt in options]
        if any(not opt for opt in normalized_options):
            raise OpenAIError("generate_topic_quiz: empty option found")
        if not isinstance(correct_option_index, int) or correct_option_index < 0 or correct_option_index > 3:
            raise OpenAIError("generate_topic_quiz: invalid correct_option_index")
        if not advice:
            raise OpenAIError("generate_topic_quiz: advice is required for each question")
        normalized.append(
            {
                "question_text": question_text,
                "options": normalized_options,
                "correct_option_index": correct_option_index,
                "advice": advice,
            }
        )
    return normalized


def generate_quiz_advice(
    topic_content: str,
    wrong_answers_payload: List[dict],
    model: str,
    provider: str = "openai",
    api_key: Optional[str] = None,
) -> Dict[int, str]:
    if not wrong_answers_payload:
        return {}

    user_content = (
        f"Chapter content:\n{topic_content[:50000]}\n\n"
        f"Wrong answers payload:\n{json.dumps(wrong_answers_payload, ensure_ascii=False)}"
    )
    client = _client(api_key=api_key, provider=provider)
    try:
        resp = _chat_completion_with_model_fallback(
            client,
            "generate_quiz_advice",
            provider=provider,
            model=model,
            messages=[
                {"role": "system", "content": QUIZ_ADVICE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
        )
    except OpenAIError:
        resp = _chat_completion_with_model_fallback(
            client,
            "generate_quiz_advice",
            provider=provider,
            model=model,
            messages=[
                {"role": "system", "content": QUIZ_ADVICE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
    text = _extract_response_text(resp, "generate_quiz_advice")
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
