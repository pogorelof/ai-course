import { useEffect, useMemo, useState } from 'react'
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

  // Subtle random gradient glow background per topic
  const glowStyle = useMemo(() => {
    // random seeds based on topicId to keep consistent per topic
    const seed = Number(topicId || 0)
    const rnd = (min: number, max: number, s: number) => {
      const x = Math.sin(s + 1) * 10000
      return min + (x - Math.floor(x)) * (max - min)
    }
    const c1 = 'rgba(236, 72, 153, 0.14)'
    const c2 = 'rgba(59, 130, 246, 0.14)'
    const c3 = 'rgba(245, 158, 11, 0.12)'
    const p1 = `${rnd(5, 85, seed + 1)}% ${rnd(0, 40, seed + 2)}%`
    const p2 = `${rnd(20, 90, seed + 3)}% ${rnd(50, 100, seed + 4)}%`
    const p3 = `${rnd(0, 60, seed + 5)}% ${rnd(30, 90, seed + 6)}%`
    const bg = `radial-gradient(800px 600px at ${p1}, ${c1}, transparent 60%),
                radial-gradient(700px 500px at ${p2}, ${c2}, transparent 60%),
                radial-gradient(700px 500px at ${p3}, ${c3}, transparent 60%)`
    return {
      background: bg,
      filter: 'blur(40px) saturate(120%)',
      opacity: 0.6,
    } as React.CSSProperties
  }, [topicId])

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
      <div style={{ position: 'relative' }}>
        <div aria-hidden style={{ position: 'absolute', inset: -120, zIndex: 0, pointerEvents: 'none', ...glowStyle }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ minWidth: 0 }}>
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
                  {courseId && (
                    <Link to={`/courses/${courseId}`} style={{ textDecoration: 'none' }}>
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
    </PageContainer>
  )
}


