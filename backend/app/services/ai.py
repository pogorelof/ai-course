from typing import List, Optional
import os

from langchain.schema import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableLambda
from openai import OpenAI
import httpx
import pypdf

from ..core.config import settings


def _client() -> OpenAI:
    if settings.OPENAI_API_KEY:
        os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY  # nosec
    proxies: dict | None = None
    http_client = None
    if settings.PROXY_URL:
        # Route both http and https via a single upstream proxy URL
        proxies = {
            "http://": settings.PROXY_URL,
            "https://": settings.PROXY_URL,
        }
        http_client = httpx.Client(proxies=proxies, timeout=60)
    return OpenAI(http_client=http_client)


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
    sys = (
        "You are an expert curriculum designer. Create a comprehensive 15-week course outline. "
        "Each week must be a concise, self-contained topic title, max 10 words, no numbering. "
        "Follow user preferences carefully and avoid duplicates. Respond with one title per line only."
    )
    
    user_content = f"Course title: {title}\nPreferences: {wishes}\n"
    
    if pdf_text:
        sys += " USE THE PROVIDED PDF CONTENT AS THE PRIMARY SOURCE MATERIAL FOR THE COURSE STRUCTURE."
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
    sys = (
        "You are an expert instructor. Write a structured, practical lesson content for the given topic. "
        "Audience: motivated adult learners. The output MUST be in clean, well-structured Markdown with headings and subheadings, code blocks where relevant, and proper emphasis. "
        "Write in a book-like narrative style with flowing paragraphs rather than bullet lists. Avoid lists and bullet points unless absolutely necessary (e.g., a short 3-5 item summary). "
        "Prefer rich explanatory paragraphs that connect ideas smoothly; convert any potential lists into cohesive prose. "
        "Always produce a long, in-depth article (aim for 900-1500+ words). If the topic is simple, enrich the content with helpful material such as detailed examples, interesting facts, practical tips, pitfalls, FAQs, and further reading. "
        "Include clear learning objectives, key concepts, multiple examples, and a short assignment at the end, all written primarily as paragraphs (minimal lists)."
    )
    
    user_content = f"Course: {course_title}\nPreferences: {wishes}\nTopic: {topic_title}\n"
    
    if pdf_text:
        sys += " USE THE PROVIDED PDF CONTENT AS THE PRIMARY SOURCE MATERIAL FOR THE LESSON CONTENT. Extract relevant details, examples, and explanations from the PDF."
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
