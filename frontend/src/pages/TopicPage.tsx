import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { GeneratedTopic, TopicQuiz, TopicQuizResult } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { OpenAILogo } from '../components/OpenAILogo'

const isOpenAIModel = (model: string | null | undefined) => {
  if (!model) return false
  const normalized = model.toLowerCase()
  return normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')
}

export function TopicPage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { topicId } = useParams()
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [contentModel, setContentModel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<TopicQuiz | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const [quizResult, setQuizResult] = useState<TopicQuizResult | null>(null)
  const [quizSubmitting, setQuizSubmitting] = useState(false)

  useEffect(() => {
    const run = async () => {
      if (!token || !topicId) return
      setLoading(true)
      setError(null)
      setContent(null)
      setTitle(null)
      setCourseId(null)
      setContentModel(null)
      setQuiz(null)
      setQuizLoading(false)
      setQuizError(null)
      setSelectedAnswers({})
      setQuizResult(null)
      try {
        const data: GeneratedTopic = await CoursesAPI.generateTopic(topicId)
        setTitle(data.course_title)
        setCourseId(data.course_id)
        setContent(data.content)
        setContentModel(data.content_ai_model)
        setQuizLoading(true)
        try {
          const loadedQuiz = await CoursesAPI.topicQuiz(topicId)
          setQuiz(loadedQuiz)
          setQuizResult(loadedQuiz.last_result ?? null)
        } catch {
          try {
            const generatedQuiz = await CoursesAPI.generateTopicQuiz(topicId)
            setQuiz(generatedQuiz)
            setQuizResult(generatedQuiz.last_result ?? null)
          } catch {
            setQuizError('Ошибка загрузки теста')
          }
        } finally {
          setQuizLoading(false)
        }
      } catch {
        setError('Ошибка генерации контента')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token, topicId])

  const handleSelectAnswer = (questionId: number, optionIndex: number) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionIndex }))
  }

  const handleSubmitQuiz = async () => {
    if (!topicId || !quiz) return
    if (Object.keys(selectedAnswers).length !== quiz.questions.length) {
      setQuizError('Ответьте на все вопросы перед отправкой')
      return
    }
    setQuizSubmitting(true)
    setQuizError(null)
    try {
      const answers = quiz.questions.map(q => ({
        question_id: q.id,
        selected_option_index: selectedAnswers[q.id],
      }))
      const result = await CoursesAPI.submitTopicQuiz(topicId, answers)
      setQuizResult(result)
      const refreshedQuiz = await CoursesAPI.topicQuiz(topicId)
      setQuiz(refreshedQuiz)
      setQuizResult(refreshedQuiz.last_result ?? result)
    } catch {
      setQuizError('Ошибка отправки теста')
    } finally {
      setQuizSubmitting(false)
    }
  }

  const handleRedoQuiz = () => {
    setSelectedAnswers({})
    setQuizResult(null)
    setQuizError(null)
  }

  const getQuestionResult = (questionId: number) => {
    return quizResult?.question_results?.find(item => item.question_id === questionId) ?? null
  }

  return (
    <PageContainer fullWidth>
      <div className="section-stack" style={{ width: '100%', maxWidth: 1440, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8 }}>
            <LoadingPulse />
            <span>Генерируем контент...</span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%', maxWidth: 1360, margin: '0 auto' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h1 className="page-hero-title">{title ? `Курс: ${title}` : 'Глава курса'}</h1>
                {contentModel && (
                  <div className="topic-model-inline">
                    {isOpenAIModel(contentModel) && <OpenAILogo size={11} />}
                    <span>{contentModel}</span>
                  </div>
                )}
              </div>
              {courseId && (
                <Link to={`/courses/${courseId}`} className="btn btn-pill">
                  Все темы
                </Link>
              )}
            </div>
            {error && <p className="status-error" style={{ textAlign: 'center' }}>{error}</p>}
            {content && (
              <div className="surface-card surface-card--light" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                <MarkdownRenderer markdown={content} />
              </div>
            )}
            <section className="surface-card surface-card--light quiz-card" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
              <div className="section-stack" style={{ gap: 16 }}>
                <div>
                  <h2 className="page-title" style={{ marginBottom: 8 }}>Тест по главе</h2>
                  <p className="page-subtitle">5 вопросов для проверки понимания материала.</p>
                  {quiz?.progress.has_attempts && (
                    <p className="status-muted" style={{ marginTop: 8 }}>
                      Последний результат: {quiz.progress.last_score_percent}% (попыток: {quiz.progress.attempts_count})
                    </p>
                  )}
                </div>

                {quizLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LoadingPulse />
                    <span>Генерируем тест...</span>
                  </div>
                )}

                {quizError && <p className="status-error">{quizError}</p>}

                {!quizLoading && quiz && (
                  <>
                    <div className="quiz-list">
                      {quiz.questions.map((question, index) => (
                        <div key={question.id} className="quiz-question">
                          <p className="quiz-question-title">{index + 1}. {question.question_text}</p>
                          {quizResult && (() => {
                            const questionResult = getQuestionResult(question.id)
                            if (!questionResult) return null
                            const isCorrect = questionResult.selected_option_index === questionResult.correct_option_index
                            return (
                              <div className={isCorrect ? 'quiz-question-status quiz-question-status--correct' : 'quiz-question-status quiz-question-status--wrong'}>
                                {isCorrect ? 'Верно' : 'Неверно'}
                              </div>
                            )
                          })()}
                          <div className="quiz-options">
                            {question.options.map((option, optionIndex) => (
                              <label key={`${question.id}_${optionIndex}`} className="quiz-option">
                                <input
                                  type="radio"
                                  name={`question_${question.id}`}
                                  checked={selectedAnswers[question.id] === optionIndex}
                                  onChange={() => handleSelectAnswer(question.id, optionIndex)}
                                />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                          {quizResult && (() => {
                            const questionResult = getQuestionResult(question.id)
                            if (!questionResult) return null
                            const isCorrect = questionResult.selected_option_index === questionResult.correct_option_index
                            if (isCorrect) return null
                            return (
                              <div className="quiz-inline-advice">
                                <p style={{ margin: 0 }}>
                                  Ваш ответ: {question.options[questionResult.selected_option_index] ?? '—'}.
                                  Правильный: {question.options[questionResult.correct_option_index] ?? '—'}.
                                </p>
                                <p style={{ margin: 0 }}>{questionResult.advice}</p>
                              </div>
                            )
                          })()}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-primary" disabled={quizSubmitting} onClick={handleSubmitQuiz}>
                        {quizSubmitting ? 'Проверяем...' : 'Отправить ответы'}
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={quizSubmitting} onClick={handleRedoQuiz}>
                        Переделать
                      </button>
                    </div>
                  </>
                )}

                {quizResult && (
                  <div className="quiz-result">
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      Результат: {quizResult.score_percent}% ({quizResult.correct_answers}/{quizResult.total_questions})
                    </p>
                    {quizResult.wrong_advices.length > 0 ? (
                      <p className="status-muted" style={{ margin: 0 }}>
                        Советы добавлены прямо под каждым неверным вопросом.
                      </p>
                    ) : (
                      <p className="status-muted" style={{ margin: 0 }}>Отличная работа! Все ответы верные.</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </PageContainer>
  )
}


