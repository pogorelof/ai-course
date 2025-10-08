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
          <aside style={{ width: 260, flex: '0 0 260px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, height: 'fit-content', position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ fontSize: 14, color: '#374151' }}>Темы курса</strong>
              <button onClick={() => setSidebarOpen(false)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Скрыть</button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {topics.map(t => (
                <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f3f4f6', borderRadius: 8, padding: '8px 10px', background: String(t.id) === topicId ? '#eef2ff' : '#fff' }}>
                  <span style={{ fontSize: 14 }}>{t.title}</span>
                  <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
                    <button style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', transition: 'transform .12s, background .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLButtonElement).style.background = '#1e40af' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)'; (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>Открыть</button>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>{title ? `Курс: ${title}` : 'Загрузка темы...'}</h1>
            <div>
              {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Показать темы</button>
              )}
              {courseId && (
                <Link to={`/courses/${courseId}`} style={{ marginLeft: 8, textDecoration: 'none' }}>
                  <button style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', transition: 'transform .12s, background .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLButtonElement).style.background = '#1e40af' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)'; (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>Все темы</button>
                </Link>
              )}
            </div>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LoadingPulse />
              <span>Генерируем контент...</span>
            </div>
          )}
          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
          {content && <MarkdownRenderer markdown={content} />}
        </div>
      </div>
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="Показать темы"
          style={{ position: 'fixed', left: 12, top: 120, zIndex: 20, padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#ffffff', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
        >Темы</button>
      )}
    </PageContainer>
  )
}


