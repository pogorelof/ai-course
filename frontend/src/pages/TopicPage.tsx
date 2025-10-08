import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { GeneratedTopic, Topic } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { MarkdownRenderer } from '../components/MarkdownRenderer'

export function TopicPage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const { topicId } = useParams()
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
        const list = await CoursesAPI.courseTopics(data.course_id)
        setTopics(list.map(t => ({ id: t.id, title: t.title })))
      } catch (e) {
        setError('Ошибка генерации контента')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token, topicId])

  return (
    <PageContainer>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflow: 'hidden' }}>
        {sidebarOpen && (
          <aside className="glass-surface" style={{ width: 260, flex: '0 0 260px', borderRadius: 14, padding: 12, height: 'fit-content', position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ fontSize: 14, color: '#e5e7eb' }}>Темы курса</strong>
              <button className="glass-button" onClick={() => setSidebarOpen(false)} style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(148,163,184,0.18)', cursor: 'pointer', transition: 'transform .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}>Скрыть</button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {topics.map(t => (
                <li key={t.id} className="glass-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, padding: '8px 10px', background: String(t.id) === topicId ? 'rgba(99,102,241,0.18)' : undefined }}>
                  <span style={{ fontSize: 14 }}>{t.title}</span>
                  <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
                    <button className="glass-button" style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', transition: 'transform .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}>Открыть</button>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8 }}>
              <LoadingPulse />
              <span>Генерируем контент...</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h1 style={{ fontSize: 24, marginBottom: 12, color: '#f1f5f9' }}>{title ? `Курс: ${title}` : ''}</h1>
                <div>
                  {!sidebarOpen && (
                    <button className="glass-button" onClick={() => setSidebarOpen(true)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(148,163,184,0.18)', cursor: 'pointer' }}>Показать темы</button>
                  )}
                  {courseId && (
                    <Link to={`/courses/${courseId}`} style={{ marginLeft: 8, textDecoration: 'none' }}>
                      <button className="glass-button" style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', transition: 'transform .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}>Все темы</button>
                    </Link>
                  )}
                </div>
              </div>
              {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
              {content && (
                <div className="glass-surface" style={{ borderRadius: 16, padding: 12 }}>
                  <MarkdownRenderer markdown={content} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="Показать темы"
          className="glass-button"
          style={{ position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 30, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(148,163,184,0.18)', cursor: 'pointer' }}
        >Темы</button>
      )}
    </PageContainer>
  )
}


