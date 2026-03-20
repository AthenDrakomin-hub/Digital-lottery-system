'use client'

import { createContext, useContext, ReactNode, useState, useEffect } from 'react'

// 用户上下文
interface User {
  id: string
  username: string
  role: string
  balance: number
  realName?: string
  phone?: string
  email?: string
}

interface UserContextType {
  user: User | null
  setUser: (user: User | null) => void
  isLoggedIn: boolean
  loading: boolean
  logout: () => void
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  loading: true,
  logout: () => {},
})

export const useUser = () => useContext(UserContext)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth', {
          method: 'GET',
          credentials: 'include',
        })
        const data = await res.json()
        if (data.success && data.user) {
          setUser(data.user)
        }
      } catch {
        console.error('Auth check failed')
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  const logout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
    } catch {
      console.error('Logout failed')
    }
    setUser(null)
  }

  return (
    <UserContext.Provider value={{ user, setUser, isLoggedIn: !!user, loading, logout }}>
      {children}
    </UserContext.Provider>
  )
}
