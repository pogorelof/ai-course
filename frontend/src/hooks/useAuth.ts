import { useMemo, useState } from 'react'
import type { AuthState } from '../types/domain'
import { clearAuth, setAuth as persistAuth } from '../services/api'

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
    const username = typeof localStorage !== 'undefined' ? localStorage.getItem('username') : null
    return { isAuthenticated: Boolean(token), username, token }
  })

  const login = (token: string, username: string) => {
    persistAuth(token, username)
    setAuth({ isAuthenticated: true, username, token })
  }

  const logout = () => {
    clearAuth()
    setAuth({ isAuthenticated: false, username: null, token: null })
  }

  return useMemo(() => ({ auth, login, logout }), [auth])
}


