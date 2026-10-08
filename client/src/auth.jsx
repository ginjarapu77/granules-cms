import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      setReady(true)
      return
    }
    api('/api/auth/me')
      .then(setUser)
      .catch(() => sessionStorage.removeItem('token'))
      .finally(() => setReady(true))
  }, [])

  const value = useMemo(() => ({
    user,
    ready,
    async login(email, password) {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      sessionStorage.setItem('token', result.token)
      setUser(result.user)
      return result.user
    },
    logout() {
      sessionStorage.removeItem('token')
      setUser(null)
    },
  }), [user, ready])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function RequireAuth() {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="boot">Loading the workspace…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
