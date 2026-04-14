export type Course = {
  id: number
  title: string
}

export type Topic = {
  id: number
  title: string
  last_score_percent?: number | null
  has_passed_quiz?: boolean
  has_attempts?: boolean
}

export type GeneratedTopic = {
  course_title: string
  course_id: number
  topic_id: number
  content: string
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


