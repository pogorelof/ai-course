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
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform .12s, background .12s'
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'scale(1.03)'
              el.style.background = '#1e40af'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'scale(1.0)'
              el.style.background = '#2563eb'
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
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {courses.map((c) => (
              <li key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{c.title}</span>
                <Link to={`/courses/${c.id}`} style={{ textDecoration: 'none' }}>
                  <button style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', transition: 'transform .12s, background .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLButtonElement).style.background = '#1e40af' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)'; (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>Открыть</button>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  )
}


