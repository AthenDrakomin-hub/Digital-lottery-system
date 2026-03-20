'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })

      const data = await res.json()

      if (data.success) {
        router.push('/admin')
      } else {
        setError(data.error || '登錄失敗')
      }
    } catch {
      setError('網絡錯誤，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏢</div>
          <h1 className="text-3xl font-bold text-white">港華智慧能源</h1>
          <p className="text-gray-400 mt-2">後台管理系統</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-800 rounded-xl p-8 shadow-xl">
          <form 
            onSubmit={handleSubmit} 
            action="/api/admin/auth" 
            method="post"
          >
            <div className="mb-6">
              <label htmlFor="admin-username" className="block text-gray-300 mb-2">管理員賬號</label>
              <input
                id="admin-username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                placeholder="請輸入管理員賬號"
                autoComplete="username"
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="admin-password" className="block text-gray-300 mb-2">密碼</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                placeholder="請輸入密碼"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? '登錄中...' : '登錄'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/client/home" className="text-gray-400 hover:text-green-500 text-sm">
              返回前台首頁
            </Link>
          </div>
        </div>

        <p className="text-center text-gray-500 mt-6 text-sm">
          港華智慧能源投資平台 © 2024
        </p>
      </div>
    </div>
  )
}
