import asyncio
import json
import os
import threading
from typing import AsyncIterator, Dict, List, Optional

import httpx
import pypdf
from openai import AsyncOpenAI, OpenAIError

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
PDF_TEXT_MAX_CHARS = 50_000
HTTPX_TIMEOUT_SECONDS = 180.0


# ---------------------------------------------------------------------------
# Reasoning controls.
#
# Reasoning-capable model families benefit from a configurable thinking budget.
# For everything else we silently drop the parameter so providers don't reject
# the request. The list is matched on a normalized base id so OpenRouter's
# ``vendor/model`` and ``model:nitro`` variants resolve correctly.
# ---------------------------------------------------------------------------

SUPPORTED_REASONING_EFFORTS = ("minimal", "low", "medium", "high")
_REASONING_PROVIDER_PREFIXES = ("openai/", "anthropic/", "google/", "deepseek/")
_REASONING_MODEL_PREFIXES = (
    "gpt-5",
    "claude-",
    "deepseek-v4-pro",
    "gemini-3.1-pro",
    "o1",
    "o3",
    "o4",
)


def _normalize_model_name(model: str) -> str:
    base = (model or "").strip().lower()
    if base.endswith(":nitro"):
        base = base[: -len(":nitro")]
    for prefix in _REASONING_PROVIDER_PREFIXES:
        if base.startswith(prefix):
            base = base[len(prefix) :]
            break
    return base


def model_supports_reasoning(model: str) -> bool:
    base = _normalize_model_name(model)
    return any(base.startswith(prefix) for prefix in _REASONING_MODEL_PREFIXES)


def _reasoning_kwargs(model: str, reasoning_effort: Optional[str]) -> dict:
    """Build the ``extra_body`` payload for a single chat completion call.

    Returns an empty dict for non-reasoning models so providers like OpenAI
    don't reject the request with "unknown parameter" on gpt-4-class models.
    """
    if not reasoning_effort:
        return {}
    effort = reasoning_effort.strip().lower()
    if effort not in SUPPORTED_REASONING_EFFORTS:
        return {}
    if not model_supports_reasoning(model):
        return {}
    return {"extra_body": {"reasoning_effort": effort}}


# ---------------------------------------------------------------------------
# Async OpenAI client cache (singleton per (provider, api_key)).
#
# Reusing the same AsyncOpenAI / httpx.AsyncClient across requests keeps the
# TLS connection alive and removes the per-request handshake overhead.
# ---------------------------------------------------------------------------

_async_clients: Dict[tuple[str, str], AsyncOpenAI] = {}
_async_clients_lock = threading.Lock()


def _make_async_client(api_key: str, provider: str) -> AsyncOpenAI:
    http_client = httpx.AsyncClient(timeout=HTTPX_TIMEOUT_SECONDS)
    if provider == "openrouter":
        return AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            http_client=http_client,
        )
    return AsyncOpenAI(api_key=api_key, http_client=http_client)


def _get_async_client(api_key: Optional[str], provider: str) -> AsyncOpenAI:
    resolved = (api_key or "").strip()
    if not resolved:
        raise OpenAIError(f"{provider} API key is not configured for this account.")
    cache_key = (provider, resolved)
    client = _async_clients.get(cache_key)
    if client is not None:
        return client
    with _async_clients_lock:
        client = _async_clients.get(cache_key)
        if client is not None:
            return client
        client = _make_async_client(resolved, provider)
        _async_clients[cache_key] = client
        return client


# ---------------------------------------------------------------------------
# PDF text cache (key: absolute path; invalidated by mtime + size).
# ---------------------------------------------------------------------------

_pdf_cache: Dict[str, tuple[float, int, str]] = {}
_pdf_cache_lock = threading.Lock()


