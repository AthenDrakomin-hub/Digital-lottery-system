'use client'

import { useEffect, useState } from 'react'

interface EnergyType {
  id: string
  name: string
  color: string
  enabled: boolean
  sortOrder: number
}

interface Province {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
}

interface Config {
  energyTypes: EnergyType[]
  provinces: Province[]
}

interface SettlementStats {
  totalBets: number
  wonBets: number
  lostBets: number
  totalWinAmount: number
}

interface Draw {
  _id: string
  interval: 5 | 10 | 15
  date: string
  period: number
  result: string
  status: 'pending' | 'settled' | 'cancelled'
  settlementStats?: SettlementStats
  updatedAt?: string
  settledAt?: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function DrawsPage() {
  const [draws, setDraws] = useState<Draw[]>([])
  const [config, setConfig] = useState<Config>({ energyTypes: [], provinces: [] })
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState({
    date: new Date().toISOString().split('T')[0],
    interval: 'all',
    status: 'all',
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  useEffect(() => {
    fetchDraws(1)
  }, [filter])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setConfig({
          energyTypes: data.config.energyTypes || [],
          provinces: data.config.provinces || [],
        })
      }
    } catch {
      console.error('Failed to fetch config')
    }
  }

  const fetchDraws = async (page: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('limit', pagination.limit.toString())
      if (filter.date) params.append('date', filter.date)
      if (filter.interval !== 'all') params.append('interval', filter.interval)
      if (filter.status !== 'all') params.append('status', filter.status)

      const res = await fetch(`/api/draws?admin=true&${params}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setDraws(data.draws)
        setPagination(data.pagination)
      }
    } catch {
      console.error('Failed to fetch draws')
    } finally {
      setLoading(false)
    }
  }

  // 根据数字索引获取能源类型
  const getEnergyType = (index: number): EnergyType | null => {
    if (index < 0 || index >= config.energyTypes.length) return null
    return config.energyTypes[index]
  }

  // 根据数字索引获取省份
  const getProvince = (index: number): Province | null => {
    if (index < 0 || index >= config.provinces.length) return null
    return config.provinces[index]
  }

  // 根据期号计算开奖时间
  const getDrawTime = (date: string, interval: number, period: number): string => {
    // period 是当天第几期，从0开始
    const totalMinutes = period * interval
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  // 渲染开奖结果 - 使用字段映射
  const renderResult = (result: string) => {
    if (!result || result.length < 2) {
      return <span className="text-gray-500">未设置</span>
    }

    const digits = result.split('').map(Number)
    
    // 前2位：能源类型和省份
    const energyIndex = digits[0]
    const provinceIndex = digits[1]
    
    const energy = getEnergyType(energyIndex)
    const province = getProvince(provinceIndex)

    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* 能源类型 */}
        {energy && (
          <span 
            className="px-2 py-1 rounded text-xs font-medium"
            style={{ backgroundColor: energy.color + '30', color: energy.color }}
          >
            {energy.name}
          </span>
        )}
        
        {/* 省份 */}
        {province && (
          <span className="px-2 py-1 bg-blue-900/50 text-blue-400 rounded text-xs font-medium">
            {province.name}
          </span>
        )}

        {/* 完整数字 */}
        <div className="flex gap-0.5 ml-2">
          {digits.map((digit, index) => (
            <span
              key={index}
              className="w-5 h-5 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
            >
              {digit}
            </span>
          ))}
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-900/50 text-yellow-400',
      settled: 'bg-green-900/50 text-green-400',
      cancelled: 'bg-red-900/50 text-red-400',
    }
    return colors[status] || 'bg-gray-900/50 text-gray-400'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '待开奖',
      settled: '已开奖',
      cancelled: '已取消',
    }
    return labels[status] || status
  }

  // 统计
  const stats = {
    total: pagination.total,
    pending: draws.filter(d => d.status === 'pending').length,
    settled: draws.filter(d => d.status === 'settled').length,
  }

  // 分页
  const handlePageChange = (newPage: number) => {
    fetchDraws(newPage)
  }

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null

    const pages: (number | string)[] = []
    const current = pagination.page
    const total = pagination.totalPages

    // 始终显示第一页
    pages.push(1)

    // 中间页码
    let start = Math.max(2, current - 2)
    let end = Math.min(total - 1, current + 2)

    if (start > 2) pages.push('...')
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < total - 1) pages.push('...')

    // 始终显示最后一页
    if (total > 1) pages.push(total)

    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <button
          onClick={() => handlePageChange(current - 1)}
          disabled={current === 1}
          className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
        >
          上一页
        </button>
        
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <button
              key={i}
              onClick={() => handlePageChange(p)}
              className={`px-3 py-1 rounded ${
                p === current 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              {p}
            </button>
          ) : (
            <span key={i} className="px-2 text-gray-400">{p}</span>
          )
        ))}

        <button
          onClick={() => handlePageChange(current + 1)}
          disabled={current === total}
          className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
        >
          下一页
        </button>

        <span className="text-gray-400 text-sm ml-4">
          共 {pagination.total} 条记录
        </span>
      </div>
    )
  }

  if (loading && draws.length === 0) {
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
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={filter.date}
            onChange={(e) => setFilter({ ...filter, date: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          />

          <select
            value={filter.interval}
            onChange={(e) => setFilter({ ...filter, interval: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          >
            <option value="all">全部周期</option>
            <option value="5">5分钟</option>
            <option value="10">10分钟</option>
            <option value="15">15分钟</option>
          </select>

          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          >
            <option value="all">全部状态</option>
            <option value="pending">待开奖</option>
            <option value="settled">已开奖</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">总期数</p>
          <p className="text-white text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">待开奖</p>
          <p className="text-yellow-400 text-2xl font-bold">{stats.pending}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">已开奖</p>
          <p className="text-green-400 text-2xl font-bold">{stats.settled}</p>
        </div>
      </div>

      {/* 图例说明 */}
      <div className="bg-gray-800 rounded-xl p-4 mb-6">
        <p className="text-gray-400 text-sm mb-2">开奖结果说明：</p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-300">
            第1位 = 能源类型（0-{config.energyTypes.length - 1}）
          </span>
          <span className="text-gray-300">
            第2位 = 省份（0-{config.provinces.length - 1}）
          </span>
          <span className="text-gray-300">
            后8位 = 其他数据
          </span>
        </div>
      </div>

      {/* Results Table */}
      {draws.length > 0 ? (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700 text-sm bg-gray-700">
                  <th className="px-6 py-3">期号</th>
                  <th className="px-6 py-3">开奖时间</th>
                  <th className="px-6 py-3">周期</th>
                  <th className="px-6 py-3">开奖结果</th>
                  <th className="px-6 py-3">投注/中奖</th>
                  <th className="px-6 py-3">派彩</th>
                  <th className="px-6 py-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((draw) => (
                  <tr key={draw._id} className="text-gray-300 border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-6 py-3 font-medium text-sm">
                      #{String(draw.date.replace(/-/g, '')).padStart(8, '0')}{String(draw.interval).padStart(2, '0')}{String(draw.period).padStart(3, '0')}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-400">
                      {getDrawTime(draw.date, draw.interval, draw.period)}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <span className="px-2 py-1 bg-gray-700 rounded text-gray-300">
                        {draw.interval}分钟
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {renderResult(draw.result)}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <span className="text-blue-400">{draw.settlementStats?.totalBets || 0}</span>
                      <span className="text-gray-500">/</span>
                      <span className="text-green-400">{draw.settlementStats?.wonBets || 0}</span>
                    </td>
                    <td className="px-6 py-3 text-sm text-yellow-400">
                      ¥{(draw.settlementStats?.totalWinAmount || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(draw.status)}`}>
                        {getStatusLabel(draw.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {renderPagination()}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-12 text-center text-gray-400">
          该日期暂无开奖记录
        </div>
      )}
    </div>
  )
}
