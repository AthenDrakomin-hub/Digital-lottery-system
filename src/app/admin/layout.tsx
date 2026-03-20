'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useState } from 'react'

interface AdminUser {
  id: string
  username: string
  role: string
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // 检查管理员登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth?type=admin', {
          credentials: 'include',
        })
        const data = await res.json()
        if (data.success && data.admin) {
          setAdmin(data.admin)
        } else if (pathname !== '/admin/login') {
          router.push('/admin/login')
        }
      } catch {
        if (pathname !== '/admin/login') {
          router.push('/admin/login')
        }
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth?type=admin', { method: 'DELETE' })
    } catch {
      // ignore
    }
    setAdmin(null)
    router.push('/admin/login')
  }

  // 登录页面不显示布局
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-400">載入中...</p>
        </div>
      </div>
    )
  }

  if (!admin) {
    return null
  }

  const menuItems = [
    { href: '/admin', label: '儀表盤', icon: '📊' },
    { href: '/admin/users', label: '用戶管理', icon: '👥' },
    { href: '/admin/draws', label: '開獎記錄', icon: '🎰' },
    { href: '/admin/lottery', label: '開獎設置', icon: '🎯' },
    { href: '/admin/records', label: '交易記錄', icon: '📋' },
    { href: '/admin/config', label: '系統配置', icon: '⚙️' },
  ]

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-gray-800 transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-2xl">🏢</span>
            {sidebarOpen && (
              <span className="text-white font-bold">港華後台</span>
            )}
          </Link>
        </div>

        {/* Menu */}
        <nav className="flex-1 py-4">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 mx-2 rounded-lg mb-1 transition-colors ${
                isActive(item.href)
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-4 text-gray-400 hover:text-white border-t border-gray-700"
        >
          {sidebarOpen ? '◀ 收起' : '▶'}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <h1 className="text-white text-lg font-medium">
            {menuItems.find((item) => isActive(item.href))?.label || '後台管理'}
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">管理員: {admin.username}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              登出
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