def extract_text_from_pdf(file_path: str) -> str:
    if not file_path:
        return ""
    try:
        st = os.stat(file_path)
    except OSError:
        return ""

    cached = _pdf_cache.get(file_path)
    if cached and cached[0] == st.st_mtime and cached[1] == st.st_size:
        return cached[2]

    try:
        reader = pypdf.PdfReader(file_path)
        parts: List[str] = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                parts.append("")
        text = "\n".join(parts)
    except Exception as exc:
        print(f"Error extracting text from PDF: {exc}")
        return ""

    with _pdf_cache_lock:
        _pdf_cache[file_path] = (st.st_mtime, st.st_size, text)
    return text


# ---------------------------------------------------------------------------
# Helpers for building messages so the static prefix benefits from prompt
# caching on the OpenAI side: system prompt + (optional) PDF source first,
# then the small variable user task at the end.
# ---------------------------------------------------------------------------


def _build_messages(
    system_prompt: str,
    pdf_text: Optional[str],
    pdf_appendix: str,
    user_task: str,
) -> List[dict]:
    messages: List[dict] = []
    sys_text = system_prompt + (pdf_appendix if pdf_text else "")
    messages.append({"role": "system", "content": sys_text})
    if pdf_text:
        truncated = pdf_text[:PDF_TEXT_MAX_CHARS]
        messages.append(
            {
                "role": "system",
                "content": f"PDF source material (verbatim, do not quote it):\n{truncated}",
            }
        )
    messages.append({"role": "user", "content": user_task})
    return messages


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


async def _safe_chat_completion_create(client: AsyncOpenAI, context_name: str, **kwargs):
    try:
        return await client.chat.completions.create(**kwargs)
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


async def _chat_completion_with_model_fallback(
    client: AsyncOpenAI,
    context_name: str,
    provider: str,
    model: str,
    reasoning_effort: Optional[str] = None,
    **kwargs,
):
    model_candidates = _openrouter_model_candidates(model) if provider == "openrouter" else [model]
    last_error: Optional[OpenAIError] = None
    for candidate in model_candidates:
        try:
            extra = _reasoning_kwargs(candidate, reasoning_effort)
            merged = {**kwargs}
            if extra:
                merged_extra_body = dict(merged.get("extra_body") or {})
                merged_extra_body.update(extra["extra_body"])
                merged["extra_body"] = merged_extra_body
            return await _safe_chat_completion_create(
                client,
                context_name,
                model=candidate,
                **merged,
            )
        except OpenAIError as exc:
            last_error = exc
            continue

    if last_error is not None:
        raise OpenAIError(f"{context_name}: failed for model '{model}' ({last_error})")
    raise OpenAIError(f"{context_name}: failed for model '{model}'")


async def _chat_completion_json(
    client: AsyncOpenAI,
    context_name: str,
    provider: str,
    model: str,
    messages: List[dict],
    reasoning_effort: Optional[str] = None,
):
    """Run a chat completion that must return JSON.

    OpenAI reliably honours ``response_format={"type":"json_object"}``; only
    OpenRouter has heterogeneous backends that may reject it, so we keep the
    fallback exclusively for OpenRouter to avoid a redundant second roundtrip
    on OpenAI.
    """
    primary_kwargs = dict(messages=messages, response_format={"type": "json_object"})
    try:
        return await _chat_completion_with_model_fallback(
            client,
            context_name,
            provider=provider,
            model=model,
            reasoning_effort=reasoning_effort,
            **primary_kwargs,
        )
    except OpenAIError:
        if provider != "openrouter":
            raise
        return await _chat_completion_with_model_fallback(
            client,
            context_name,
            provider=provider,
            model=model,
            reasoning_effort=reasoning_effort,
            messages=messages,
        )


# ---------------------------------------------------------------------------
# Public async generators (non-streaming).
# ---------------------------------------------------------------------------


