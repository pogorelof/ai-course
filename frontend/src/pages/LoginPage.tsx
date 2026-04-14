import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthAPI } from '../services/api'
import { PageContainer } from '../components/PageContainer'

export function LoginPage({ onLogin }: { onLogin: (token: string, username: string) => void }) {
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
      const data = await AuthAPI.login({ username, password })
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
      <div className="section-stack">
        <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
          <h1 className="page-hero-title">Вход</h1>
          <p className="page-subtitle">Продолжите обучение и откройте свои курсы.</p>
        </div>
        <div className="form-card">
          <form className="form-grid" onSubmit={handleSubmit}>
            {error && <p className="status-error">{error}</p>}
            <div className="field">
              <span>Логин</span>
              <input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                required
              />
            </div>
            <div className="field">
              <span>Пароль</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
              {loading ? 'Входим...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </PageContainer>
  )
}


