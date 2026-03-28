import { createContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, type LoginResponse } from '@/api/auth'
import { User } from '@/types/user'
import { STORAGE_KEYS } from '@/utils/constants'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  login: (email: string, password: string) => Promise<LoginResponse>
  logout: () => Promise<void>
  applyAuth: (payload: LoginResponse) => void
  refreshProfile: () => Promise<void>
  setCurrentUser: (user: User | null) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

function clearStoredAuth() {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  const applyAuth = (payload: LoginResponse) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, payload.access_token)
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, payload.refresh_token)
    setUser(payload.user)
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Best-effort server logout; local cleanup still happens below.
    }
    clearStoredAuth()
    setUser(null)
  }

  const refreshProfile = async () => {
    const { data } = await authApi.me()
    setUser(data.user)
  }

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password)
    applyAuth(data)
    return data
  }

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
      try {
        if (token) {
          await refreshProfile()
        } else {
          const { data } = await authApi.session()
          applyAuth(data)
        }
      } catch {
        clearStoredAuth()
        setUser(null)
      } finally {
        setIsBootstrapping(false)
      }
    }

    void bootstrap()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isBootstrapping,
        login,
        logout,
        applyAuth,
        refreshProfile,
        setCurrentUser: setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
