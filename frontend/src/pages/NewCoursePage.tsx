import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { Topic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { OpenAILogo } from '../components/OpenAILogo'

const OPENAI_MODELS = [
  { id: 'gpt-5.5', label: 'gpt-5.5', inputPrice: '$5', outputPrice: '$30' },
  { id: 'gpt-5.4', label: 'gpt-5.4', inputPrice: '$2.5', outputPrice: '$15' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', inputPrice: '$0.75', outputPrice: '$4.5' },
  { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano', inputPrice: '$0.2', outputPrice: '$1.25' },
  { id: 'gpt-5-mini', label: 'gpt-5-mini', inputPrice: '$0.25', outputPrice: '$2' },
  { id: 'gpt-5-nano', label: 'gpt-5-nano', inputPrice: '$0.05', outputPrice: '$0.4' },
] as const

export function NewCoursePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [wishes, setWishes] = useState('')
  const [aiProvider, setAiProvider] = useState<'openai' | 'openrouter'>('openai')
  const [aiModel, setAiModel] = useState<string>('gpt-5-mini')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [file, setFile] = useState<File | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [createdCourseId, setCreatedCourseId] = useState<number | null>(null)

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
        file,
      })
      setCreatedCourseId(data.course_id)
      setTopics(data.topics)
    } catch (e) {
      setError('Ошибка генерации. Проверьте API ключ на сервере.')
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
                    onClick={() => setAiProvider('openai')}
                  >
                    OpenAI
                  </button>
                  <button
                    type="button"
                    className="provider-chip provider-chip--disabled"
                    disabled
                    title="OpenRouter скоро будет доступен"
                    onClick={() => setAiProvider('openrouter')}
                  >
                    OpenRouter (скоро)
                  </button>
                </div>
              </div>
              <div className="field">
                <span>Модель OpenAI</span>
                <div className="model-dropdown">
                  <button
                    type="button"
                    className="model-dropdown-trigger"
                    onClick={() => setModelsOpen(prev => !prev)}
                  >
                    <span className="model-trigger-title">
                      <OpenAILogo size={14} />
                      <span>{OPENAI_MODELS.find(item => item.id === aiModel)?.label ?? aiModel}</span>
                    </span>
                    <span className="model-dropdown-hint">
                      input {OPENAI_MODELS.find(item => item.id === aiModel)?.inputPrice} / output {OPENAI_MODELS.find(item => item.id === aiModel)?.outputPrice}
                    </span>
                  </button>
                  {modelsOpen && (
                    <div className="model-dropdown-panel">
                      {OPENAI_MODELS.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`model-card ${aiModel === item.id ? 'model-card--active' : ''}`}
                          onClick={() => {
                            setAiModel(item.id)
                            setModelsOpen(false)
                          }}
                        >
                          <div className="model-card-title">
                            <OpenAILogo size={14} />
                            <span>{item.label}</span>
                          </div>
                          <div className="model-card-prices">
                            <span>Input: {item.inputPrice}</span>
                            <span>Output: {item.outputPrice}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="price-note">
                  Цены за 1M токенов: input / output
                </div>
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


