import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthAPI } from '../services/api'
import { PageContainer } from '../components/PageContainer'

export function RegisterPage() {
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
      await AuthAPI.register({ username, email, password })
      navigate('/login')
    } catch (err) {
      setError('Не удалось создать аккаунт. Возможно, логин или email заняты.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="section-stack">
        <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
          <h1 className="page-hero-title">Регистрация</h1>
          <p className="page-subtitle">Создайте аккаунт и получите доступ к созданию курсов.</p>
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
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {loading ? 'Создаём...' : 'Создать аккаунт'}
            </button>
          </form>
        </div>
      </div>
    </PageContainer>
  )
}


