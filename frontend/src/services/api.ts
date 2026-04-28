const API_BASE_URL = 'http://localhost:8000'

export function getApiBaseUrl(): string {
  return API_BASE_URL
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem('access_token')
  } catch {
    return null
  }
}

export function setAuth(token: string, username: string) {
  localStorage.setItem('access_token', token)
  localStorage.setItem('username', username)
}

export function clearAuth() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('username')
}

export async function apiFetch<T>(path: string, options: { method?: HttpMethod; body?: unknown; auth?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const { method = 'GET', body, auth = false, headers = {} } = options
  const url = `${API_BASE_URL}${path}`
  const token = getAccessToken()

  const isFormData = body instanceof FormData

  const init: RequestInit = {
    method,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? (isFormData ? body as BodyInit : JSON.stringify(body)) : undefined,
  }

  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || res.statusText)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>
  }
  return undefined as unknown as T
}

export const AuthAPI = {
  async login(payload: { username: string; password: string }): Promise<{ access_token: string; token_type?: string }> {
    return apiFetch('/auth/login', { method: 'POST', body: payload })
  },
  async register(payload: { username: string; email: string; password: string }): Promise<void> {
    await apiFetch('/auth/register', { method: 'POST', body: payload })
  },
  async apiKeys(): Promise<{ has_openai_key: boolean; has_openrouter_key: boolean }> {
    return apiFetch('/auth/api-keys', { auth: true })
  },
  async updateApiKeys(payload: { openai_api_key?: string; openrouter_api_key?: string }): Promise<{ has_openai_key: boolean; has_openrouter_key: boolean }> {
    return apiFetch('/auth/api-keys', { method: 'PATCH', auth: true, body: payload })
  },
}

export type TopicHtmlContentDto = {
  topic_id: number
  course_id: number
  course_title: string
  html: string
  ai_provider: 'openai' | 'openrouter'
  ai_model: string
  generated_at: string
}

export const CoursesAPI = {
  async myCourses(): Promise<Array<{
    id: number
    title: string
    wishes?: string | null
    ai_provider?: 'openai' | 'openrouter'
    ai_model?: string | null
    has_book?: boolean
    book_name?: string | null
    book_url?: string | null
  }>> {
    return apiFetch('/courses/mine', { auth: true })
  },
  async outline(payload: { title: string; wishes: string; ai_provider: 'openai' | 'openrouter'; ai_model: string; file?: File }): Promise<{ course_id: number; topics: Array<{ id: number; title: string }> }> {
    const formData = new FormData()
    formData.append('title', payload.title)
    formData.append('wishes', payload.wishes)
    formData.append('ai_provider', payload.ai_provider)
    formData.append('ai_model', payload.ai_model)
    if (payload.file) {
      formData.append('file', payload.file)
    }
    return apiFetch('/courses/outline', { method: 'POST', body: formData, auth: true })
  },
  async courseTopics(courseId: number | string): Promise<Array<{
    id: number
    title: string
    content_ai_model?: string | null
    last_score_percent?: number | null
    has_passed_quiz?: boolean
    has_attempts?: boolean
    has_html_content?: boolean
  }>> {
    return apiFetch(`/courses/${courseId}/topics`, { auth: true })
  },
  async generateTopic(topicId: number | string): Promise<{
    course_title: string
    course_id: number
    topic_id: number
    content: string
    content_ai_model: string
  }> {
    return apiFetch(`/courses/topics/${topicId}/generate`, { method: 'POST', auth: true })
  },
  async topicQuiz(topicId: number | string): Promise<{
    topic_id: number
    questions: Array<{ id: number; question_text: string; options: string[] }>
    progress: { has_attempts: boolean; last_score_percent: number | null; attempts_count: number }
    last_result?: {
      score_percent: number
      total_questions: number
      correct_answers: number
      wrong_advices: Array<{
        question_id: number
        question_text: string
        selected_option_index: number
        correct_option_index: number
        advice: string
      }>
      question_results: Array<{
        question_id: number
        question_text: string
        selected_option_index: number
        correct_option_index: number
        advice: string
      }>
    } | null
  }> {
    return apiFetch(`/courses/topics/${topicId}/quiz`, { auth: true })
  },
  async generateTopicQuiz(topicId: number | string): Promise<{
    topic_id: number
    questions: Array<{ id: number; question_text: string; options: string[] }>
    progress: { has_attempts: boolean; last_score_percent: number | null; attempts_count: number }
    last_result?: {
      score_percent: number
      total_questions: number
      correct_answers: number
      wrong_advices: Array<{
        question_id: number
        question_text: string
        selected_option_index: number
        correct_option_index: number
        advice: string
      }>
      question_results: Array<{
        question_id: number
        question_text: string
        selected_option_index: number
        correct_option_index: number
        advice: string
      }>
    } | null
  }> {
    return apiFetch(`/courses/topics/${topicId}/quiz/generate`, { method: 'POST', auth: true })
  },
  async submitTopicQuiz(
    topicId: number | string,
    answers: Array<{ question_id: number; selected_option_index: number }>
  ): Promise<{
    score_percent: number
    total_questions: number
    correct_answers: number
    wrong_advices: Array<{
      question_id: number
      question_text: string
      selected_option_index: number
      correct_option_index: number
      advice: string
    }>
    question_results: Array<{
      question_id: number
      question_text: string
      selected_option_index: number
      correct_option_index: number
      advice: string
    }>
  }> {
    return apiFetch(`/courses/topics/${topicId}/quiz/submit`, {
      method: 'POST',
      auth: true,
      body: { answers },
    })
  },
  async topicHtml(topicId: number | string): Promise<TopicHtmlContentDto> {
    return apiFetch(`/courses/topics/${topicId}/content/html`, { auth: true })
  },
  async generateTopicHtml(topicId: number | string): Promise<TopicHtmlContentDto> {
    return apiFetch(`/courses/topics/${topicId}/content/html`, { method: 'POST', auth: true })
  },
  async deleteCourse(courseId: number | string): Promise<void> {
    await apiFetch(`/courses/${courseId}`, { method: 'DELETE', auth: true })
  },
  async courseSettings(courseId: number | string): Promise<{ ai_provider: 'openai' | 'openrouter'; ai_model: string }> {
    return apiFetch(`/courses/${courseId}/settings`, { auth: true })
  },
  async updateCourseSettings(
    courseId: number | string,
    payload: { ai_provider: 'openai' | 'openrouter'; ai_model: string }
  ): Promise<{ ai_provider: 'openai' | 'openrouter'; ai_model: string }> {
    return apiFetch(`/courses/${courseId}/settings`, { method: 'PATCH', auth: true, body: payload })
  },
  async fetchCourseBookBlob(courseId: number | string): Promise<Blob> {
    const token = getAccessToken()
    const res = await fetch(`${API_BASE_URL}/courses/${courseId}/book`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || res.statusText)
    }
    return res.blob()
  },
  async openCourseBook(courseId: number | string): Promise<string> {
    const blob = await this.fetchCourseBookBlob(courseId)
    return URL.createObjectURL(blob)
  },
}
