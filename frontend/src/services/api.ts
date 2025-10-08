const API_BASE_URL = 'http://localhost:8000'

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

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
}

export const CoursesAPI = {
  async myCourses(): Promise<Array<{ id: number; title: string }>> {
    return apiFetch('/courses/mine', { auth: true })
  },
  async outline(payload: { title: string; wishes: string }): Promise<{ course_id: number; topics: Array<{ id: number; title: string }> }> {
    return apiFetch('/courses/outline', { method: 'POST', body: payload, auth: true })
  },
  async courseTopics(courseId: number | string): Promise<Array<{ id: number; title: string }>> {
    return apiFetch(`/courses/${courseId}/topics`, { auth: true })
  },
  async generateTopic(topicId: number | string): Promise<{ course_title: string; course_id: number; topic_id: number; content: string }> {
    return apiFetch(`/courses/topics/${topicId}/generate`, { method: 'POST', auth: true })
  },
}


