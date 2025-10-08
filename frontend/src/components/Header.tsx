import { Link } from 'react-router-dom'
import type { AuthState } from '../types/domain'

export function Header({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
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
          <button
            onClick={onLogout}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #ef4444',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'transform .12s, background-color .12s'
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.transform = 'scale(1.03)'
              btn.style.backgroundColor = '#b91c1c'
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.transform = 'scale(1.0)'
              btn.style.backgroundColor = '#ef4444'
            }}
          >
            Выйти
          </button>
        </div>
      ) : (
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link
            to="/login"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              textDecoration: 'none',
              color: '#111827',
              backgroundColor: '#ffffff',
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform .12s, background-color .12s'
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'scale(1.03)'
              el.style.backgroundColor = '#f3f4f6'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'scale(1.0)'
              el.style.backgroundColor = '#ffffff'
            }}
          >Вход</Link>
          <Link
            to="/register"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #2563eb',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              textDecoration: 'none',
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform .12s, background-color .12s'
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'scale(1.03)'
              el.style.backgroundColor = '#1e40af'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.transform = 'scale(1.0)'
              el.style.backgroundColor = '#2563eb'
            }}
          >Регистрация</Link>
        </nav>
      )}
    </header>
  )
}


