import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { TopicPage } from './TopicPage'

const { mockCoursesApi } = vi.hoisted(() => ({
  mockCoursesApi: {
    generateTopic: vi.fn(),
    topicQuiz: vi.fn(),
    generateTopicQuiz: vi.fn(),
    submitTopicQuiz: vi.fn(),
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

describe('TopicPage quiz flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
  })

  it('submits quiz, shows result and resets on redo', async () => {
    localStorage.setItem('access_token', 'token')

    mockCoursesApi.generateTopic.mockResolvedValue({
      course_title: 'Demo',
      course_id: 10,
      topic_id: 100,
      content: 'Chapter body',
    })
    mockCoursesApi.topicQuiz
      .mockRejectedValueOnce(new Error('not-found'))
      .mockResolvedValueOnce({
        topic_id: 100,
        questions: Array.from({ length: 5 }, (_, idx) => ({
          id: idx + 1,
          question_text: `Question ${idx + 1}`,
          options: ['A', 'B', 'C', 'D'],
        })),
        progress: { has_attempts: true, last_score_percent: 60, attempts_count: 1 },
      })
    mockCoursesApi.generateTopicQuiz.mockResolvedValue({
      topic_id: 100,
      questions: Array.from({ length: 5 }, (_, idx) => ({
        id: idx + 1,
        question_text: `Question ${idx + 1}`,
        options: ['A', 'B', 'C', 'D'],
      })),
      progress: { has_attempts: false, last_score_percent: null, attempts_count: 0 },
    })
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
