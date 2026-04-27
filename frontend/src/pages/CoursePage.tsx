import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

const isOpenAIModel = (model: string | null | undefined) => {
  if (!model) return false
  const normalized = model.toLowerCase()
  return normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')
}

export function CoursePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { courseId } = useParams()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'openai' | 'openrouter'>('openai')
  const [model, setModel] = useState<string>('gpt-5-mini')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null)

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
      })
      setProvider(updated.ai_provider)
      setModel(updated.ai_model)
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
                onClick={() => setProvider('openai')}
              >
                OpenAI
              </button>
              <button
                type="button"
                className="provider-chip provider-chip--disabled"
                disabled
                title="OpenRouter скоро будет доступен"
                onClick={() => setProvider('openrouter')}
              >
                OpenRouter (скоро)
              </button>
            </div>
            <div className="field" style={{ maxWidth: 420 }}>
              <span>Модель OpenAI</span>
              <div className="model-dropdown">
                <button
                  type="button"
                  className="model-dropdown-trigger"
                  onClick={() => setModelsOpen(prev => !prev)}
                >
                  <span className="model-trigger-title">
                    <OpenAILogo size={14} />
                    <span>{OPENAI_MODELS.find(item => item.id === model)?.label ?? model}</span>
                  </span>
                  <span className="model-dropdown-hint">
                    input {OPENAI_MODELS.find(item => item.id === model)?.inputPrice} / output {OPENAI_MODELS.find(item => item.id === model)?.outputPrice}
                  </span>
                </button>
                {modelsOpen && (
                  <div className="model-dropdown-panel">
                    {OPENAI_MODELS.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`model-card ${model === item.id ? 'model-card--active' : ''}`}
                        onClick={() => {
                          setModel(item.id)
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
              <div className="price-note">Цены за 1M токенов: input / output</div>
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
                <span className={`topic-model ${t.content_ai_model ? '' : 'topic-model--pending'}`}>
                  {isOpenAIModel(t.content_ai_model) && <OpenAILogo size={11} />}
                  <span>{t.content_ai_model ?? 'не сгенерировано'}</span>
                </span>
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


