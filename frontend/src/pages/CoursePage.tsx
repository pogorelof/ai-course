import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { ContentFormat, Topic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { ModelLogo } from '../components/ModelLogo'

const OPENAI_MODELS = [
  { id: 'gpt-5.5', label: 'gpt-5.5', inputPrice: '$5', outputPrice: '$30' },
  { id: 'gpt-5.4', label: 'gpt-5.4', inputPrice: '$2.5', outputPrice: '$15' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', inputPrice: '$0.75', outputPrice: '$4.5' },
  { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano', inputPrice: '$0.2', outputPrice: '$1.25' },
  { id: 'gpt-5-mini', label: 'gpt-5-mini', inputPrice: '$0.25', outputPrice: '$2' },
  { id: 'gpt-5-nano', label: 'gpt-5-nano', inputPrice: '$0.05', outputPrice: '$0.4' },
] as const
const NITRO_SUFFIX = ':nitro'
const OPENROUTER_MODELS = [
  { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', inputPrice: '$0.14', outputPrice: '$0.28' },
  { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', inputPrice: '$1.74', outputPrice: '$3.48' },
  { id: 'claude-opus-4.7', label: 'claude-opus-4.7', inputPrice: '$5', outputPrice: '$25' },
  { id: 'claude-sonnet-4.6', label: 'claude-sonnet-4.6', inputPrice: '$3', outputPrice: '$15' },
  { id: 'claude-haiku-4.5', label: 'claude-haiku-4.5', inputPrice: '$1', outputPrice: '$5' },
  { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview', inputPrice: '$2', outputPrice: '$12' },
  { id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview', inputPrice: '$0.5', outputPrice: '$3' },
  { id: 'gpt-5.5', label: 'gpt-5.5', inputPrice: '$5', outputPrice: '$30' },
  { id: 'gpt-5.4', label: 'gpt-5.4', inputPrice: '$2.5', outputPrice: '$15' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', inputPrice: '$0.75', outputPrice: '$4.5' },
  { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano', inputPrice: '$0.2', outputPrice: '$1.25' },
  { id: 'gpt-5-mini', label: 'gpt-5-mini', inputPrice: '$0.25', outputPrice: '$2' },
  { id: 'gpt-5-nano', label: 'gpt-5-nano', inputPrice: '$0.05', outputPrice: '$0.4' },
  { id: 'meta-llama/llama-4-maverick', label: 'meta-llama/llama-4-maverick', inputPrice: '$0.15', outputPrice: '$0.60' },
  { id: 'google/gemma-4-31b-it', label: 'google/gemma-4-31b-it', inputPrice: '$0.13', outputPrice: '$0.38' },
  { id: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b', inputPrice: '$0.35', outputPrice: '$0.75' },
] as const

const isNitroModel = (modelId: string) => modelId.endsWith(NITRO_SUFFIX)
const baseModelId = (modelId: string) => (isNitroModel(modelId) ? modelId.slice(0, -NITRO_SUFFIX.length) : modelId)
const nitroModelId = (modelId: string) => (isNitroModel(modelId) ? modelId : `${modelId}${NITRO_SUFFIX}`)

export function CoursePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { courseId } = useParams()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'openai' | 'openrouter'>('openai')
  const [model, setModel] = useState<string>('gpt-5-mini')
  const [contentFormat, setContentFormat] = useState<ContentFormat>('text')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null)
  const models = provider === 'openrouter' ? OPENROUTER_MODELS : OPENAI_MODELS
  const selectedModelId = provider === 'openrouter' ? baseModelId(model) : model
  const selectedModel = models.find(item => item.id === selectedModelId)

  useEffect(() => {
    const run = async () => {
      if (!token || !courseId) return
      setLoading(true)
      setError(null)
      try {
        const data = await CoursesAPI.courseTopics(courseId)
        setTopics(data)
      } catch (e) {
        setError('Ошибка загрузки тем')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token, courseId])

  useEffect(() => {
    const fetchSettings = async () => {
      if (!token || !courseId) return
      try {
        const settings = await CoursesAPI.courseSettings(courseId)
        setProvider(settings.ai_provider)
        setModel(settings.ai_model)
        setContentFormat(settings.content_format)
      } catch {
        // keep defaults
      }
    }
    fetchSettings()
  }, [token, courseId])

  const getScoreClassName = (score: number) => {
    if (score > 60) return 'topic-score topic-score--green'
    if (score >= 40) return 'topic-score topic-score--orange'
    return 'topic-score topic-score--red'
  }

  const saveSettings = async () => {
    if (!courseId) return
    setSettingsLoading(true)
    setSettingsStatus(null)
    try {
      const updated = await CoursesAPI.updateCourseSettings(courseId, {
        ai_provider: provider,
        ai_model: model,
        content_format: contentFormat,
      })
      setProvider(updated.ai_provider)
      setModel(updated.ai_model)
      setContentFormat(updated.content_format)
      setSettingsStatus('Настройки сохранены')
    } catch (e) {
      setSettingsStatus('Не удалось сохранить настройки')
    } finally {
      setSettingsLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="section-stack">
        <div style={{ display: 'grid', gap: 6 }}>
          <h1 className="page-hero-title">Темы курса</h1>
          <p className="page-subtitle">Выберите тему и откройте детальную главу.</p>
        </div>

        <div className="surface-card surface-card--light" style={{ maxWidth: 620 }}>
          <div className="section-stack" style={{ gap: 14 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <h2 className="page-title">Настройки</h2>
            </div>
            <div className="provider-toggle">
              <button
                type="button"
                className={`provider-chip ${provider === 'openai' ? 'provider-chip--active' : ''}`}
                onClick={() => {
                  setProvider('openai')
                  setModel(OPENAI_MODELS[0].id)
                }}
              >
                OpenAI
              </button>
              <button
                type="button"
                className={`provider-chip ${provider === 'openrouter' ? 'provider-chip--active' : ''}`}
                onClick={() => {
                  setProvider('openrouter')
                  setModel(OPENROUTER_MODELS[0].id)
                }}
              >
                OpenRouter
              </button>
            </div>
            <div className="field" style={{ maxWidth: 420 }}>
              <span>Модель</span>
              <div className="model-dropdown">
                <button
                  type="button"
                  className="model-dropdown-trigger"
                  onClick={() => setModelsOpen(prev => !prev)}
                >
                  <span className="model-trigger-title">
                    <ModelLogo size={14} provider={provider} model={model} />
                    <span>{selectedModel?.label ?? model}</span>
                  </span>
                  <span className="model-dropdown-hint">
                    input {selectedModel?.inputPrice ?? '—'} / output {selectedModel?.outputPrice ?? '—'}
                  </span>
                </button>
                {modelsOpen && (
                  <div className="model-dropdown-panel">
                    {models.map((item) => (
                      <div key={item.id} className="model-card-row">
                        <button
                          type="button"
                          className={`model-card ${model === item.id ? 'model-card--active' : ''}`}
                          onClick={() => {
                            setModel(item.id)
                            setModelsOpen(false)
                          }}
                        >
                          <div className="model-card-title">
                            <ModelLogo size={14} provider={provider} model={item.id} />
                            <span>{item.label}</span>
                          </div>
                          <div className="model-card-prices">
                            <span>Input: {item.inputPrice}</span>
                            <span>Output: {item.outputPrice}</span>
                          </div>
                        </button>
                        {provider === 'openrouter' && (
                          <button
                            type="button"
                            className={`model-nitro-btn ${model === nitroModelId(item.id) ? 'model-nitro-btn--active' : ''}`}
                            onClick={() => {
                              setModel(nitroModelId(item.id))
                              setModelsOpen(false)
                            }}
                            aria-label={`Включить Nitro для ${item.label}`}
                            title={`Nitro для ${item.label}`}
                          >
                            <span className="model-nitro-icon" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="price-note">Цены за 1M токенов: input / output</div>
            </div>
            <div className="field">
              <span>Формат главы</span>
              <div className="provider-toggle">
                <button
                  type="button"
                  className={`provider-chip ${contentFormat === 'text' ? 'provider-chip--active' : ''}`}
                  onClick={() => setContentFormat('text')}
                >
                  Текстовая
                </button>
                <button
                  type="button"
                  className={`provider-chip ${contentFormat === 'interactive' ? 'provider-chip--active' : ''}`}
                  onClick={() => setContentFormat('interactive')}
                >
                  Интерактивная
                </button>
              </div>
              <div className="price-note">
                Выбор влияет на поток генерации в главе: text → markdown, interactive → HTML.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-primary" disabled={settingsLoading} onClick={saveSettings}>
                {settingsLoading ? 'Сохраняем...' : 'Сохранить настройки'}
              </button>
              {settingsStatus && <span className="status-muted">{settingsStatus}</span>}
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LoadingPulse />
            <p className="status-muted">Загрузка тем...</p>
          </div>
        )}
        {error && <p className="status-error">{error}</p>}
        {!loading && !error && topics.length === 0 && <p className="status-muted">Пока нет тем для этого курса.</p>}

        <ul className="list-stack">
          {topics.map(t => (
            <li key={t.id} className="list-row">
              <div className="topic-meta-block">
                <span style={{ fontWeight: 600, lineHeight: 1.24 }}>{t.title}</span>
                {!t.has_attempts ? (
                  <span className="topic-score topic-score--red">Тест не пройден</span>
                ) : (
                  <span className={getScoreClassName(t.last_score_percent ?? 0)}>
                    {t.has_passed_quiz ? `Тест: ${t.last_score_percent}%` : `Тест не пройден: ${t.last_score_percent}%`}
                  </span>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`topic-model ${t.content_ai_model ? '' : 'topic-model--pending'}`}>
                    <ModelLogo size={11} model={t.content_ai_model} />
                    <span>{t.content_ai_model ?? 'не сгенерировано'}</span>
                  </span>
                  {t.has_html_content && (
                    <span className="topic-badge topic-badge--interactive" title="Доступна интерактивная HTML-глава">
                      Интерактивная
                    </span>
                  )}
                </div>
              </div>
              <Link to={`/topics/${t.id}`} className="btn btn-pill">
                Открыть
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PageContainer>
  )
}
