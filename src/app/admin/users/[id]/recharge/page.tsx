'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface User {
  _id: string
  username: string
  realName: string
  balance: number
}

export default function RechargePage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  
  const [user, setUser] = useState<User | null>(null)
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'deposit' | 'withdraw'>('deposit')
  const [remark, setRemark] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [userId])

  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setUser(data.user)
      } else {
        setError('用戶不存在')
      }
    } catch {
      setError('獲取用戶信息失敗')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('請輸入有效金額')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/recharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: type === 'withdraw' ? -amountNum : amountNum, 
          type,
          remark 
        }),
        credentials: 'include',
      })

      const data = await res.json()

      if (data.success) {
        router.push('/admin/users')
      } else {
        setError(data.error || '操作失敗')
      }
    } catch {
      setError('網絡錯誤，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  if (!user && !error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/users" className="text-gray-400 hover:text-white mb-2 inline-block">
          ← 返回用戶列表
        </Link>
        <h1 className="text-2xl font-bold text-white">賬戶充值/扣款</h1>
      </div>

      {/* User Info */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-xl">
            👤
          </div>
          <div>
            <p className="text-white font-medium">{user?.username}</p>
            <p className="text-gray-400 text-sm">{user?.realName || '未設置姓名'}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-gray-400 text-sm">當前餘額</p>
            <p className="text-green-400 text-xl font-bold">¥{user?.balance.toLocaleString() || 0}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-gray-800 rounded-xl p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-300 mb-2">操作類型</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setType('deposit')}
                className={`py-3 rounded-lg font-medium transition-colors ${
                  type === 'deposit' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                充值
              </button>
              <button
                type="button"
                onClick={() => setType('withdraw')}
                className={`py-3 rounded-lg font-medium transition-colors ${
                  type === 'withdraw' 
                    ? 'bg-red-600 text-white' 
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                扣款
              </button>
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-2">金額</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                placeholder="請輸入金額"
                required
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-2">備註</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
              placeholder="選填，可記錄操作原因"
              rows={3}
            />
          </div>

          {/* Quick amounts */}
          <div>
            <label className="block text-gray-300 mb-2">快捷金額</label>
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val.toString())}
                  className="py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  ¥{val}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading || !amount}
              className={`flex-1 py-3 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${
                type === 'deposit' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? '處理中...' : (type === 'deposit' ? '確認充值' : '確認扣款')}
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
