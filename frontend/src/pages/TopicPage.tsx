import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { StreamEvent, TopicHtmlContentDto, TopicMetaDto } from '../services/api'
import type { TopicQuiz, TopicQuizResult } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { InteractiveContentFrame } from '../components/InteractiveContentFrame'
import { ModelLogo } from '../components/ModelLogo'

export type TopicViewMode = 'text' | 'interactive'

function formatAiProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) return null
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'openrouter') return 'OpenRouter'
  return provider
}

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

function parseViewParam(raw: string | null): TopicViewMode | null {
  if (raw === 'text' || raw === 'interactive') return raw
  return null
}

function defaultViewFromMeta(meta: TopicMetaDto | null): TopicViewMode {
  if (!meta) return 'text'
  if (meta.has_text_content && !meta.has_html_content) return 'text'
  if (meta.has_html_content && !meta.has_text_content) return 'interactive'
  return 'text'
}

export function TopicPage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { topicId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view')

  const [meta, setMeta] = useState<TopicMetaDto | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [topicTextAi, setTopicTextAi] = useState<{ model: string | null; provider: string | null }>({
    model: null,
    provider: null,
  })
  const [topicHtmlAi, setTopicHtmlAi] = useState<{ model: string | null; provider: string | null }>({
    model: null,
    provider: null,
  })
  const [textError, setTextError] = useState<string | null>(null)
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
  const [htmlFetchLoading, setHtmlFetchLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamedBytes, setStreamedBytes] = useState(0)
  const streamAbortRef = useRef<AbortController | null>(null)
  /** Avoids re-streaming markdown when returning to the «Текст» tab for the same topic. */
  const textStreamCompletedKeyRef = useRef<string | null>(null)

  const view: TopicViewMode = parseViewParam(viewParam) ?? defaultViewFromMeta(meta)

  /** Quiz uses markdown; avoid re-fetching on every streamed chunk. */
  const textReadyForQuiz = Boolean(
    meta && (meta.has_text_content || (!streaming && !!content && content.length > 0)),
  )

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token || !topicId) return
      setMetaLoading(true)
      setMeta(null)
      setContent(null)
      setTitle(null)
      setCourseId(null)
      setTopicTextAi({ model: null, provider: null })
      setTopicHtmlAi({ model: null, provider: null })
      setTextError(null)
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
      textStreamCompletedKeyRef.current = null
      try {
        const m = await CoursesAPI.topicMeta(topicId)
        if (cancelled) return
        setMeta(m)
        setTitle(m.course_title)
        setCourseId(m.course_id)
        setTopicTextAi({
          model: m.content_ai_model ?? null,
          provider: m.content_ai_provider ?? null,
        })
        setTopicHtmlAi({
          model: m.html_ai_model ?? null,
          provider: m.html_ai_provider ?? null,
        })
      } catch {
        if (!cancelled) setTextError('Не удалось загрузить главу')
      } finally {
        if (!cancelled) setMetaLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [token, topicId])

  useEffect(() => {
    if (!meta || !topicId) return
    if (parseViewParam(viewParam) !== null) return
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.set('view', defaultViewFromMeta(meta))
        return next
      },
      { replace: true },
    )
  }, [meta, topicId, viewParam, setSearchParams])

  useEffect(() => {
    if (!token || !topicId || !meta) return
    if (view !== 'text') return

    const streamKey = `${topicId}:text`
    if (textStreamCompletedKeyRef.current === streamKey) {
      return
    }

    let cancelled = false
    const controller = new AbortController()
    streamAbortRef.current?.abort()
    streamAbortRef.current = controller

    const run = async () => {
      setTextError(null)
      setStreaming(true)
      setStreamedBytes(0)
      let accumulated = ''
      let usedCache = false
      try {
        await CoursesAPI.streamTopic(
          topicId,
          (event: StreamEvent) => {
            if (cancelled) return
            if (event.type === 'started') {
              setTitle(event.course_title)
              setCourseId(event.course_id)
              setTopicTextAi({ model: event.ai_model, provider: event.ai_provider })
            } else if (event.type === 'cached') {
              usedCache = true
              accumulated = event.content
              setContent(event.content)
              setTopicTextAi({ model: event.ai_model, provider: event.ai_provider })
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
              if (event.ai_model) {
                setTopicTextAi(prev => ({
                  model: event.ai_model ?? prev.model,
                  provider: event.ai_provider ?? prev.provider,
                }))
              }
            } else if (event.type === 'error') {
              throw new Error(event.detail || 'stream error')
            }
          },
          controller.signal,
        )
        if (cancelled) return
        if (!accumulated) {
          setTextError('Не удалось сгенерировать контент')
        } else {
          textStreamCompletedKeyRef.current = streamKey
        }
      } catch (err) {
        if (cancelled) return
        if ((err as Error).name === 'AbortError') return
        setTextError('Ошибка генерации контента')
      } finally {
        if (!cancelled) setStreaming(false)
      }
    }
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, topicId, meta?.topic_id, view, meta])

  useEffect(() => {
    if (!token || !topicId || !meta) return
    if (view !== 'interactive') return

    let cancelled = false
    setHtmlFetchLoading(true)
    setHtmlLessonError(null)
    ;(async () => {
      try {
        const lesson = await CoursesAPI.topicHtml(topicId)
        if (!cancelled) {
          setHtmlLesson(lesson)
          setTopicHtmlAi({ model: lesson.ai_model, provider: lesson.ai_provider ?? null })
        }
      } catch {
        if (!cancelled) setHtmlLesson(null)
      } finally {
        if (!cancelled) setHtmlFetchLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, topicId, meta?.topic_id, view, meta])

  useEffect(() => {
    if (!token || !topicId || !meta) return

    if (!textReadyForQuiz) {
      setQuiz(null)
      setQuizLoading(false)
      setQuizNotice('Тест доступен после того, как сгенерирована текстовая версия главы (вкладка «Текст»).')
      return
    }

    let cancelled = false
    setQuizNotice(null)
    setQuizLoading(true)
    setQuizError(null)
    ;(async () => {
      try {
        const loadedQuiz = await CoursesAPI.topicQuiz(topicId)
        if (cancelled) return
        setQuiz(loadedQuiz)
        setQuizResult(loadedQuiz.last_result ?? null)
      } catch {
        if (cancelled) return
        try {
          const generatedQuiz = await CoursesAPI.generateTopicQuiz(topicId)
          if (!cancelled) {
            setQuiz(generatedQuiz)
            setQuizResult(generatedQuiz.last_result ?? null)
          }
        } catch {
          if (!cancelled) setQuizError('Ошибка загрузки теста')
        }
      } finally {
        if (!cancelled) setQuizLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, topicId, meta?.topic_id, textReadyForQuiz])

  const setView = (next: TopicViewMode) => {
    setSearchParams(
      prev => {
        const p = new URLSearchParams(prev)
        p.set('view', next)
        return p
      },
      { replace: true },
    )
  }

  const handleGenerateInteractiveLesson = async () => {
    if (!topicId || htmlLessonLoading) return
    setHtmlLessonLoading(true)
    setHtmlLessonError(null)
    setStreamedBytes(0)
    const controller = new AbortController()
    streamAbortRef.current?.abort()
    streamAbortRef.current = controller
    try {
      let accumulated = ''
      let errorDetail: string | null = null
      await CoursesAPI.streamTopicHtml(
        topicId,
        event => {
          if (event.type === 'started') {
            setTopicHtmlAi({ model: event.ai_model, provider: event.ai_provider })
          } else if (event.type === 'chunk') {
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
            if (event.ai_model) {
              setTopicHtmlAi({
                model: event.ai_model,
                provider: (event.ai_provider as string | undefined) ?? null,
              })
            }
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

  const pageReady = !metaLoading && meta

  return (
    <PageContainer fullWidth>
      <div className="section-stack" style={{ width: '100%', maxWidth: 1440, margin: '0 auto' }}>
        {metaLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8 }}>
            <LoadingPulse />
            <span>Загружаем главу...</span>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                width: '100%',
                maxWidth: 1360,
                margin: '0 auto',
              }}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                <h1 className="page-hero-title">{title ? `Курс: ${title}` : 'Глава курса'}</h1>
                {meta?.topic_title && (
                  <p className="page-subtitle" style={{ margin: 0 }}>
                    Тема: {meta.topic_title}
                  </p>
                )}
                <div className="topic-ai-lineage" style={{ display: 'grid', gap: 6, marginTop: 2 }}>
                  <div className="topic-model-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="status-muted" style={{ minWidth: 100, fontSize: '0.88rem' }}>
                      Текстовая версия:
                    </span>
                    {topicTextAi.model ? (
                      <>
                        <ModelLogo size={11} model={topicTextAi.model} />
                        <span>{topicTextAi.model}</span>
                        {formatAiProviderLabel(topicTextAi.provider) && (
                          <span className="status-muted">· {formatAiProviderLabel(topicTextAi.provider)}</span>
                        )}
                      </>
                    ) : (
                      <span className="status-muted">ещё не сгенерирована</span>
                    )}
                  </div>
                  <div className="topic-model-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="status-muted" style={{ minWidth: 100, fontSize: '0.88rem' }}>
                      Интерактив:
                    </span>
                    {topicHtmlAi.model ? (
                      <>
                        <ModelLogo size={11} model={topicHtmlAi.model} />
                        <span>{topicHtmlAi.model}</span>
                        {formatAiProviderLabel(topicHtmlAi.provider) && (
                          <span className="status-muted">· {formatAiProviderLabel(topicHtmlAi.provider)}</span>
                        )}
                      </>
                    ) : (
                      <span className="status-muted">ещё не сгенерирован</span>
                    )}
                  </div>
                </div>
              </div>
              {courseId && (
                <Link to={`/courses/${courseId}`} className="btn btn-pill">
                  Все темы
                </Link>
              )}
            </div>

            {pageReady && (
              <div className="topic-view-tabs" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                <div className="provider-toggle" role="tablist" aria-label="Версия главы">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'text'}
                    className={`provider-chip ${view === 'text' ? 'provider-chip--active' : ''}`}
                    onClick={() => setView('text')}
                  >
                    Текст
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'interactive'}
                    className={`provider-chip ${view === 'interactive' ? 'provider-chip--active' : ''}`}
                    onClick={() => setView('interactive')}
                  >
                    Интерактив
                  </button>
                </div>
                <p className="status-muted" style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
                  Две версии независимы: markdown для чтения и теста, HTML — отдельная интерактивная страница.
                </p>
              </div>
            )}

            {textError && view === 'text' && (
              <p className="status-error" style={{ textAlign: 'center' }}>
                {textError}
              </p>
            )}

            {view === 'interactive' && (
              <div className="interactive-lesson-bar" style={{ width: '100%', maxWidth: 1360, margin: '0 auto' }}>
                <div className="interactive-lesson-bar-info">
                  {htmlLesson ? (
                    <>
                      <span className="interactive-lesson-bar-title">Интерактивная глава готова</span>
                      <span className="status-muted">
                        Модель: {htmlLesson.ai_model}
                        {formatAiProviderLabel(htmlLesson.ai_provider)
                          ? ` · ${formatAiProviderLabel(htmlLesson.ai_provider)}`
                          : ''}
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
                    {htmlLessonLoading ? 'Генерируем...' : htmlLesson ? 'Перегенерировать' : 'Сгенерировать интерактивную главу'}
                  </button>
                </div>
                {htmlLessonError && (
                  <p className="status-error" style={{ width: '100%', margin: 0 }}>
                    {htmlLessonError}
                  </p>
                )}
              </div>
            )}

            {view === 'interactive' && htmlLessonLoading && !htmlLesson && (
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

            {view === 'interactive' ? (
              htmlFetchLoading && !htmlLesson && !htmlLessonLoading ? (
                <div
                  className="surface-card surface-card--light"
                  style={{ width: '100%', maxWidth: 1360, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <LoadingPulse />
                  <span>Загружаем интерактивную версию…</span>
                </div>
              ) : htmlLesson ? (
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
                        <span>
                          Стрим… {streamedBytes > 0 ? `получено ${streamedBytes.toLocaleString('ru-RU')} символов` : ''}
                        </span>
                      </div>
                    )}
                    <MarkdownRenderer markdown={content} />
                  </div>
                ) : streaming ? (
                  <div
                    className="surface-card surface-card--light"
                    style={{ width: '100%', maxWidth: 1360, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
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
                  <h2 className="page-title" style={{ marginBottom: 8 }}>
                    Тест по главе
                  </h2>
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
                          <p className="quiz-question-title">
                            {index + 1}. {question.question_text}
                          </p>
                          {quizResult &&
                            (() => {
                              const questionResult = getQuestionResult(question.id)
                              if (!questionResult) return null
                              const isCorrect = questionResult.selected_option_index === questionResult.correct_option_index
                              return (
                                <div
                                  className={
                                    isCorrect ? 'quiz-question-status quiz-question-status--correct' : 'quiz-question-status quiz-question-status--wrong'
                                  }
                                >
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
                          {quizResult &&
                            (() => {
                              const questionResult = getQuestionResult(question.id)
                              if (!questionResult) return null
                              const isCorrect = questionResult.selected_option_index === questionResult.correct_option_index
                              if (isCorrect) return null
                              return (
                                <div className="quiz-inline-advice">
                                  <p style={{ margin: 0 }}>
                                    Ваш ответ: {question.options[questionResult.selected_option_index] ?? '—'}. Правильный:{' '}
                                    {question.options[questionResult.correct_option_index] ?? '—'}.
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
                      <p className="status-muted" style={{ margin: 0 }}>
                        Отличная работа! Все ответы верные.
                      </p>
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
