import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CoursesAPI } from '../services/api'
import type { Course } from '../types/domain'
import { PageContainer } from '../components/PageContainer'
import { LoadingPulse } from '../components/LoadingPulse'
import { ModelLogo } from '../components/ModelLogo'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

async function renderPdfCover(blob: Blob): Promise<string> {
  const data = new Uint8Array(await blob.arrayBuffer())
  const loadingTask = getDocument({ data })
  const pdf = await loadingTask.promise
  try {
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const targetWidth = 260
    const scale = targetWidth / baseViewport.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No canvas context')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: context, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    await pdf.destroy()
  }
}

export function HomePage() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingCourseId, setDeletingCourseId] = useState<number | null>(null)
  const [openingBookCourseId, setOpeningBookCourseId] = useState<number | null>(null)
  const [bookCovers, setBookCovers] = useState<Record<number, string>>({})

  const fetchCourses = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await CoursesAPI.myCourses()
      setCourses(data)
    } catch {
      setError('Ошибка при загрузке курсов')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCourses()
  }, [token])

  useEffect(() => {
    let cancelled = false
    const loadBookCovers = async () => {
      const withBooks = courses.filter(course => course.has_book)
      for (const course of withBooks) {
        if (cancelled || bookCovers[course.id]) continue
        try {
          const blob = await CoursesAPI.fetchCourseBookBlob(course.id)
          const imageDataUrl = await renderPdfCover(blob)
          if (!cancelled) {
            setBookCovers(prev => ({ ...prev, [course.id]: imageDataUrl }))
          }
        } catch {
          // Keep silent and fallback to generic card.
        }
      }
    }
    loadBookCovers()
    return () => {
      cancelled = true
    }
  }, [courses, bookCovers])

  const handleDeleteCourse = async (courseId: number) => {
    if (deletingCourseId) return
    const confirmed = window.confirm('Удалить курс? Это действие нельзя отменить.')
    if (!confirmed) return
    setDeletingCourseId(courseId)
    try {
      await CoursesAPI.deleteCourse(courseId)
      setCourses(prev => prev.filter(c => c.id !== courseId))
    } catch {
      setError('Не удалось удалить курс')
    } finally {
      setDeletingCourseId(null)
    }
  }

  const handleOpenBook = async (courseId: number) => {
    if (openingBookCourseId) return
    setOpeningBookCourseId(courseId)
    try {
      const objectUrl = await CoursesAPI.openCourseBook(courseId)
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      setError('Не удалось открыть книгу')
    } finally {
      setOpeningBookCourseId(null)
    }
  }

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
                <li key={c.id} className="course-row-split">
                  <div className="course-panel-main">
                    <div className="course-main-content">
                      <span style={{ fontWeight: 600, lineHeight: 1.24 }}>{c.title}</span>
                      <span className="course-model">
                        <ModelLogo size={11} provider={c.ai_provider} model={c.ai_model ?? 'gpt-4o-mini'} />
                        <span>{c.ai_model ?? 'gpt-4o-mini'}</span>
                      </span>
                      <p className={c.wishes && c.wishes.trim().length > 0 ? 'course-wishes' : 'course-wishes course-wishes--empty'}>
                        {c.wishes && c.wishes.trim().length > 0 ? c.wishes : 'Нет пожеланий на курс'}
                      </p>
                    </div>
                    <div className="course-actions">
                      <Link to={`/courses/${c.id}`} className="btn btn-pill">
                        Открыть
                      </Link>
                      <button
                        type="button"
                        className="btn btn-pill btn-pill-delete"
                        disabled={deletingCourseId === c.id}
                        onClick={() => handleDeleteCourse(c.id)}
                        title="Удалить курс"
                      >
                        {deletingCourseId === c.id ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </div>
                  </div>

                  <div className="course-panel-book">
                    {c.has_book ? (
                      <button
                        type="button"
                        className="book-cover-link"
                        onClick={() => handleOpenBook(c.id)}
                        disabled={openingBookCourseId === c.id}
                        title={c.book_name ?? 'Открыть книгу'}
                      >
                        <div className="book-cover">
                          <span className="book-cover-badge">PDF</span>
                          {bookCovers[c.id] ? (
                            <img src={bookCovers[c.id]} alt={c.book_name ?? 'Обложка книги'} className="book-cover-image" />
                          ) : (
                            <span className="book-cover-title">{c.book_name ?? 'Книга курса'}</span>
                          )}
                        </div>
                      </button>
                    ) : (
                      <p className="status-muted" style={{ margin: 0 }}>Книга не прикреплена</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageContainer>
  )
}


