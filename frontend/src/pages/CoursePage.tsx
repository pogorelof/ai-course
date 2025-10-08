import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { Topic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'

export function CoursePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { courseId } = useParams()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <PageContainer>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Темы курса</h1>
      {loading && <LoadingPulse />}
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {topics.map(t => (
          <li key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t.title}</span>
            <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
              <button style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', transition: 'transform .12s, background .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLButtonElement).style.background = '#1e40af' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)'; (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>Открыть</button>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  )
}


