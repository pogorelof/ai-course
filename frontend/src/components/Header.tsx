import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuthState } from '../types/domain'
import { AuthAPI } from '../services/api'

export function Header({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openaiKey, setOpenaiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false)
  const [hasOpenRouterKey, setHasOpenRouterKey] = useState(false)
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)
  const [keyStatus, setKeyStatus] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  const openApiKeysMenu = async () => {
    setMenuOpen(prev => !prev)
    if (menuOpen || !auth.isAuthenticated) return
    setLoadingKeys(true)
    setKeyStatus(null)
    setOpenaiKey('')
    setOpenrouterKey('')
    try {
      const keys = await AuthAPI.apiKeys()
      setHasOpenAIKey(Boolean(keys.has_openai_key))
      setHasOpenRouterKey(Boolean(keys.has_openrouter_key))
    } catch {
      setKeyStatus('Не удалось загрузить статус ключей')
    } finally {
      setLoadingKeys(false)
    }
  }

  const saveApiKeys = async () => {
    const trimmedOpenAI = openaiKey.trim()
    const trimmedOpenRouter = openrouterKey.trim()
    if (!trimmedOpenAI && !trimmedOpenRouter) {
      setKeyStatus('Введите хотя бы один ключ')
      return
    }
    setSavingKeys(true)
    setKeyStatus(null)
    try {
      const updated = await AuthAPI.updateApiKeys({
        openai_api_key: trimmedOpenAI || undefined,
        openrouter_api_key: trimmedOpenRouter || undefined,
      })
      setHasOpenAIKey(Boolean(updated.has_openai_key))
      setHasOpenRouterKey(Boolean(updated.has_openrouter_key))
      setOpenaiKey('')
      setOpenrouterKey('')
      setKeyStatus('Ключ сохранен')
    } catch {
      setKeyStatus('Не удалось сохранить ключ')
    } finally {
      setSavingKeys(false)
    }
  }

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        height: 48,
        background: 'rgba(255, 255, 255, 0.92)',
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', position: 'relative' }} ref={menuRef}>
            <span style={{ color: 'rgba(0, 0, 0, 0.8)', fontSize: 12, lineHeight: 1.33, letterSpacing: '-0.12px' }}>Привет, {auth.username}</span>
            <button onClick={openApiKeysMenu} className="btn btn-secondary">
              Ключи API
            </button>
            {menuOpen && (
              <div className="api-keys-popover">
                <div className="field">
                  <span>OpenAI API key</span>
                  <input
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="input"
                    type="password"
                    placeholder={hasOpenAIKey ? 'Ключ уже сохранен, введите новый' : 'sk-...'}
                    autoComplete="off"
                    disabled={loadingKeys || savingKeys}
                  />
                </div>
                <div className="field">
                  <span>OpenRouter API key</span>
                  <input
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    className="input"
                    type="password"
                    placeholder={hasOpenRouterKey ? 'Ключ уже сохранен, введите новый' : 'or-...'}
                    autoComplete="off"
                    disabled={loadingKeys || savingKeys}
                  />
                </div>
                {keyStatus && <p className="status-muted">{keyStatus}</p>}
                <p className="status-muted" style={{ fontSize: 12 }}>
                  OpenAI: {hasOpenAIKey ? 'ключ сохранен' : 'ключ не задан'}; OpenRouter: {hasOpenRouterKey ? 'ключ сохранен' : 'ключ не задан'}
                </p>
                <button onClick={saveApiKeys} className="btn btn-primary" disabled={loadingKeys || savingKeys}>
                  {savingKeys ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            )}
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


