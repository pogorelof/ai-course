import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { Topic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'

export function NewCoursePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [wishes, setWishes] = useState('')
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
      const data = await CoursesAPI.outline({ title, wishes, file })
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


