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

interface Draw {
  _id: string
  interval: 5 | 10 | 15
  date: string
  period: number
  result: string
  status: 'pending' | 'settled' | 'cancelled'
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function LotteryPage() {
  const [draws, setDraws] = useState<Draw[]>([])
  const [config, setConfig] = useState<Config>({ energyTypes: [], provinces: [] })
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingDraw, setEditingDraw] = useState<Draw | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    interval: 5 as 5 | 10 | 15,
    period: 0,
    result: '',
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  useEffect(() => {
    fetchDraws(1)
  }, [selectedDate])

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
      const res = await fetch(`/api/draws?admin=true&date=${selectedDate}&page=${page}&limit=${pagination.limit}`, {
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

  // 根据期号计算开奖时间
  const getDrawTime = (date: string, interval: number, period: number): string => {
    const totalMinutes = period * interval
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  // 根据选择的能源类型和省份生成数字
  const generateResultFromSelection = (energyIndex: number, provinceIndex: number) => {
    // 后8位随机生成
    const randomDigits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')
    const result = `${energyIndex}${provinceIndex}${randomDigits}`
    setFormData({ ...formData, result })
  }

  const generateRandomResult = () => {
    const result = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('')
    setFormData({ ...formData, result })
  }

  const handleCreate = async () => {
    if (!/^\d{10}$/.test(formData.result)) {
      alert('开奖结果必须是10位数字')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          interval: formData.interval,
          period: formData.period,
          result: formData.result,
        }),
        credentials: 'include',
      })

      const data = await res.json()
      if (data.success) {
        fetchDraws(pagination.page)
        setShowCreateModal(false)
        setFormData({ interval: 5, period: 0, result: '' })
      } else {
        alert(data.error || '创建失败')
      }
    } catch {
      console.error('Failed to create draw')
      alert('创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openEditModal = (draw: Draw) => {
    setEditingDraw(draw)
    setFormData({
      interval: draw.interval,
      period: draw.period,
      result: draw.result || '',
    })
  }

  const handleUpdate = async () => {
    if (!editingDraw) return
    if (!/^\d{10}$/.test(formData.result)) {
      alert('开奖结果必须是10位数字')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editingDraw.date,
          interval: editingDraw.interval,
          period: editingDraw.period,
          result: formData.result,
        }),
        credentials: 'include',
      })

      const data = await res.json()
      if (data.success) {
        fetchDraws(pagination.page)
        setEditingDraw(null)
        setFormData({ interval: 5, period: 0, result: '' })
      } else {
        alert(data.error || '更新失败')
      }
    } catch {
      console.error('Failed to update draw')
      alert('更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 获取下一个可用期号
  const getNextPeriod = (interval: number) => {
    const existingPeriods = draws
      .filter(d => d.interval === interval)
      .map(d => d.period)
    return existingPeriods.length > 0 ? Math.max(...existingPeriods) + 1 : 0
  }

  // 渲染开奖结果 - 使用字段映射
  const renderResult = (result: string) => {
    if (!result || result.length < 2) return <span className="text-gray-500">未设置</span>

    const digits = result.split('').map(Number)
    const energy = config.energyTypes[digits[0]]
    const province = config.provinces[digits[1]]

    return (
      <div className="flex flex-wrap items-center gap-2">
        {energy && (
          <span 
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: energy.color + '30', color: energy.color }}
          >
            {energy.name}
          </span>
        )}
        {province && (
          <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs font-medium">
            {province.name}
          </span>
        )}
        <div className="flex gap-0.5">
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

  // 分页
  const handlePageChange = (newPage: number) => {
    fetchDraws(newPage)
  }

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null

    const pages: (number | string)[] = []
    const current = pagination.page
    const total = pagination.totalPages

    pages.push(1)
    let start = Math.max(2, current - 2)
    let end = Math.min(total - 1, current + 2)

    if (start > 2) pages.push('...')
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < total - 1) pages.push('...')
    if (total > 1) pages.push(total)

    return (
      <div className="flex items-center justify-center gap-2 mt-6 pb-4">
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          />
        </div>
        <button
          onClick={() => {
            setFormData({ interval: 5, period: getNextPeriod(5), result: '' })
            setShowCreateModal(true)
          }}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          + 设置开奖结果
        </button>
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
                  <th className="px-6 py-3">状态</th>
                  <th className="px-6 py-3">操作</th>
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
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        draw.status === 'settled' 
                          ? 'bg-green-900/50 text-green-400' 
                          : 'bg-yellow-900/50 text-yellow-400'
                      }`}>
                        {draw.status === 'settled' ? '已开奖' : '待开奖'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => openEditModal(draw)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        编辑
                      </button>
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
          该日期暂无开奖记录，点击右上角新增
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingDraw) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-xl font-bold text-white mb-6">
              {editingDraw ? '编辑开奖结果' : '设置开奖结果'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 mb-2">周期</label>
                  <select
                    value={formData.interval}
                    onChange={(e) => setFormData({ ...formData, interval: Number(e.target.value) as 5 | 10 | 15, period: getNextPeriod(Number(e.target.value)) })}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                    disabled={!!editingDraw}
                  >
                    <option value={5}>5分钟</option>
                    <option value={10}>10分钟</option>
                    <option value={15}>15分钟</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">期号</label>
                  <input
                    type="number"
                    value={formData.period}
                    onChange={(e) => setFormData({ ...formData, period: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                    min="0"
                    disabled={!!editingDraw}
                  />
                </div>
              </div>

              {/* 快捷选择：能源类型 + 省份 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 mb-2">能源类型 (第1位)</label>
                  <select
                    id="energy-select"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                    onChange={(e) => {
                      const provinceSelect = document.getElementById('province-select') as HTMLSelectElement
                      generateResultFromSelection(Number(e.target.value), Number(provinceSelect?.value || 0))
                    }}
                  >
                    {config.energyTypes.map((type, index) => (
                      <option key={type.id} value={index}>
                        {index} - {type.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">省份 (第2位)</label>
                  <select
                    id="province-select"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                    onChange={(e) => {
                      const energySelect = document.getElementById('energy-select') as HTMLSelectElement
                      generateResultFromSelection(Number(energySelect?.value || 0), Number(e.target.value))
                    }}
                  >
                    {config.provinces.map((province, index) => (
                      <option key={province.id} value={index}>
                        {index} - {province.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">
                  开奖结果 (10位数字)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.result}
                    onChange={(e) => setFormData({ ...formData, result: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-xl tracking-widest focus:outline-none focus:border-green-500"
                    placeholder="请输入10位数字"
                    maxLength={10}
                  />
                  <button
                    onClick={generateRandomResult}
                    className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    title="随机生成"
                  >
                    🎲
                  </button>
                </div>
                {formData.result && formData.result.length === 10 && (
                  <div className="mt-3 flex justify-center">
                    {renderResult(formData.result)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={editingDraw ? handleUpdate : handleCreate}
                disabled={submitting || formData.result.length !== 10}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '处理中...' : (editingDraw ? '保存' : '创建')}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingDraw(null)
                  setFormData({ interval: 5, period: 0, result: '' })
                }}
                className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
