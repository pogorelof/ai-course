import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { Course } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'

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
      <div className="section-stack">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <h1 className="page-hero-title">Мои курсы</h1>
            <p className="page-subtitle">Ваши персональные курсы и точки входа в главы.</p>
          </div>
          {token && (
            <Link to="/new" className="btn btn-primary">
              Создать курс
            </Link>
          )}
        </div>
        {!token && <p className="status-muted">Войдите, чтобы видеть свои курсы.</p>}
        {token && (
          <div className="section-stack">
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <LoadingPulse />
                <p className="status-muted">Загрузка курсов...</p>
              </div>
            )}
            {error && <p className="status-error">{error}</p>}
            {!loading && !error && courses.length === 0 && <p className="status-muted">Курсов пока нет. Начните с создания нового.</p>}
            <ul className="list-stack">
              {courses.map((c) => (
                <li key={c.id} className="list-row">
                  <span style={{ fontWeight: 600, lineHeight: 1.24 }}>{c.title}</span>
                  <Link to={`/courses/${c.id}`} className="btn btn-pill">
                    Открыть
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageContainer>
  )
}


