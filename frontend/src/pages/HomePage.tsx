import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { Course } from '../types/domain'
import { PageContainer } from '../components/PageContainer'

export function HomePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCourses = async () => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const data = await CoursesAPI.myCourses()
        setCourses(data)
      } catch (e) {
        setError('Ошибка при загрузке курсов')
      } finally {
        setLoading(false)
      }
    }
    fetchCourses()
  }, [token])

  return (
    <PageContainer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Мои курсы</h1>
        {token && (
          <Link
            to="/new"
            className="glass-button"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid rgba(37,99,235,0.45)',
              background: 'rgba(37,99,235,0.18)',
              color: '#e5e7eb',
              textDecoration: 'none',
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform .12s, filter .12s'
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'translateY(-1px)'
              el.style.filter = 'brightness(1.1)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'translateY(0)'
              el.style.filter = 'none'
            }}
          >
            Создать курс
          </Link>
        )}
      </div>
      {!token && <p>Войдите, чтобы видеть свои курсы.</p>}
      {token && (
        <div>
          {loading && <p>Загрузка...</p>}
          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {courses.map((c) => (
              <li key={c.id} className="glass-surface" style={{ borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{c.title}</span>
                <Link to={`/courses/${c.id}`} style={{ textDecoration: 'none' }}>
                  <button className="glass-button" style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', transition: 'transform .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}>Открыть</button>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  )
}