async def generate_course_outline(
    title: str,
    wishes: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> List[str]:
    user_task = (
        f"Course title: {title}\n"
        f"Preferences: {wishes}\n"
        "Return exactly 15 unique topics, one per line."
    )
    messages = _build_messages(
        COURSE_OUTLINE_SYSTEM_PROMPT,
        pdf_text,
        COURSE_OUTLINE_PDF_APPENDIX,
        user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    resp = await _chat_completion_with_model_fallback(
        client,
        "generate_course_outline",
        provider=provider,
        model=model,
        reasoning_effort=reasoning_effort,
        messages=messages,
    )
    text = _extract_response_text(resp, "generate_course_outline")
    lines = [line.strip("- •\t ") for line in text.splitlines() if line.strip()]
    return lines[:15] if len(lines) >= 15 else lines


async def generate_topic_content(
    course_title: str,
    wishes: str,
    topic_title: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> str:
    user_task = (
        f"Course: {course_title}\n"
        f"Preferences: {wishes}\n"
        f"Topic: {topic_title}\n"
        "Generate the lesson content now."
    )
    messages = _build_messages(
        TOPIC_CONTENT_SYSTEM_PROMPT,
        pdf_text,
        TOPIC_CONTENT_PDF_APPENDIX,
        user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    resp = await _chat_completion_with_model_fallback(
        client,
        "generate_topic_content",
        provider=provider,
        model=model,
        reasoning_effort=reasoning_effort,
        messages=messages,
    )
    return _extract_response_text(resp, "generate_topic_content")


async def stream_topic_content(
    course_title: str,
    wishes: str,
    topic_title: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> AsyncIterator[str]:
    user_task = (
        f"Course: {course_title}\n"
        f"Preferences: {wishes}\n"
        f"Topic: {topic_title}\n"
        "Generate the lesson content now."
    )
    messages = _build_messages(
        TOPIC_CONTENT_SYSTEM_PROMPT,
        pdf_text,
        TOPIC_CONTENT_PDF_APPENDIX,
        user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    candidates = _openrouter_model_candidates(model) if provider == "openrouter" else [model]

    last_error: Optional[OpenAIError] = None
    for candidate in candidates:
        try:
            extra = _reasoning_kwargs(candidate, reasoning_effort)
            stream = await client.chat.completions.create(
                model=candidate,
                messages=messages,
                stream=True,
                **extra,
            )
        except OpenAIError as exc:
            last_error = exc
            continue
        except Exception as exc:
            last_error = OpenAIError(
                f"stream_topic_content: upstream stream open failed ({exc})"
            )
            continue

        async for chunk in stream:
            try:
                delta = chunk.choices[0].delta
            except (IndexError, AttributeError):
                continue
            piece = getattr(delta, "content", None)
            if piece:
                yield piece
        return

    if last_error is not None:
        raise OpenAIError(f"stream_topic_content: failed for model '{model}' ({last_error})")
    raise OpenAIError(f"stream_topic_content: failed for model '{model}'")


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


async def generate_topic_html(
    course_title: str,
    wishes: str,
    topic_title: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> str:
    user_task = (
        f"Course: {course_title}\n"
        f"Preferences: {wishes}\n"
        f"Topic: {topic_title}\n"
        "Generate the full self-contained interactive HTML lesson now. "
        "Return only the HTML document, no prose, no markdown, no code fences."
    )
    messages = _build_messages(
        TOPIC_HTML_SYSTEM_PROMPT,
        pdf_text,
        TOPIC_HTML_PDF_APPENDIX,
        user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    resp = await _chat_completion_with_model_fallback(
        client,
        "generate_topic_html",
        provider=provider,
        model=model,
        reasoning_effort=reasoning_effort,
        messages=messages,
    )
    text = _extract_response_text(resp, "generate_topic_html")
    return _extract_html_document(text, "generate_topic_html")


async def stream_topic_html(
    course_title: str,
    wishes: str,
    topic_title: str,
    model: str,
    provider: str = "openai",
    pdf_text: Optional[str] = None,
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> AsyncIterator[str]:
    user_task = (
        f"Course: {course_title}\n"
        f"Preferences: {wishes}\n"
        f"Topic: {topic_title}\n"
        "Generate the full self-contained interactive HTML lesson now. "
        "Return only the HTML document, no prose, no markdown, no code fences."
    )
    messages = _build_messages(
        TOPIC_HTML_SYSTEM_PROMPT,
        pdf_text,
        TOPIC_HTML_PDF_APPENDIX,
        user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    candidates = _openrouter_model_candidates(model) if provider == "openrouter" else [model]

    last_error: Optional[OpenAIError] = None
    for candidate in candidates:
        try:
            extra = _reasoning_kwargs(candidate, reasoning_effort)
            stream = await client.chat.completions.create(
                model=candidate,
                messages=messages,
                stream=True,
                **extra,
            )
        except OpenAIError as exc:
            last_error = exc
            continue
        except Exception as exc:
            last_error = OpenAIError(
                f"stream_topic_html: upstream stream open failed ({exc})"
            )
            continue

        async for chunk in stream:
            try:
                delta = chunk.choices[0].delta
            except (IndexError, AttributeError):
                continue
            piece = getattr(delta, "content", None)
            if piece:
                yield piece
        return

    if last_error is not None:
        raise OpenAIError(f"stream_topic_html: failed for model '{model}' ({last_error})")
    raise OpenAIError(f"stream_topic_html: failed for model '{model}'")


def _parse_json_response(text: str, context_name: str) -> dict:
    normalized = _strip_code_fences(text)
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


async def generate_topic_quiz(
    course_title: str,
    topic_title: str,
    topic_content: str,
    model: str,
    provider: str = "openai",
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> List[dict]:
    user_task = (
        f"Course: {course_title}\n"
        f"Topic: {topic_title}\n"
        f"Chapter content:\n{topic_content[:50000]}\n\n"
        "Generate quiz now."
    )
    messages = _build_messages(
        TOPIC_QUIZ_SYSTEM_PROMPT,
        pdf_text=None,
        pdf_appendix="",
        user_task=user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    resp = await _chat_completion_json(
        client,
        "generate_topic_quiz",
        provider=provider,
        model=model,
        messages=messages,
        reasoning_effort=reasoning_effort,
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


async def generate_quiz_advice(
    topic_content: str,
    wrong_answers_payload: List[dict],
    model: str,
    provider: str = "openai",
    api_key: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> Dict[int, str]:
    if not wrong_answers_payload:
        return {}

    user_task = (
        f"Chapter content:\n{topic_content[:50000]}\n\n"
        f"Wrong answers payload:\n{json.dumps(wrong_answers_payload, ensure_ascii=False)}"
    )
    messages = _build_messages(
        QUIZ_ADVICE_SYSTEM_PROMPT,
        pdf_text=None,
        pdf_appendix="",
        user_task=user_task,
    )
    client = _get_async_client(api_key=api_key, provider=provider)
    resp = await _chat_completion_json(
        client,
        "generate_quiz_advice",
        provider=provider,
        model=model,
        messages=messages,
        reasoning_effort=reasoning_effort,
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


# ---------------------------------------------------------------------------
# Helper used by the queue worker to ensure a freshly-resolved HTML payload
# does not exceed the same validation invariants as the non-streaming path.
# ---------------------------------------------------------------------------


def validate_html_document(text: str, context_name: str = "generate_topic_html") -> str:
    return _extract_html_document(text, context_name)


__all__ = [
    "MAX_HTML_DOCUMENT_LENGTH",
    "PDF_TEXT_MAX_CHARS",
    "SUPPORTED_REASONING_EFFORTS",
    "extract_text_from_pdf",
    "generate_course_outline",
    "generate_quiz_advice",
    "generate_topic_content",
    "generate_topic_html",
    "generate_topic_quiz",
    "model_supports_reasoning",
    "stream_topic_content",
    "stream_topic_html",
    "validate_html_document",
]


# Silence unused-imports warnings on `asyncio` if linters strip it; the import
# is kept for downstream callers that import this module.
_ = asyncio
