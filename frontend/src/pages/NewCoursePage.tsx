import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { ContentFormat, ReasoningEffort, Topic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { ModelLogo } from '../components/ModelLogo'
import { ReasoningEffortPicker } from '../components/ReasoningEffortPicker'

const OPENAI_MODELS = [
  { id: 'gpt-5.5', label: 'gpt-5.5', inputPrice: '$5', outputPrice: '$30' },
  { id: 'gpt-5.4', label: 'gpt-5.4', inputPrice: '$2.5', outputPrice: '$15' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', inputPrice: '$0.75', outputPrice: '$4.5' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini', inputPrice: '$0.15', outputPrice: '$0.60' },
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

export function NewCoursePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [wishes, setWishes] = useState('')
  const [aiProvider, setAiProvider] = useState<'openai' | 'openrouter'>('openai')
  const [aiModel, setAiModel] = useState<string>('gpt-5-mini')
  const [contentFormat, setContentFormat] = useState<ContentFormat>('text')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('minimal')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [file, setFile] = useState<File | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [createdCourseId, setCreatedCourseId] = useState<number | null>(null)
  const models = aiProvider === 'openrouter' ? OPENROUTER_MODELS : OPENAI_MODELS
  const selectedModelId = aiProvider === 'openrouter' ? baseModelId(aiModel) : aiModel
  const selectedModel = models.find(item => item.id === selectedModelId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await CoursesAPI.outline({
        title,
        wishes,
        ai_provider: aiProvider,
        ai_model: aiModel,
        content_format: contentFormat,
        reasoning_effort: reasoningEffort,
        file,
      })
      setCreatedCourseId(data.course_id)
      setTopics(data.topics)
    } catch (e) {
      setError('Ошибка генерации. Проверьте API ключи в меню "Ключи API".')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="section-stack">
        <div style={{ display: 'grid', gap: 6 }}>
          <h1 className="page-hero-title">Новый курс</h1>
          <p className="page-subtitle">Создайте структуру курса и переходите к изучению тем.</p>
        </div>
        {!createdCourseId ? (
          <div className="surface-card surface-card--light">
            <form className="form-grid" onSubmit={submit}>
              {error && <p className="status-error">{error}</p>}
              <div className="field">
                <span>Тема курса</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input" />
              </div>
              <div className="field">
                <span>Ваши пожелания</span>
                <textarea value={wishes} onChange={(e) => setWishes(e.target.value)} rows={6} required className="textarea" style={{ resize: 'vertical' }} />
              </div>
              <div className="field">
                <span>AI провайдер</span>
                <div className="provider-toggle">
                  <button
                    type="button"
                    className={`provider-chip ${aiProvider === 'openai' ? 'provider-chip--active' : ''}`}
                    onClick={() => {
                      setAiProvider('openai')
                      setAiModel(OPENAI_MODELS[0].id)
                    }}
                  >
                    OpenAI
                  </button>
                  <button
                    type="button"
                    className={`provider-chip ${aiProvider === 'openrouter' ? 'provider-chip--active' : ''}`}
                    onClick={() => {
                      setAiProvider('openrouter')
                      setAiModel(OPENROUTER_MODELS[0].id)
                    }}
                  >
                    OpenRouter
                  </button>
                </div>
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
                  Текстовая: сначала генерируется markdown; интерактивная: сразу HTML-глава без генерации markdown.
                </div>
              </div>
              <div className="field">
                <span>Модель</span>
                <div className="model-dropdown">
                  <button
                    type="button"
                    className="model-dropdown-trigger"
                    onClick={() => setModelsOpen(prev => !prev)}
                  >
                    <span className="model-trigger-title">
                      <ModelLogo size={14} provider={aiProvider} model={aiModel} />
                      <span>{selectedModel?.label ?? aiModel}</span>
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
                            className={`model-card ${aiModel === item.id ? 'model-card--active' : ''}`}
                            onClick={() => {
                              setAiModel(item.id)
                              setModelsOpen(false)
                            }}
                          >
                            <div className="model-card-title">
                              <ModelLogo size={14} provider={aiProvider} model={item.id} />
                              <span>{item.label}</span>
                            </div>
                            <div className="model-card-prices">
                              <span>Input: {item.inputPrice}</span>
                              <span>Output: {item.outputPrice}</span>
                            </div>
                          </button>
                          {aiProvider === 'openrouter' && (
                            <button
                              type="button"
                              className={`model-nitro-btn ${aiModel === nitroModelId(item.id) ? 'model-nitro-btn--active' : ''}`}
                              onClick={() => {
                                setAiModel(nitroModelId(item.id))
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
                <div className="price-note">
                  Цены за 1M токенов: input / output
                </div>
                <ReasoningEffortPicker model={aiModel} value={reasoningEffort} onChange={setReasoningEffort} />
              </div>
              <div className="field">
                <span>PDF материал (необязательно)</span>
                <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0])} className="input" />
              </div>
              <button disabled={loading || !token} className="btn btn-primary" style={{ width: 'fit-content' }}>
                {loading ? <LoadingPulse /> : 'Сгенерировать структуру (15 тем)'}
              </button>
              {!token && <p className="status-muted">Нужно войти, чтобы создавать курс.</p>}
            </form>
          </div>
        ) : (
          <div className="section-stack">
            <p className="page-subtitle">Курс создан. Ниже 15 тем. Нажмите на тему, чтобы открыть.</p>
            <ul className="list-stack">
              {topics.map(t => (
                <li key={t.id} className="list-row">
                  <span style={{ fontWeight: 600, lineHeight: 1.24 }}>{t.title}</span>
                  <Link to={`/topics/${t.id}`} className="btn btn-pill">
                    Открыть
                  </Link>
                </li>
              ))}
            </ul>
            <div>
              <button className="btn btn-secondary" onClick={() => navigate(`/courses/${createdCourseId}`)}>Перейти к курсу</button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}


