import { Link } from 'react-router-dom'
import type { AuthState } from '../types/domain'

export function Header({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        height: 48,
        background: 'rgba(245, 245, 247, 0.88)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <div
        className="app-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%',
          padding: '0 12px',
        }}
      >
        <Link
          to="/"
          style={{
            color: '#1d1d1f',
            textDecoration: 'none',
            fontFamily: '"SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontSize: 21,
            fontWeight: 600,
            lineHeight: 1.19,
            letterSpacing: '0.231px',
          }}
        >
          Courses
        </Link>
        {auth.isAuthenticated ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ color: 'rgba(0, 0, 0, 0.8)', fontSize: 12, lineHeight: 1.33, letterSpacing: '-0.12px' }}>Привет, {auth.username}</span>
            <button onClick={onLogout} className="btn btn-secondary">
              Выйти
            </button>
          </div>
        ) : (
          <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link to="/login" className="link-inline">
              Вход
            </Link>
            <Link to="/register" className="btn btn-primary">
              Регистрация
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}


