'use client'

import { useEffect, useState } from 'react'

interface SystemConfig {
  energyTypes: string[]
  provinces: string[]
  betAmounts: number[]
  odds: {
    energyType: number
    province: number
    amount: number
  }
}

export default function ConfigPage() {
  const [config, setConfig] = useState<SystemConfig>({
    energyTypes: [],
    provinces: [],
    betAmounts: [],
    odds: { energyType: 1.8, province: 2.5, amount: 3.0 },
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // New item inputs
  const [newEnergyType, setNewEnergyType] = useState('')
  const [newProvince, setNewProvince] = useState('')
  const [newBetAmount, setNewBetAmount] = useState('')

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.config) {
        setConfig({
          energyTypes: data.config.energyTypes || [],
          provinces: data.config.provinces || [],
          betAmounts: data.config.betAmounts || [],
          odds: data.config.odds || { energyType: 1.8, province: 2.5, amount: 3.0 },
        })
      }
    } catch {
      console.error('Failed to fetch config')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include',
      })

      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '配置保存成功' })
      } else {
        setMessage({ type: 'error', text: data.error || '保存失敗' })
      }
    } catch {
      setMessage({ type: 'error', text: '網絡錯誤' })
    } finally {
      setSaving(false)
    }
  }

  const addEnergyType = () => {
    if (newEnergyType && !config.energyTypes.includes(newEnergyType)) {
      setConfig({ ...config, energyTypes: [...config.energyTypes, newEnergyType] })
      setNewEnergyType('')
    }
  }

  const removeEnergyType = (type: string) => {
    setConfig({ ...config, energyTypes: config.energyTypes.filter(t => t !== type) })
  }

  const addProvince = () => {
    if (newProvince && !config.provinces.includes(newProvince)) {
      setConfig({ ...config, provinces: [...config.provinces, newProvince] })
      setNewProvince('')
    }
  }

  const removeProvince = (province: string) => {
    setConfig({ ...config, provinces: config.provinces.filter(p => p !== province) })
  }

  const addBetAmount = () => {
    const amount = Number(newBetAmount)
    if (amount > 0 && !config.betAmounts.includes(amount)) {
      setConfig({ ...config, betAmounts: [...config.betAmounts, amount].sort((a, b) => a - b) })
      setNewBetAmount('')
    }
  }

  const removeBetAmount = (amount: number) => {
    setConfig({ ...config, betAmounts: config.betAmounts.filter(a => a !== amount) })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">系統配置</h1>

      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900/50 border border-green-500 text-green-300' 
            : 'bg-red-900/50 border border-red-500 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Energy Types */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">能源類型</h2>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {config.energyTypes.map((type) => (
              <span
                key={type}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg flex items-center gap-2"
              >
                {type}
                <button
                  onClick={() => removeEnergyType(type)}
                  className="text-gray-400 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newEnergyType}
              onChange={(e) => setNewEnergyType(e.target.value)}
              placeholder="新增能源類型"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
              onKeyDown={(e) => e.key === 'Enter' && addEnergyType()}
            />
            <button
              onClick={addEnergyType}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              添加
            </button>
          </div>
        </div>

        {/* Provinces */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">省份列表</h2>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {config.provinces.map((province) => (
              <span
                key={province}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg flex items-center gap-2"
              >
                {province}
                <button
                  onClick={() => removeProvince(province)}
                  className="text-gray-400 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newProvince}
              onChange={(e) => setNewProvince(e.target.value)}
              placeholder="新增省份"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
              onKeyDown={(e) => e.key === 'Enter' && addProvince()}
            />
            <button
              onClick={addProvince}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              添加
            </button>
          </div>
        </div>

        {/* Bet Amounts */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">投注金額檔位</h2>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {config.betAmounts.map((amount) => (
              <span
                key={amount}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg flex items-center gap-2"
              >
                ¥{amount}
                <button
                  onClick={() => removeBetAmount(amount)}
                  className="text-gray-400 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={newBetAmount}
              onChange={(e) => setNewBetAmount(e.target.value)}
              placeholder="新增投注金額"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
              onKeyDown={(e) => e.key === 'Enter' && addBetAmount()}
              min="0"
            />
            <button
              onClick={addBetAmount}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              添加
            </button>
          </div>
        </div>

        {/* Odds */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">賠率設置</h2>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-300 mb-2">能源類型賠率</label>
              <input
                type="number"
                value={config.odds.energyType}
                onChange={(e) => setConfig({
                  ...config,
                  odds: { ...config.odds, energyType: Number(e.target.value) }
                })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                step="0.1"
                min="1"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">省份賠率</label>
              <input
                type="number"
                value={config.odds.province}
                onChange={(e) => setConfig({
                  ...config,
                  odds: { ...config.odds, province: Number(e.target.value) }
                })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                step="0.1"
                min="1"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">金額賠率</label>
              <input
                type="number"
                value={config.odds.amount}
                onChange={(e) => setConfig({
                  ...config,
                  odds: { ...config.odds, amount: Number(e.target.value) }
                })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                step="0.1"
                min="1"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  )
}
