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

  const getScoreClassName = (score: number) => {
    if (score > 60) return 'topic-score topic-score--green'
    if (score >= 40) return 'topic-score topic-score--orange'
    return 'topic-score topic-score--red'
  }

  return (
    <PageContainer>
      <div className="section-stack">
        <div style={{ display: 'grid', gap: 6 }}>
          <h1 className="page-hero-title">Темы курса</h1>
          <p className="page-subtitle">Выберите тему и откройте детальную главу.</p>
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
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, lineHeight: 1.24 }}>{t.title}</span>
                {!t.has_attempts ? (
                  <span className="topic-score topic-score--red">Тест не пройден</span>
                ) : (
                  <span className={getScoreClassName(t.last_score_percent ?? 0)}>
                    {t.has_passed_quiz ? `Тест: ${t.last_score_percent}%` : `Тест не пройден: ${t.last_score_percent}%`}
                  </span>
                )}
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


