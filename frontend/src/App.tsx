import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import './App.css'

type AuthState = {
  isAuthenticated: boolean
  username: string | null
  token: string | null
}

function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem('access_token')
    const username = localStorage.getItem('username')
    return { isAuthenticated: Boolean(token), username, token }
  })

  const login = (token: string, username: string) => {
    localStorage.setItem('access_token', token)
    localStorage.setItem('username', username)
    setAuth({ isAuthenticated: true, username, token })
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('username')
    setAuth({ isAuthenticated: false, username: null, token: null })
  }

  return useMemo(() => ({ auth, login, logout }), [auth])
}

function Header({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      backgroundColor: '#eef1f5',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      margin: '12px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
    }}>
      <Link to="/" style={{
        fontSize: 20,
        fontWeight: 700,
        color: '#111827',
        textDecoration: 'none'
      }}>Courses</Link>
      {auth.isAuthenticated ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#4b5563' }}>Привет, {auth.username}</span>
          <button onClick={onLogout} style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #ef4444',
            backgroundColor: '#ef4444',
            color: '#ffffff'
          }}>Выйти</button>
        </div>
      ) : (
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/login" style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            textDecoration: 'none',
            color: '#111827',
            backgroundColor: '#ffffff'
          }}>Вход</Link>
          <Link to="/register" style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #2563eb',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            textDecoration: 'none'
          }}>Регистрация</Link>
        </nav>
      )}
    </header>
  )
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      color: '#111827'
    }}>
      {/* Header rendered in App with auth */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  )
}

function HomePage() {
  const token = localStorage.getItem('access_token')
  const [courses, setCourses] = useState<Array<{ id: number; title: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCourses = async () => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('http://localhost:8000/courses/mine', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('Не удалось загрузить курсы')
        const data = await res.json()
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
          <Link to="/new" style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', textDecoration: 'none' }}>Создать курс</Link>
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

function LoginPage({ onLogin }: { onLogin: (token: string, username: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Ошибка входа')
      }
      const data: { access_token: string; token_type?: string } = await res.json()
      onLogin(data.access_token, username)
      navigate('/')
    } catch (err) {
      setError('Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, marginBottom: 16, textAlign: 'center' }}>Вход</h1>
          <form style={{ display: 'grid', gap: 12 }} onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
                padding: '8px 12px', borderRadius: 8
              }}>
                {error}
              </div>
            )}
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Логин</span>
              <input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Пароль</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
                required
              />
            </label>
            <button type="submit" disabled={loading} style={{
              padding: '10px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', width: '100%', opacity: loading ? 0.8 : 1
            }}>{loading ? 'Входим...' : 'Войти'}</button>
          </form>
        </div>
      </div>
    </PageContainer>
  )
}

function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      })
      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || 'Ошибка регистрации')
      }
      // Успех — перенаправляем на страницу входа
      navigate('/login')
    } catch (err) {
      setError('Не удалось создать аккаунт. Возможно, логин или email заняты.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, marginBottom: 16, textAlign: 'center' }}>Регистрация</h1>
          <form style={{ display: 'grid', gap: 12 }} onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
                padding: '8px 12px', borderRadius: 8
              }}>{error}</div>
            )}
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Логин</span>
              <input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Пароль</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
                required
              />
            </label>
            <button type="submit" disabled={loading} style={{
              padding: '10px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', width: '100%', opacity: loading ? 0.8 : 1
            }}>{loading ? 'Создаём...' : 'Создать аккаунт'}</button>
          </form>
        </div>
      </div>
    </PageContainer>
  )
}

