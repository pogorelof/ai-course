import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { GeneratedTopic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { MarkdownRenderer } from '../components/MarkdownRenderer'

export function TopicPage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { topicId } = useParams()
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!token || !topicId) return
      setLoading(true)
      setError(null)
      setContent(null)
      setTitle(null)
      setCourseId(null)
      try {
        const data: GeneratedTopic = await CoursesAPI.generateTopic(topicId)
        setTitle(data.course_title)
        setCourseId(data.course_id)
        setContent(data.content)
      } catch (e) {
        setError('Ошибка генерации контента')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token, topicId])

  return (
    <PageContainer fullWidth>
      <div className="section-stack" style={{ width: '100%', maxWidth: 1600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8 }}>
            <LoadingPulse />
            <span>Генерируем контент...</span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%', maxWidth: 1500, margin: '0 auto' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h1 className="page-hero-title">{title ? `Курс: ${title}` : 'Глава курса'}</h1>
              </div>
              {courseId && (
                <Link to={`/courses/${courseId}`} className="btn btn-pill">
                  Все темы
                </Link>
              )}
            </div>
            {error && <p className="status-error" style={{ textAlign: 'center' }}>{error}</p>}
            {content && (
              <div className="surface-card surface-card--light" style={{ width: '100%', maxWidth: 1500, margin: '0 auto' }}>
                <MarkdownRenderer markdown={content} />
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  )
}


