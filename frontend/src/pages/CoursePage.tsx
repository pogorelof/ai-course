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
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {topics.map(t => (
          <li key={t.id} className="glass-surface" style={{ borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t.title}</span>
            <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
              <button className="glass-button" style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', transition: 'transform .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}>Открыть</button>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  )
}


