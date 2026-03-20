'use client'

import { useEffect, useState } from 'react'

interface LotteryResult {
  _id: string
  period: string
  cycle: number
  date: string
  results: {
    energyType: string
    province: string
    amount: number
  }[]
  status: 'pending' | 'completed'
  createdAt: string
}

interface Config {
  energyTypes: string[]
  provinces: string[]
}

export default function LotteryPage() {
  const [results, setResults] = useState<LotteryResult[]>([])
  const [config, setConfig] = useState<Config>({ energyTypes: [], provinces: [] })
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingResult, setEditingResult] = useState<LotteryResult | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    cycle: 5,
    energyType: '',
    province: '',
    amount: 0,
  })

  useEffect(() => {
    fetchConfig()
    fetchResults()
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
        if (data.config.energyTypes?.length > 0) {
          setFormData(prev => ({ ...prev, energyType: data.config.energyTypes[0] }))
        }
        if (data.config.provinces?.length > 0) {
          setFormData(prev => ({ ...prev, province: data.config.provinces[0] }))
        }
      }
    } catch {
      console.error('Failed to fetch config')
    }
  }

  const fetchResults = async () => {
    try {
      const res = await fetch(`/api/admin/lottery?date=${selectedDate}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.results)
      }
    } catch {
      console.error('Failed to fetch lottery results')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/admin/lottery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          cycle: formData.cycle,
          result: {
            energyType: formData.energyType,
            province: formData.province,
            amount: formData.amount,
          },
        }),
        credentials: 'include',
      })

      const data = await res.json()
      if (data.success) {
        fetchResults()
        setShowCreateModal(false)
        setFormData(prev => ({ ...prev, amount: 0 }))
      }
    } catch {
      console.error('Failed to create lottery result')
    }
  }

  const handleUpdate = async () => {
    if (!editingResult) return
    
    try {
      const res = await fetch(`/api/admin/lottery/${editingResult._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: {
            energyType: formData.energyType,
            province: formData.province,
            amount: formData.amount,
          },
        }),
        credentials: 'include',
      })

      const data = await res.json()
      if (data.success) {
        fetchResults()
        setEditingResult(null)
      }
    } catch {
      console.error('Failed to update lottery result')
    }
  }

  const handleComplete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/lottery/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
        credentials: 'include',
      })

      const data = await res.json()
      if (data.success) {
        fetchResults()
      }
    } catch {
      console.error('Failed to complete lottery')
    }
  }

  const openEditModal = (result: LotteryResult) => {
    setEditingResult(result)
    if (result.results[0]) {
      setFormData({
        cycle: result.cycle,
        energyType: result.results[0].energyType,
        province: result.results[0].province,
        amount: result.results[0].amount,
      })
    }
  }

  // Group by cycle
  const groupedResults = results.reduce((acc, result) => {
    const key = `${result.cycle}min`
    if (!acc[key]) acc[key] = []
    acc[key].push(result)
    return acc
  }, {} as Record<string, LotteryResult[]>)

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
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
          />
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          + 新增開獎結果
        </button>
      </div>

      {/* Results by Cycle */}
      {Object.keys(groupedResults).length > 0 ? (
        <div className="space-y-6">
          {['5min', '10min', '15min'].map((cycleKey) => {
            const cycleResults = groupedResults[cycleKey]
            if (!cycleResults) return null
            
            return (
              <div key={cycleKey} className="bg-gray-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 bg-gray-700 flex items-center justify-between">
                  <h3 className="text-white font-medium">{cycleKey} 週期</h3>
                  <span className="text-gray-400 text-sm">{cycleResults.length} 期</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-gray-400 text-left border-b border-gray-700">
                        <th className="px-6 py-3">期號</th>
                        <th className="px-6 py-3">能源類型</th>
                        <th className="px-6 py-3">省份</th>
                        <th className="px-6 py-3">金額</th>
                        <th className="px-6 py-3">狀態</th>
                        <th className="px-6 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleResults.map((result) => (
                        <tr key={result._id} className="text-gray-300 border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="px-6 py-4 font-medium">{result.period}</td>
                          <td className="px-6 py-4">{result.results[0]?.energyType || '-'}</td>
                          <td className="px-6 py-4">{result.results[0]?.province || '-'}</td>
                          <td className="px-6 py-4 text-green-400">¥{result.results[0]?.amount?.toLocaleString() || 0}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              result.status === 'completed' 
                                ? 'bg-green-900/50 text-green-400' 
                                : 'bg-yellow-900/50 text-yellow-400'
                            }`}>
                              {result.status === 'completed' ? '已開獎' : '待開獎'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {result.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => openEditModal(result)}
                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                  >
                                    編輯
                                  </button>
                                  <button
                                    onClick={() => handleComplete(result._id)}
                                    className="text-green-400 hover:text-green-300 text-sm"
                                  >
                                    開獎
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-12 text-center text-gray-400">
          該日期暫無開獎結果，點擊右上角新增
        </div>
      )}

      {/* Create Modal */}
      {(showCreateModal || editingResult) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold text-white mb-6">
              {editingResult ? '編輯開獎結果' : '新增開獎結果'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">週期</label>
                <select
                  value={formData.cycle}
                  onChange={(e) => setFormData({ ...formData, cycle: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                  disabled={!!editingResult}
                >
                  <option value={5}>5分鐘</option>
                  <option value={10}>10分鐘</option>
                  <option value={15}>15分鐘</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">能源類型</label>
                <select
                  value={formData.energyType}
                  onChange={(e) => setFormData({ ...formData, energyType: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                >
                  {config.energyTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">省份</label>
                <select
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                >
                  {config.provinces.map((province) => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">金額</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                  min="0"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={editingResult ? handleUpdate : handleCreate}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                {editingResult ? '保存' : '創建'}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingResult(null)
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
