'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface User {
  _id: string
  username: string
  realName: string
  phone: string
  email: string
  balance: number
  status: string
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
      }
    } catch {
      console.error('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active'
    try {
      const res = await fetch(`/api/users?id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setUsers(users.map(u => u._id === userId ? { ...u, status: newStatus } : u))
      }
    } catch {
      console.error('Failed to update user status')
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.includes(search) || 
                          user.realName?.includes(search) ||
                          user.phone?.includes(search)
    const matchesFilter = filter === 'all' || user.status === filter
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="搜索用户名/姓名/手机..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500 w-64"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">禁用</option>
          </select>
        </div>
        <Link
          href="/admin/users/create"
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          + 创建用户
        </Link>
      </div>

      {/* Users Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700 text-gray-300 text-left">
                <th className="px-6 py-4">用户名</th>
                <th className="px-6 py-4">姓名</th>
                <th className="px-6 py-4">手机</th>
                <th className="px-6 py-4">邮箱</th>
                <th className="px-6 py-4">余额</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4">注册时间</th>
                <th className="px-6 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr key={user._id} className="text-gray-300 border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-6 py-4 font-medium">{user.username}</td>
                    <td className="px-6 py-4">{user.realName || '-'}</td>
                    <td className="px-6 py-4">{user.phone || '-'}</td>
                    <td className="px-6 py-4">{user.email || '-'}</td>
                    <td className="px-6 py-4 text-green-400 font-medium">¥{user.balance.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        user.status === 'active' 
                          ? 'bg-green-900/50 text-green-400' 
                          : 'bg-red-900/50 text-red-400'
                      }`}>
                        {user.status === 'active' ? '正常' : '禁用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/users/${user._id}/recharge`}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          充值
                        </Link>
                        <button
                          onClick={() => handleToggleStatus(user._id, user.status)}
                          className={`${user.status === 'active' ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'} text-sm`}
                        >
                          {user.status === 'active' ? '禁用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    暂无用户数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
