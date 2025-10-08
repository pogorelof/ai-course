import { Link } from 'react-router-dom'
import type { AuthState } from '../types/domain'

export function Header({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  return (
    <header className="glass-surface" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      borderRadius: 14,
      margin: '12px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <Link to="/" style={{
        fontSize: 20,
        fontWeight: 700,
        color: '#f8fafc',
        textDecoration: 'none'
      }}>Courses</Link>
      {auth.isAuthenticated ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#cbd5e1' }}>Привет, {auth.username}</span>
          <button
            onClick={onLogout}
            className="glass-button"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid rgba(239, 68, 68, 0.45)',
              background: 'rgba(239, 68, 68, 0.20)',
              boxShadow: '0 3px 10px rgba(239,68,68,0.14)',
              cursor: 'pointer',
              transition: 'transform .12s, filter .12s'
            }}
            onMouseEnter={(e) => {
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
            Выйти
          </button>
        </div>
      ) : (
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link
            to="/login"
            className="glass-button"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(148,163,184,0.18)',
              color: '#e5e7eb',
              textDecoration: 'none',
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform .12s, filter .12s'
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'translateY(-1px)'
              el.style.filter = 'brightness(1.1)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'translateY(0)'
              el.style.filter = 'none'
            }}
          >Вход</Link>
          <Link
            to="/register"
            className="glass-button"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid rgba(37,99,235,0.45)',
              background: 'rgba(37,99,235,0.18)',
              color: '#e5e7eb',
              textDecoration: 'none',
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform .12s, filter .12s'
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'translateY(-1px)'
              el.style.filter = 'brightness(1.1)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'translateY(0)'
              el.style.filter = 'none'
            }}
          >Регистрация</Link>
        </nav>
      )}
    </header>
  )
}


