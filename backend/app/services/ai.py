from typing import List
import os

from langchain.schema import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableLambda
from openai import OpenAI

from ..core.config import settings


def _client() -> OpenAI:
    if settings.OPENAI_API_KEY:
        os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY  # nosec
    for var in ("OPENAI_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        if os.environ.get(var):
            os.environ.pop(var, None)
    os.environ["NO_PROXY"] = "*"
    return OpenAI()


def generate_course_outline(title: str, wishes: str) -> List[str]:
    sys = (
        "You are an expert curriculum designer. Create a comprehensive 15-week course outline. "
        "Each week must be a concise, self-contained topic title, max 10 words, no numbering. "
        "Follow user preferences carefully and avoid duplicates. Respond with one title per line only."
    )
    user = f"Course title: {title}\nPreferences: {wishes}\nReturn exactly 15 unique topics, one per line."
    client = _client()
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
    )
    text = resp.choices[0].message.content or ""
    lines = [line.strip("- •\t ") for line in text.splitlines() if line.strip()]
    return lines[:15] if len(lines) >= 15 else lines


def generate_topic_content(course_title: str, wishes: str, topic_title: str) -> str:
    sys = (
        "You are an expert instructor. Write a structured, practical lesson content for the given topic. "
        "Audience: motivated adult learners. The output MUST be in clean, well-structured Markdown with headings and subheadings, code blocks where relevant, and proper emphasis. "
        "Write in a book-like narrative style with flowing paragraphs rather than bullet lists. Avoid lists and bullet points unless absolutely necessary (e.g., a short 3-5 item summary). "
        "Prefer rich explanatory paragraphs that connect ideas smoothly; convert any potential lists into cohesive prose. "
        "Always produce a long, in-depth article (aim for 900-1500+ words). If the topic is simple, enrich the content with helpful material such as detailed examples, interesting facts, practical tips, pitfalls, FAQs, and further reading. "
        "Include clear learning objectives, key concepts, multiple examples, and a short assignment at the end, all written primarily as paragraphs (minimal lists)."
    )
    user = f"Course: {course_title}\nPreferences: {wishes}\nTopic: {topic_title}\nGenerate the lesson content now."
    client = _client()
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
    )
    return (resp.choices[0].message.content or "").strip()

