export type Course = {
  id: number
  title: string
  wishes?: string | null
  ai_provider?: 'openai' | 'openrouter'
  ai_model?: string | null
  has_book?: boolean
  book_name?: string | null
  book_url?: string | null
}

export type CourseSettings = {
  ai_provider: 'openai' | 'openrouter'
  ai_model: string
}

export type Topic = {
  id: number
  title: string
  content_ai_model?: string | null
  last_score_percent?: number | null
  has_passed_quiz?: boolean
  has_attempts?: boolean
  has_html_content?: boolean
}

export type GeneratedTopic = {
  course_title: string
  course_id: number
  topic_id: number
  content: string
  content_ai_model: string
}

export type TopicHtmlContent = {
  topic_id: number
  course_id: number
  course_title: string
  html: string
  ai_provider: 'openai' | 'openrouter'
  ai_model: string
  generated_at: string
}

export type TopicQuizQuestion = {
  id: number
  question_text: string
  options: string[]
}

export type TopicQuizProgress = {
  has_attempts: boolean
  last_score_percent: number | null
  attempts_count: number
}

export type TopicQuiz = {
  topic_id: number
  questions: TopicQuizQuestion[]
  progress: TopicQuizProgress
  last_result?: TopicQuizResult | null
}

export type WrongAnswerAdvice = {
  question_id: number
  question_text: string
  selected_option_index: number
  correct_option_index: number
  advice: string
}

export type TopicQuizResult = {
  score_percent: number
  total_questions: number
  correct_answers: number
  wrong_advices: WrongAnswerAdvice[]
  question_results: WrongAnswerAdvice[]
}

export type AuthState = {
  isAuthenticated: boolean
  username: string | null
  token: string | null
}