export default function App() {
  const { auth, login, logout } = useAuth()
  return (
    <BrowserRouter>
      <Header auth={auth} onLogout={logout} />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage onLogin={login} />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/new" element={<NewCoursePage />} />
        <Route path="/courses/:courseId" element={<CoursePage />} />
        <Route path="/topics/:topicId" element={<TopicPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function LoadingPulse() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#2563eb', animation: 'pulse 1.2s infinite ease-in-out' }} />
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#60a5fa', animation: 'pulse 1.2s 0.2s infinite ease-in-out' }} />
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#93c5fd', animation: 'pulse 1.2s 0.4s infinite ease-in-out' }} />
      <style>{`@keyframes pulse {0%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}100%{opacity:.3;transform:translateY(0)}}`}</style>
    </div>
  )
}

function NewCoursePage() {
  const token = localStorage.getItem('access_token')
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [wishes, setWishes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topics, setTopics] = useState<Array<{ id: number; title: string }>>([])
  const [createdCourseId, setCreatedCourseId] = useState<number | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:8000/courses/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, wishes })
      })
      if (!res.ok) throw new Error('Не удалось сгенерировать курс')
      const data: { course_id: number; topics: Array<{ id: number; title: string }> } = await res.json()
      setCreatedCourseId(data.course_id)
      setTopics(data.topics)
    } catch (e) {
      setError('Ошибка генерации. Проверьте API ключ на сервере.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Новый курс</h1>
      {!createdCourseId ? (
        <form style={{ display: 'grid', gap: 12, maxWidth: 720 }} onSubmit={submit}>
          {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Тема курса</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Ваши пожелания</span>
            <textarea value={wishes} onChange={(e) => setWishes(e.target.value)} rows={6} required style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }} />
          </label>
          <button disabled={loading || !token} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', width: 'fit-content' }}>
            {loading ? <LoadingPulse /> : 'Сгенерировать структуру (15 тем)'}
          </button>
          {!token && <p>Нужно войти, чтобы создавать курс.</p>}
        </form>
      ) : (
        <div>
          <p style={{ marginBottom: 12 }}>Курс создан. Ниже 15 тем. Нажмите на тему, чтобы открыть.</p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {topics.map(t => (
              <li key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t.title}</span>
                <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
                  <button style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', transition: 'transform .12s, background .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLButtonElement).style.background = '#1e40af' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)'; (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>Открыть</button>
                </Link>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate(`/courses/${createdCourseId}`)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}>Перейти к курсу</button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function CoursePage() {
  const token = localStorage.getItem('access_token')
  const { courseId } = useParams()
  const [topics, setTopics] = useState<Array<{ id: number; title: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!token || !courseId) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`http://localhost:8000/courses/${courseId}/topics`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('Не удалось загрузить темы')
        const data = await res.json()
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
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {topics.map(t => (
          <li key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t.title}</span>
            <Link to={`/topics/${t.id}`} style={{ textDecoration: 'none' }}>
              <button style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', transition: 'transform .12s, background .12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLButtonElement).style.background = '#1e40af' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)'; (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>Открыть</button>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  )
}

function TopicPage() {
  const token = localStorage.getItem('access_token')
  const { topicId } = useParams()
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [topics, setTopics] = useState<Array<{ id: number; title: string }>>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!token || !topicId) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`http://localhost:8000/courses/topics/${topicId}/generate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('Не удалось загрузить контент')
        const data: { course_title: string; course_id: number; topic_id: number; content: string } = await res.json()
        setTitle(data.course_title)
        setCourseId(data.course_id)
        setContent(data.content)
        // Load topics for sidebar
        const list = await fetch(`http://localhost:8000/courses/${data.course_id}/topics`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (list.ok) {
          const arr: Array<{ id: number; title: string; content?: string | null }> = await list.json()
          setTopics(arr.map(t => ({ id: t.id, title: t.title })))
        }
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
        {/* Sidebar */}
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

        {/* Main content */}
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

function MarkdownRenderer({ markdown }: { markdown: string }) {
  // Lightweight markdown-to-HTML using browser-safe approach
  // For simplicity, use a very small converter for common syntax
  const html = toHtml(markdown)
  return (
    <div
      className="prose"
      style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, textAlign: 'left', lineHeight: 1.5 }}
    >
      <style>{`
        .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 { margin: 0.7em 0 0.35em; font-weight: 700; }
        .prose p { margin: 0.45em 0; }
        .prose ul, .prose ol { margin: 0.5em 0; padding-left: 1.2em; }
        .prose ul { list-style: disc; list-style-position: outside; }
        .prose li { margin: 0.2em 0; }
        .prose pre { margin: 10px 0; overflow: auto; text-align: left; background: #1f2937; color: #f3f4f6; padding: 12px; border-radius: 8px; position: relative; }
        .prose pre .lang-badge { position: absolute; top: 6px; right: 8px; font-size: 12px; color: #9ca3af; }
        .prose code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        /* Minimal token colors */
        .tok-keyword { color: #93c5fd; }
        .tok-string  { color: #86efac; }
        .tok-number  { color: #fca5a5; }
        .tok-comment { color: #9ca3af; }
        .tok-tag     { color: #fcd34d; }
        .tok-attr    { color: #fde68a; }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function toHtml(md: string) {
  // Very basic converter: headings, bold, italics, inline code, lists, paragraphs
  // Extract fenced code blocks first and protect them with placeholders
  let original = md.replace(/\r\n/g, '\n')
  const codeBlocks: string[] = []
  original = original.replace(/```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/g, (_m, lang, body) => {
    const language = (lang || '').toLowerCase()
    let inner = (body || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/^\n+|\n+$/g, '')
    const highlighted = highlightCode(language, inner)
    const badge = language ? `<span class=\"lang-badge\">${language}</span>` : ''
    const html = `<pre style=\"background:#1f2937;color:#f3f4f6;padding:12px;border-radius:8px;overflow:auto\">${badge}<code>${highlighted}</code></pre>`
    const token = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(html)
    return token
  })

  // Escape the rest
  let text = escapeHtml(original.trim())
  // headings
  text = text.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
  text = text.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
  text = text.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
  text = text.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
  text = text.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
  text = text.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
  // inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:2px 4px;border-radius:4px">$1</code>')
  // bold & italic
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>')
  // unordered lists
  text = text.replace(/^(?:-\s+.+\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map(li => li.replace(/^[-*]\s+/, ''))
      .map(li => li.replace(/^\.\s+/, ''))
      .map(li => `<li>${li}</li>`)
      .join('')
    return `<ul>${items}</ul>`
  })
  // paragraphs
  text = text.replace(/^(?!<h\d>|<ul>|<pre|<p>|<\/)(.+)$/gm, '<p>$1</p>')
  // Restore code blocks
  text = codeBlocks.reduce((acc, html, i) => acc.replaceAll(`__CODE_BLOCK_${i}__`, html), text)
  return text
}

