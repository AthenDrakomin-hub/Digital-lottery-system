'use client'

import { useEffect, useState } from 'react'

interface DashboardStats {
  totalUsers: number
  activeUsers: number
  todayTransactions: number
  todayAmount: number
  pendingLotteries: number
  totalBalance: number
}

interface RecentUser {
  _id: string
  username: string
  realName: string
  balance: number
  createdAt: string
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    todayTransactions: 0,
    todayAmount: 0,
    pendingLotteries: 0,
    totalBalance: 0,
  })
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/admin/dashboard', {
          credentials: 'include',
        })
        const data = await res.json()
        if (data.success) {
          setStats(data.stats)
          setRecentUsers(data.recentUsers || [])
        }
      } catch {
        console.error('Failed to fetch dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  const statCards = [
    { label: '總用戶數', value: stats.totalUsers, icon: '👥', color: 'bg-blue-600' },
    { label: '活躍用戶', value: stats.activeUsers, icon: '✅', color: 'bg-green-600' },
    { label: '今日交易', value: stats.todayTransactions, icon: '📊', color: 'bg-purple-600' },
    { label: '今日金額', value: `¥${stats.todayAmount.toLocaleString()}`, icon: '💰', color: 'bg-yellow-600' },
    { label: '待開獎期', value: stats.pendingLotteries, icon: '🎰', color: 'bg-orange-600' },
    { label: '平台總額', value: `¥${stats.totalBalance.toLocaleString()}`, icon: '🏦', color: 'bg-red-600' },
  ]

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((card, i) => (
          <div key={i} className="bg-gray-800 rounded-xl p-4">
            <div className={`${card.color} w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-3`}>
              {card.icon}
            </div>
            <p className="text-gray-400 text-sm">{card.label}</p>
            <p className="text-white text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-white text-lg font-medium mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a href="/admin/users/create" className="bg-green-600 hover:bg-green-700 text-white rounded-lg p-4 text-center transition-colors">
            <div className="text-2xl mb-2">👤</div>
            <div>創建用戶</div>
          </a>
          <a href="/admin/lottery" className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg p-4 text-center transition-colors">
            <div className="text-2xl mb-2">🎰</div>
            <div>開獎管理</div>
          </a>
          <a href="/admin/records" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-4 text-center transition-colors">
            <div className="text-2xl mb-2">📋</div>
            <div>交易記錄</div>
          </a>
          <a href="/admin/config" className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg p-4 text-center transition-colors">
            <div className="text-2xl mb-2">⚙️</div>
            <div>系統配置</div>
          </a>
        </div>
      </div>

      {/* Recent Users */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-lg font-medium">最近註冊用戶</h2>
          <a href="/admin/users" className="text-green-500 hover:text-green-400 text-sm">查看全部 →</a>
        </div>
        {recentUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="pb-3">用戶名</th>
                  <th className="pb-3">姓名</th>
                  <th className="pb-3">餘額</th>
                  <th className="pb-3">註冊時間</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => (
                  <tr key={user._id} className="text-gray-300 border-b border-gray-700/50">
                    <td className="py-3">{user.username}</td>
                    <td className="py-3">{user.realName || '-'}</td>
                    <td className="py-3">¥{user.balance.toLocaleString()}</td>
                    <td className="py-3">{new Date(user.createdAt).toLocaleDateString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">暫無用戶數據</p>
        )}
      </div>
    </div>
  )
}
