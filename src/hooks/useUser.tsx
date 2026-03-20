'use client'

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'

interface User {
  _id: string
  username: string
  role: 'admin' | 'user'
  balance: number
  realName?: string
  phone?: string
  email?: string
  isActive: boolean
}

interface UseUserReturn {
  user: User | null
  isLoggedIn: boolean
  loading: boolean
  setUser: (user: User | null) => void
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

const UserContext = createContext<UseUserReturn | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/users', {
        method: 'GET',
        credentials: 'include',
      })

      const data = await res.json()
      
      if (data.success && data.user) {
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    setLoading(true)
    await fetchUser()
  }, [fetchUser])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth', {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch {
      // ignore
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const value: UseUserReturn = {
    user,
    isLoggedIn: !!user,
    loading,
    setUser,
    refreshUser,
    logout,
  }

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser(): UseUserReturn {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
