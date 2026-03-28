'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function CreateUserPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    realName: '',
    phone: '',
    email: '',
    balance: 0,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include',
      })

      const data = await res.json()

      if (data.success) {
        router.push('/admin/users')
      } else {
        setError(data.error || '创建失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/users" className="text-gray-400 hover:text-white mb-2 inline-block">
          ← 返回用户列表
        </Link>
        <h1 className="text-2xl font-bold text-white">创建新用户</h1>
      </div>

      {/* Form */}
      <div className="bg-gray-800 rounded-xl p-6">
        <form 
          onSubmit={handleSubmit} 
          className="space-y-6"
          action="/api/users"
          method="post"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label htmlFor="username" className="block text-gray-300 mb-2">用户名 *</label>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-gray-300 mb-2">初始密码 *</label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label htmlFor="realName" className="block text-gray-300 mb-2">真实姓名</label>
              <input
                id="realName"
                name="realName"
                type="text"
                value={formData.realName}
                onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="balance" className="block text-gray-300 mb-2">初始余额</label>
              <input
                id="balance"
                name="balance"
                type="number"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                autoComplete="off"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label htmlFor="phone" className="block text-gray-300 mb-2">手机号码</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                autoComplete="tel"
                placeholder="请输入手机号码"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-gray-300 mb-2">邮箱地址</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                autoComplete="email"
                placeholder="请输入邮箱地址"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建用户'}
            </button>
            <Link
              href="/admin/users"
              className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium text-center hover:bg-gray-600 transition-colors"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
