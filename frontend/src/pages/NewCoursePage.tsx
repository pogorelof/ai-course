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
      const data = await CoursesAPI.outline({ title, wishes })
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
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Новый курс</h1>
      {!createdCourseId ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <div className="glass-surface" style={{ width: '100%', maxWidth: 720, borderRadius: 16, padding: 16 }}>
            <form style={{ display: 'grid', gap: 12 }} onSubmit={submit}>
              {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Тема курса</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required className="glass-input" style={{ padding: '12px 14px', borderRadius: 10, fontSize: 16 }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Ваши пожелания</span>
                <textarea value={wishes} onChange={(e) => setWishes(e.target.value)} rows={6} required className="glass-input" style={{ padding: '12px 14px', borderRadius: 10, resize: 'none', fontSize: 16, lineHeight: 1.5 }} />
              </label>
              {/* Gradient hover animation keyframes */}
              <style>{`@keyframes gradientShift {0%{background-position:0% 50%}100%{background-position:100% 50%}}`}</style>
              <button
                disabled={loading || !token}
                style={{
                  padding: '14px 22px',
                  fontSize: 16,
                  fontWeight: 600,
                  borderRadius: 10,
                  border: '1px solid #2563eb',
                  background: 'linear-gradient(90deg, #2563eb, #1e40af, #2563eb)',
                  color: '#fff',
                  width: 'fit-content',
                  alignSelf: 'center',
                  justifySelf: 'center',
                  cursor: (loading || !token) ? 'not-allowed' : 'pointer',
                  backgroundSize: '200% 200%',
                  backgroundPosition: '0% 50%',
                  transition: 'transform .2s ease, opacity .2s ease'
                }}
                onMouseEnter={(e) => {
                  if (loading || !token) return
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.transform = 'scale(1.03)'
                  btn.style.animation = 'gradientShift 2.5s ease-in-out infinite'
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.transform = 'scale(1.0)'
                  btn.style.animation = 'none'
                  btn.style.backgroundPosition = '0% 50%'
                }}
              >
                {loading ? <LoadingPulse /> : 'Сгенерировать структуру (15 тем)'}
              </button>
              {!token && <p>Нужно войти, чтобы создавать курс.</p>}
            </form>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ marginBottom: 12 }}>Курс создан. Ниже 15 тем. Нажмите на тему, чтобы открыть.</p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {topics.map(t => (
              <li key={t.id} className="glass-surface" style={{ borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t.title}</span>
                <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
                  <button className="glass-button" style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', transition: 'transform .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}>Открыть</button>
                </Link>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 16 }}>
            <button className="glass-button" onClick={() => navigate(`/courses/${createdCourseId}`)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}>Перейти к курсу</button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}


