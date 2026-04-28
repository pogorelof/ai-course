import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { StreamEvent, TopicHtmlContentDto } from '../services/api'
import type { ContentFormat, TopicQuiz, TopicQuizResult } from '../types/domain'
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
  const [streaming, setStreaming] = useState(false)
  const [streamedBytes, setStreamedBytes] = useState(0)
  const streamAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    streamAbortRef.current?.abort()
    streamAbortRef.current = controller

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
      setStreaming(false)
      setStreamedBytes(0)
      try {
        const meta = await CoursesAPI.topicMeta(topicId)
        if (cancelled) return
        setTitle(meta.course_title)
        setCourseId(meta.course_id)
        setContentModel(meta.content_ai_model ?? null)

        const settings = await CoursesAPI.courseSettings(meta.course_id)
        if (cancelled) return
        setContentFormat(settings.content_format)

        if (settings.content_format === 'text') {
          let accumulated = ''
          let usedCache = false
          setLoading(false)
          setStreaming(true)
          await CoursesAPI.streamTopic(
            topicId,
            (event: StreamEvent) => {
              if (cancelled) return
              if (event.type === 'started') {
                setTitle(event.course_title)
                setCourseId(event.course_id)
                setContentModel(event.ai_model)
              } else if (event.type === 'cached') {
                usedCache = true
                accumulated = event.content
                setContent(event.content)
                setContentModel(event.ai_model)
                setStreamedBytes(event.content.length)
              } else if (event.type === 'chunk') {
                accumulated += event.delta
                setContent(accumulated)
                setStreamedBytes(accumulated.length)
              } else if (event.type === 'done') {
                if (event.content && !usedCache) {
                  accumulated = event.content
                  setContent(event.content)
                }
                if (event.ai_model) setContentModel(event.ai_model)
              } else if (event.type === 'error') {
                throw new Error(event.detail || 'stream error')
              }
            },
            controller.signal,
          )
          if (cancelled) return
          setStreaming(false)
          if (!accumulated) {
            setError('Не удалось сгенерировать контент')
          }
        } else {
          setContent(null)
          try {
            const lesson = await CoursesAPI.topicHtml(topicId)
            if (cancelled) return
            setHtmlLesson(lesson)
            setContentModel(lesson.ai_model)
          } catch {
            if (!cancelled) setHtmlLesson(null)
          }
        }

        const canUseQuiz = settings.content_format === 'text' || meta.has_text_content
        if (canUseQuiz) {
          setQuizLoading(true)
          try {
            const loadedQuiz = await CoursesAPI.topicQuiz(topicId)
            if (cancelled) return
            setQuiz(loadedQuiz)
            setQuizResult(loadedQuiz.last_result ?? null)
          } catch {
            if (cancelled) return
            if (settings.content_format === 'text') {
              try {
                const generatedQuiz = await CoursesAPI.generateTopicQuiz(topicId)
                if (cancelled) return
                setQuiz(generatedQuiz)
                setQuizResult(generatedQuiz.last_result ?? null)
              } catch {
                if (!cancelled) setQuizError('Ошибка загрузки теста')
              }
            } else {
              setQuiz(null)
              setQuizNotice('Тест пока недоступен: для новых интерактивных глав текстовый контент не генерируется автоматически.')
            }
          } finally {
            if (!cancelled) setQuizLoading(false)
          }
        } else {
          setQuiz(null)
          setQuizLoading(false)
          setQuizNotice('Тест недоступен для интерактивного формата, пока не сгенерирован текстовый контент.')
        }
      } catch (err) {
        if (cancelled) return
        if ((err as Error).name === 'AbortError') return
        setError('Ошибка генерации контента')
        setStreaming(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, topicId])

  const handleGenerateInteractiveLesson = async () => {
    if (!topicId || htmlLessonLoading || contentFormat !== 'interactive') return
    setHtmlLessonLoading(true)
    setHtmlLessonError(null)
    setStreamedBytes(0)
    setStreaming(true)
    const controller = new AbortController()
    streamAbortRef.current?.abort()
    streamAbortRef.current = controller
    try {
      let accumulated = ''
      let errorDetail: string | null = null
      await CoursesAPI.streamTopicHtml(
        topicId,
        (event) => {
          if (event.type === 'chunk') {
            accumulated += event.delta
            setStreamedBytes(accumulated.length)
          } else if (event.type === 'done' && event.html) {
            setHtmlLesson({
              topic_id: Number(topicId),
              course_id: courseId ?? 0,
              course_title: title ?? '',
              html: event.html,
              ai_provider: (event.ai_provider as 'openai' | 'openrouter') ?? 'openai',
              ai_model: event.ai_model ?? '',
              generated_at: event.generated_at ?? new Date().toISOString(),
            })
            if (event.ai_model) setContentModel(event.ai_model)
          } else if (event.type === 'error') {
            errorDetail = event.detail
          }
        },
        controller.signal,
      )
      if (errorDetail) {
        setHtmlLessonError('Не удалось сгенерировать интерактивную главу. Попробуйте ещё раз.')
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setHtmlLessonError('Не удалось сгенерировать интерактивную главу. Попробуйте ещё раз.')
      }
    } finally {
      setHtmlLessonLoading(false)
      setStreaming(false)
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
            <span>Загружаем главу...</span>
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
                <span>
                  Стрим интерактивной главы…
                  {streamedBytes > 0 ? ` получено ${Math.round(streamedBytes / 1024)} КБ` : ''}
                </span>
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
                    {streaming && (
                      <div className="status-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <LoadingPulse />
                        <span>Стрим… {streamedBytes > 0 ? `получено ${streamedBytes.toLocaleString('ru-RU')} символов` : ''}</span>
                      </div>
                    )}
                    <MarkdownRenderer markdown={content} />
                  </div>
                ) : streaming ? (
                  <div className="surface-card surface-card--light" style={{ width: '100%', maxWidth: 1360, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LoadingPulse />
                    <span>Подключаемся к модели и ждём первый токен…</span>
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
