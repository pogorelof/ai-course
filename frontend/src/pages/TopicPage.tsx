import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { TopicHtmlContentDto } from '../services/api'
import type { ContentFormat, GeneratedTopic, TopicQuiz, TopicQuizResult } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { InteractiveContentFrame } from '../components/InteractiveContentFrame'
import { ModelLogo } from '../components/ModelLogo'

function formatGeneratedAt(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleString()
  } catch {
    return null
  }
}

export function TopicPage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { topicId } = useParams()
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [contentModel, setContentModel] = useState<string | null>(null)
  const [contentFormat, setContentFormat] = useState<ContentFormat>('text')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<TopicQuiz | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [quizNotice, setQuizNotice] = useState<string | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const [quizResult, setQuizResult] = useState<TopicQuizResult | null>(null)
  const [quizSubmitting, setQuizSubmitting] = useState(false)
  const [htmlLesson, setHtmlLesson] = useState<TopicHtmlContentDto | null>(null)
  const [htmlLessonLoading, setHtmlLessonLoading] = useState(false)
  const [htmlLessonError, setHtmlLessonError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!token || !topicId) return
      setLoading(true)
      setError(null)
      setContent(null)
      setTitle(null)
      setCourseId(null)
      setContentModel(null)
      setContentFormat('text')
      setQuiz(null)
      setQuizLoading(false)
      setQuizError(null)
      setQuizNotice(null)
      setSelectedAnswers({})
      setQuizResult(null)
      setHtmlLesson(null)
      setHtmlLessonError(null)
      try {
        const meta = await CoursesAPI.topicMeta(topicId)
        setTitle(meta.course_title)
        setCourseId(meta.course_id)
        setContentModel(meta.content_ai_model ?? null)

        const settings = await CoursesAPI.courseSettings(meta.course_id)
        setContentFormat(settings.content_format)

        if (settings.content_format === 'text') {
          const data: GeneratedTopic = await CoursesAPI.generateTopic(topicId)
          setTitle(data.course_title)
          setCourseId(data.course_id)
          setContent(data.content)
          setContentModel(data.content_ai_model)
        } else {
          setContent(null)
          try {
            const lesson = await CoursesAPI.topicHtml(topicId)
            setHtmlLesson(lesson)
            setContentModel(lesson.ai_model)
          } catch {
            setHtmlLesson(null)
          }
        }

        const canUseQuiz = settings.content_format === 'text' || meta.has_text_content
        if (canUseQuiz) {
          setQuizLoading(true)
          try {
            const loadedQuiz = await CoursesAPI.topicQuiz(topicId)
            setQuiz(loadedQuiz)
            setQuizResult(loadedQuiz.last_result ?? null)
          } catch {
            if (settings.content_format === 'text') {
              try {
                const generatedQuiz = await CoursesAPI.generateTopicQuiz(topicId)
                setQuiz(generatedQuiz)
                setQuizResult(generatedQuiz.last_result ?? null)
              } catch {
                setQuizError('Ошибка загрузки теста')
              }
            } else {
              setQuiz(null)
              setQuizNotice('Тест пока недоступен: для новых интерактивных глав текстовый контент не генерируется автоматически.')
            }
          } finally {
            setQuizLoading(false)
          }
        } else {
          setQuiz(null)
          setQuizLoading(false)
          setQuizNotice('Тест недоступен для интерактивного формата, пока не сгенерирован текстовый контент.')
        }
      } catch {
        setError('Ошибка генерации контента')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token, topicId])

  const handleGenerateInteractiveLesson = async () => {
    if (!topicId || htmlLessonLoading || contentFormat !== 'interactive') return
    setHtmlLessonLoading(true)
    setHtmlLessonError(null)
    try {
      const lesson = await CoursesAPI.generateTopicHtml(topicId)
      setHtmlLesson(lesson)
      setContentModel(lesson.ai_model)
    } catch {
      setHtmlLessonError('Не удалось сгенерировать интерактивную главу. Попробуйте ещё раз.')
    } finally {
      setHtmlLessonLoading(false)
    }
  }

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

  const formattedGeneratedAt = formatGeneratedAt(htmlLesson?.generated_at)

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
                <span className="topic-badge topic-badge--interactive" style={{ width: 'fit-content' }}>
                  Формат: {contentFormat === 'interactive' ? 'интерактивный' : 'текстовый'}
                </span>
                {contentModel && (
                  <div className="topic-model-inline">
                    <ModelLogo size={11} model={contentModel} />
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

            {contentFormat === 'interactive' && (htmlLesson || htmlLessonLoading || !error) && (
              <div
                className="interactive-lesson-bar"
                style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}
              >
                <div className="interactive-lesson-bar-info">
                  {htmlLesson ? (
                    <>
                      <span className="interactive-lesson-bar-title">Интерактивная глава готова</span>
                      <span className="status-muted">
                        Модель: {htmlLesson.ai_model}
                        {formattedGeneratedAt ? ` · сгенерировано ${formattedGeneratedAt}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="interactive-lesson-bar-title">Интерактивная глава</span>
                      <span className="status-muted">
                        Сгенерируйте насыщенную HTML-главу с mind map, карточками, мини-тестами и инфографикой.
                      </span>
                    </>
                  )}
                </div>
                <div className="interactive-lesson-bar-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleGenerateInteractiveLesson}
                    disabled={htmlLessonLoading}
                  >
                    {htmlLessonLoading
                      ? 'Генерируем...'
                      : htmlLesson
                        ? 'Перегенерировать'
                        : 'Сгенерировать интерактивную главу'}
                  </button>
                </div>
                {htmlLessonError && (
                  <p className="status-error" style={{ width: '100%', margin: 0 }}>{htmlLessonError}</p>
                )}
              </div>
            )}

            {contentFormat === 'interactive' && htmlLessonLoading && !htmlLesson && (
              <div
                className="surface-card surface-card--light"
                style={{ width: '100%', maxWidth: 1360, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <LoadingPulse />
                <span>Генерируем интерактивную главу. Это может занять до минуты...</span>
              </div>
            )}

            {contentFormat === 'interactive' ? (
              htmlLesson ? (
                <div style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                  <InteractiveContentFrame html={htmlLesson.html} title={`Глава: ${title ?? ''}`} />
                </div>
              ) : (
                <div className="surface-card surface-card--light" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                  <p className="status-muted" style={{ margin: 0 }}>
                    Интерактивная глава ещё не сгенерирована. Нажмите «Сгенерировать интерактивную главу».
                  </p>
                </div>
              )
            ) : (
              <div style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                {content ? (
                  <div className="surface-card surface-card--light" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                    <MarkdownRenderer markdown={content} />
                  </div>
                ) : (
                  <div className="surface-card surface-card--light" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                    <p className="status-muted" style={{ margin: 0 }}>
                      Текстовая глава ещё не сгенерирована.
                    </p>
                  </div>
                )}
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
                {quizNotice && <p className="status-muted">{quizNotice}</p>}

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