function highlightCode(language: string, code: string): string {
  const esc = escapeHtml(code)
  const apply = (text: string, rules: Array<[RegExp, string]>) => {
    return rules.reduce((acc, [re, cls]) => acc.replace(re, cls), text)
  }
  switch (language) {
    case 'js': case 'javascript': case 'ts': case 'typescript': {
      const rules: Array<[RegExp, string]> = [
        [/\/\/.*$/gm, '<span class="tok-comment">$&</span>'],
        [/("[^"]*"|'[^']*'|`[^`]*`)/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>'],
        [/\b(const|let|var|function|return|if|else|for|while|class|extends|new|try|catch|finally|throw|import|from|export|default|await|async|switch|case|break|continue|this|super)\b/g, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'py': case 'python': {
      const rules: Array<[RegExp, string]> = [
        [/#.*$/gm, '<span class="tok-comment">$&</span>'],
        [/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>'],
        [/\b(def|class|return|if|elif|else|for|while|try|except|finally|with|as|import|from|pass|break|continue|lambda|yield|global|nonlocal|assert|raise|in|is|and|or|not)\b/g, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'java': {
      const rules: Array<[RegExp, string]> = [
        [/\/\/.*$/gm, '<span class="tok-comment">$&</span>'],
        [/\/\*[\s\S]*?\*\//g, '<span class="tok-comment">$&</span>'],
        [/("[^"]*")/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>'],
        [/\b(class|interface|enum|public|private|protected|static|final|void|int|long|double|float|boolean|char|new|return|if|else|for|while|try|catch|finally|throw|throws|extends|implements|package|import)\b/g, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'xml': case 'html': {
      let text = esc
      text = text.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
      text = text.replace(/(&lt;\/?)([a-zA-Z0-9:-]+)([^&]*?)(\s*\/??&gt;)/g, (_m, p1, p2, p3, p4) => {
        const attrs = p3.replace(/([a-zA-Z_:][a-zA-Z0-9:._-]*)(=)("[^"]*"|'[^']*')/g, '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>')
        return `${p1}<span class=\"tok-tag\">${p2}</span>${attrs}${p4}`
      })
      return text
    }
    case 'json': {
      let text = esc
      text = text.replace(/("[^"]*"\s*:)/g, '<span class="tok-attr">$1</span>')
      text = text.replace(/("[^"]*")/g, '<span class="tok-string">$1</span>')
      text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>')
      return text
    }
    case 'bash': case 'sh': case 'shell': {
      const rules: Array<[RegExp, string]> = [
        [/^#.*/gm, '<span class="tok-comment">$&</span>'],
        [/("[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'sql': {
      const rules: Array<[RegExp, string]> = [
        [/(--.*$)/gm, '<span class="tok-comment">$1</span>'],
        [/("[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>'],
        [/\b(SELECT|FROM|WHERE|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP BY|ORDER BY|LIMIT|OFFSET)\b/gi, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    default:
      return esc
  }
}
