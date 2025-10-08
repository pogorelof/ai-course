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
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, marginBottom: 16, textAlign: 'center' }}>Регистрация</h1>
          <form className="glass-surface" style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 16 }} onSubmit={handleSubmit}>
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
                className="glass-input"
                style={{ padding: '12px 14px', borderRadius: 10, fontSize: 16 }}
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
                className="glass-input"
                style={{ padding: '12px 14px', borderRadius: 10, fontSize: 16 }}
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
                className="glass-input"
                style={{ padding: '12px 14px', borderRadius: 10, fontSize: 16 }}
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="glass-button"
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid rgba(37,99,235,0.45)',
                background: 'rgba(37,99,235,0.18)',
                color: '#e5e7eb',
                width: '100%',
                opacity: loading ? 0.8 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'transform .12s, filter .12s'
              }}
              onMouseEnter={(e) => {
                if (loading) return
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.transform = 'translateY(-1px)'
                btn.style.filter = 'brightness(1.1)'
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.transform = 'translateY(0)'
                btn.style.filter = 'none'
              }}
            >
              {loading ? 'Создаём...' : 'Создать аккаунт'}
            </button>
          </form>
        </div>
      </div>
    </PageContainer>
  )
}


