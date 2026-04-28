import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { TopicPage } from './TopicPage'

const { mockCoursesApi } = vi.hoisted(() => ({
  mockCoursesApi: {
    topicMeta: vi.fn(),
    courseSettings: vi.fn(),
    generateTopic: vi.fn(),
    streamTopic: vi.fn(),
    streamTopicHtml: vi.fn(),
    topicQuiz: vi.fn(),
    generateTopicQuiz: vi.fn(),
    submitTopicQuiz: vi.fn(),
    topicHtml: vi.fn(),
    generateTopicHtml: vi.fn(),
  },
}))

vi.mock('../services/api', () => ({
  CoursesAPI: mockCoursesApi,
}))

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  },
  configurable: true,
})

const SAMPLE_HTML = '<!doctype html><html><body><main><h1>Lesson</h1></main></body></html>'

const baseQuiz = {
  topic_id: 100,
  questions: Array.from({ length: 5 }, (_, idx) => ({
    id: idx + 1,
    question_text: `Question ${idx + 1}`,
    options: ['A', 'B', 'C', 'D'],
  })),
  progress: { has_attempts: false, last_score_percent: null, attempts_count: 0 },
}

const baseTopicMeta = {
  topic_id: 100,
  course_id: 10,
  course_title: 'Demo',
  topic_title: 'Topic 1',
  content_ai_model: 'gpt-5-mini',
  has_text_content: false,
  has_html_content: false,
}

describe('TopicPage quiz flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    mockCoursesApi.topicMeta.mockResolvedValue(baseTopicMeta)
    mockCoursesApi.courseSettings.mockResolvedValue({
      ai_provider: 'openai',
      ai_model: 'gpt-5-mini',
      content_format: 'text',
    })
    mockCoursesApi.topicHtml.mockRejectedValue(new Error('not-found'))
    mockCoursesApi.generateTopicHtml.mockResolvedValue({
      topic_id: 100,
      course_id: 10,
      course_title: 'Demo',
      html: SAMPLE_HTML,
      ai_provider: 'openai',
      ai_model: 'gpt-5-mini',
      generated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    })
  })

  it('submits quiz, shows result and resets on redo', async () => {
    localStorage.setItem('access_token', 'token')

    mockCoursesApi.streamTopic.mockImplementation(async (_topicId: unknown, onEvent: (event: unknown) => void) => {
      onEvent({ type: 'started', topic_id: 100, course_id: 10, ai_model: 'gpt-5-mini', ai_provider: 'openai', course_title: 'Demo' })
      onEvent({ type: 'chunk', delta: 'Chapter body' })
      onEvent({ type: 'done', from_cache: false, content: 'Chapter body', ai_model: 'gpt-5-mini' })
    })
    mockCoursesApi.topicQuiz
      .mockRejectedValueOnce(new Error('not-found'))
      .mockResolvedValueOnce({
        ...baseQuiz,
        progress: { has_attempts: true, last_score_percent: 60, attempts_count: 1 },
      })
    mockCoursesApi.generateTopicQuiz.mockResolvedValue(baseQuiz)
    mockCoursesApi.submitTopicQuiz.mockResolvedValue({
      score_percent: 60,
      total_questions: 5,
      correct_answers: 3,
      wrong_advices: [
        {
          question_id: 2,
          question_text: 'Question 2',
          selected_option_index: 0,
          correct_option_index: 1,
          advice: 'Review concept 2',
        },
      ],
      question_results: [
        { question_id: 1, question_text: 'Question 1', selected_option_index: 0, correct_option_index: 0, advice: '' },
        { question_id: 2, question_text: 'Question 2', selected_option_index: 0, correct_option_index: 1, advice: 'Review concept 2' },
        { question_id: 3, question_text: 'Question 3', selected_option_index: 0, correct_option_index: 0, advice: '' },
        { question_id: 4, question_text: 'Question 4', selected_option_index: 0, correct_option_index: 1, advice: 'Review concept 4' },
        { question_id: 5, question_text: 'Question 5', selected_option_index: 0, correct_option_index: 0, advice: '' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/topics/100']}>
        <Routes>
          <Route path="/topics/:topicId" element={<TopicPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByText('Тест по главе')

    const user = userEvent.setup()
    for (let i = 1; i <= 5; i += 1) {
      await user.click(screen.getAllByLabelText('A')[i - 1])
    }

    await user.click(screen.getByRole('button', { name: 'Отправить ответы' }))

    await screen.findByText(/Результат: 60%/)
    expect(screen.getByText('Review concept 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Переделать' }))
    await waitFor(() => {
      expect(screen.queryByText(/Результат: 60%/)).not.toBeInTheDocument()
    })
  })
})

describe('TopicPage interactive lesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    mockCoursesApi.topicMeta.mockResolvedValue({
      ...baseTopicMeta,
      has_text_content: false,
    })
    mockCoursesApi.courseSettings.mockResolvedValue({
      ai_provider: 'openai',
      ai_model: 'gpt-5-mini',
      content_format: 'interactive',
    })
  })

  it('renders existing interactive html and hides markdown content', async () => {
    localStorage.setItem('access_token', 'token')

    mockCoursesApi.topicHtml.mockResolvedValue({
      topic_id: 100,
      course_id: 10,
      course_title: 'Demo',
      html: SAMPLE_HTML,
      ai_provider: 'openai',
      ai_model: 'gpt-5-mini',
      generated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    })
    mockCoursesApi.streamTopicHtml.mockResolvedValue(undefined)

    render(
      <MemoryRouter initialEntries={['/topics/100']}>
        <Routes>
          <Route path="/topics/:topicId" element={<TopicPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByText('Интерактивная глава готова')
    expect(mockCoursesApi.streamTopic).not.toHaveBeenCalled()

    const iframe = document.querySelector('iframe[title="Глава: Demo"]') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')

    expect(screen.getByRole('button', { name: 'Перегенерировать' })).toBeInTheDocument()
  })

  it('generates interactive lesson on click when none exists yet', async () => {
    localStorage.setItem('access_token', 'token')

    mockCoursesApi.topicHtml.mockRejectedValue(new Error('not-found'))
    mockCoursesApi.streamTopicHtml.mockImplementation(async (_topicId: unknown, onEvent: (event: unknown) => void) => {
      onEvent({ type: 'started', topic_id: 100, course_id: 10, ai_model: 'gpt-5-mini', ai_provider: 'openai', course_title: 'Demo' })
      onEvent({ type: 'chunk', delta: SAMPLE_HTML })
      onEvent({
        type: 'done',
        html: SAMPLE_HTML,
        ai_model: 'gpt-5-mini',
        ai_provider: 'openai',
        generated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
      })
    })

    render(
      <MemoryRouter initialEntries={['/topics/100']}>
        <Routes>
          <Route path="/topics/:topicId" element={<TopicPage />} />
        </Routes>
      </MemoryRouter>
    )

    const triggerButton = await screen.findByRole('button', { name: 'Сгенерировать интерактивную главу' })
    expect(mockCoursesApi.streamTopic).not.toHaveBeenCalled()

    const user = userEvent.setup()
    await user.click(triggerButton)

    await waitFor(() => {
      expect(mockCoursesApi.streamTopicHtml).toHaveBeenCalledWith('100', expect.any(Function), expect.any(AbortSignal))
    })
    await screen.findByText('Интерактивная глава готова')
  })
})
