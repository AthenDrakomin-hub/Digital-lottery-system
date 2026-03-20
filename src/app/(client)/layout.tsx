'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, createContext, useContext, ReactNode } from 'react'

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

export default function ClientLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
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
      } catch (error) {
        console.error('Auth check failed:', error)
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  const logout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
    } catch (error) {
      console.error('Logout failed:', error)
    }
    setUser(null)
  }

  const navItems = [
    { href: '/home', label: '主頁' },
    { href: '/about', label: '關於我們' },
    { href: '/invest', label: '投資中心' },
    { href: '/dashboard', label: '賬務管理' },
    { href: '/contact', label: '聯繫我們' },
  ]

  const isActive = (href: string) => pathname === href

  // 登录页面不显示Header和Footer
  const isLoginPage = pathname === '/login'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-500">加載中...</p>
        </div>
      </div>
    )
  }

  return (
    <UserContext.Provider value={{ user, setUser, isLoggedIn: !!user, loading, logout }}>
      <div className="min-h-screen flex flex-col bg-gray-100">
        {/* Header */}
        {!isLoginPage && (
          <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
            <div className="max-w-[1440px] mx-auto px-10 h-20 flex items-center justify-between">
              <Link href="/home" className="flex items-center space-x-2">
                <img 
                  src="https://www.towngassmartenergy.com/images/common/logo.png" 
                  className="h-10" 
                  alt="Logo" 
                />
                <div className="flex flex-col text-[#00529b] font-bold leading-tight">
                  <span className="text-lg">港華智慧能源</span>
                  <span className="text-[10px]">Towngas Smart Energy</span>
                </div>
              </Link>
              
              <nav className="flex items-center space-x-10 text-sm font-medium">
                {navItems.map((item) => (
                  <Link 
                    key={item.href}
                    href={item.href}
                    className={`${isActive(item.href) ? 'text-[#00529b] border-b-2 border-[#00529b]' : 'text-gray-500 hover:text-gray-700'} py-2 transition-colors`}
                  >
                    {item.label}
                  </Link>
                ))}
                
                {user ? (
                  <div className="flex items-center space-x-3 ml-4">
                    <span className="text-gray-400 text-sm">你好，{user.username}</span>
                    <button 
                      onClick={logout}
                      className="bg-orange-500 text-white px-4 py-1.5 rounded-full text-xs hover:bg-orange-600 transition-colors"
                    >
                      登出
                    </button>
                  </div>
                ) : (
                  <Link 
                    href="/login" 
                    className="bg-[#32b24a] text-white px-6 py-2 rounded-full text-sm hover:bg-green-600 transition-colors"
                  >
                    登錄系統
                  </Link>
                )}
              </nav>
            </div>
          </header>
        )}

        {/* Main Content */}
        <main className="flex-1">
          {children}
        </main>

        {/* Footer */}
        {!isLoginPage && pathname !== '/contact' && (
          <footer className="bg-white border-t border-gray-100 py-10">
            <div className="max-w-[1440px] mx-auto px-10 flex justify-between items-center text-gray-400 text-xs">
              <div className="flex items-center space-x-4">
                <img src="https://www.towngas.com/Common/images/logo.png" className="h-8" alt="Parent Logo" />
                <span>的附屬公司</span>
              </div>
              <span>© 2025 港華智慧能源有限公司版權所有。</span>
              <div className="flex space-x-6">
                <Link href="#" className="hover:text-gray-600">免責聲明及使用條款</Link>
              </div>
            </div>
          </footer>
        )}
      </div>
    </UserContext.Provider>
  )
}
