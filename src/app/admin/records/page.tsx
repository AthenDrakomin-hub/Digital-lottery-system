'use client'

import { useEffect, useState } from 'react'

interface Transaction {
  _id: string
  userId: {
    _id: string
    username: string
    realName: string
  }
  type: 'deposit' | 'withdraw' | 'bet' | 'win' | 'refund'
  amount: number
  balance: number
  remark: string
  createdAt: string
}

export default function RecordsPage() {
  const [records, setRecords] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    fetchRecords()
  }, [filter, dateRange])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        ...(filter !== 'all' && { type: filter }),
      })

      const res = await fetch(`/api/transactions?${params}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setRecords(data.records)
      }
    } catch {
      console.error('Failed to fetch records')
    } finally {
      setLoading(false)
    }
  }

  const getTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      deposit: '充值',
      withdraw: '扣款',
      bet: '投注',
      win: '中奖',
      refund: '退还',
    }
    return types[type] || type
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      deposit: 'bg-green-900/50 text-green-400',
      withdraw: 'bg-red-900/50 text-red-400',
      bet: 'bg-blue-900/50 text-blue-400',
      win: 'bg-yellow-900/50 text-yellow-400',
      refund: 'bg-purple-900/50 text-purple-400',
    }
    return colors[type] || 'bg-gray-900/50 text-gray-400'
  }

  const getAmountColor = (type: string) => {
    return ['deposit', 'win', 'refund'].includes(type) ? 'text-green-400' : 'text-red-400'
  }

  // Statistics
  const stats = records.reduce((acc, record) => {
    if (['deposit', 'win', 'refund'].includes(record.type)) {
      acc.income += record.amount
    } else {
      acc.expense += record.amount
    }
    return acc
  }, { income: 0, expense: 0 })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          />
          <span className="text-gray-400">至</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          />
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
        >
          <option value="all">全部类型</option>
          <option value="deposit">充值</option>
          <option value="withdraw">扣款</option>
          <option value="bet">投注</option>
          <option value="win">中奖</option>
          <option value="refund">退还</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">收入总计</p>
          <p className="text-green-400 text-2xl font-bold">¥{stats.income.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">支出总计</p>
          <p className="text-red-400 text-2xl font-bold">¥{stats.expense.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">交易笔数</p>
          <p className="text-white text-2xl font-bold">{records.length}</p>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700 text-gray-300 text-left">
                <th className="px-6 py-4">时间</th>
                <th className="px-6 py-4">用户</th>
                <th className="px-6 py-4">类型</th>
                <th className="px-6 py-4">金额</th>
                <th className="px-6 py-4">余额</th>
                <th className="px-6 py-4">备注</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((record) => (
                  <tr key={record._id} className="text-gray-300 border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-6 py-4 text-sm">
                      {new Date(record.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium">{record.userId?.username || '-'}</p>
                        <p className="text-gray-400 text-sm">{record.userId?.realName || ''}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${getTypeColor(record.type)}`}>
                        {getTypeLabel(record.type)}
                      </span>
                    </td>
                    <td className={`px-6 py-4 font-medium ${getAmountColor(record.type)}`}>
                      {['deposit', 'win', 'refund'].includes(record.type) ? '+' : '-'}¥{record.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      ¥{record.balance.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {record.remark || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    暂无交易记录
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
