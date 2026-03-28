'use client'

import { useEffect, useState } from 'react'

// 类型定义
interface EnergyTypeConfig {
  id: string
  name: string
  color: string
  enabled: boolean
  sortOrder: number
}

interface ProvinceConfig {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
}

interface BetAmountConfig {
  amount: number
  enabled: boolean
  sortOrder: number
}

interface CycleConfig {
  minutes: number
  enabled: boolean
  sealSeconds: number
}

interface AnimationConfig {
  duration: number
  showParticles: boolean
  showCountdown: boolean
}

interface SystemConfig {
  energyTypes: EnergyTypeConfig[]
  provinces: ProvinceConfig[]
  betAmounts: BetAmountConfig[]
  odds: {
    energyType: number
    province: number
    amount: number
  }
  cycles: CycleConfig[]
  animation: AnimationConfig
  unitPrice: number
  minQuantity: number
  maxQuantity: number
}

type ConfigTab = 'energy' | 'province' | 'betAmount' | 'cycle' | 'odds' | 'animation' | 'basic'

export default function ConfigPage() {
  const [config, setConfig] = useState<SystemConfig>({
    energyTypes: [],
    provinces: [],
    betAmounts: [],
    odds: { energyType: 1.8, province: 2.5, amount: 3.0 },
    cycles: [],
    animation: { duration: 10, showParticles: true, showCountdown: true },
    unitPrice: 2,
    minQuantity: 1,
    maxQuantity: 1000,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [activeTab, setActiveTab] = useState<ConfigTab>('basic')

  // 新增项输入
  const [newEnergyType, setNewEnergyType] = useState({ name: '', color: '#32b24a' })
  const [newProvince, setNewProvince] = useState('')
  const [newBetAmount, setNewBetAmount] = useState('')

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config?admin=true', { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.config) {
        setConfig({
          energyTypes: data.config.energyTypes || [],
          provinces: data.config.provinces || [],
          betAmounts: data.config.betAmounts || [],
          odds: data.config.odds || { energyType: 1.8, province: 2.5, amount: 3.0 },
          cycles: data.config.cycles || [],
          animation: data.config.animation || { duration: 10, showParticles: true, showCountdown: true },
          unitPrice: data.config.unitPrice || 2,
          minQuantity: data.config.minQuantity || 1,
          maxQuantity: data.config.maxQuantity || 1000,
        })
      }
    } catch {
      console.error('Failed to fetch config')
    } finally {
      setLoading(false)
    }
  }

  // 通用 PATCH 请求
  const patchConfig = async (type: string, action: string, data?: unknown, id?: string) => {
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, action, data, id }),
        credentials: 'include',
      })

      const result = await res.json()
      if (result.success) {
        setConfig({
          energyTypes: result.config.energyTypes || [],
          provinces: result.config.provinces || [],
          betAmounts: result.config.betAmounts || [],
          odds: result.config.odds || { energyType: 1.8, province: 2.5, amount: 3.0 },
          cycles: result.config.cycles || [],
          animation: result.config.animation || { duration: 10, showParticles: true, showCountdown: true },
          unitPrice: result.config.unitPrice || 2,
          minQuantity: result.config.minQuantity || 1,
          maxQuantity: result.config.maxQuantity || 1000,
        })
        setMessage({ type: 'success', text: '操作成功' })
      } else {
        setMessage({ type: 'error', text: result.error || '操作失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  // 能源类型操作
  const addEnergyType = () => {
    if (newEnergyType.name.trim()) {
      patchConfig('energyType', 'add', { name: newEnergyType.name.trim(), color: newEnergyType.color })
      setNewEnergyType({ name: '', color: '#32b24a' })
    }
  }

  const updateEnergyType = (id: string, data: Partial<EnergyTypeConfig>) => {
    patchConfig('energyType', 'update', data, id)
  }

  const deleteEnergyType = (id: string) => {
    patchConfig('energyType', 'delete', null, id)
  }

  const toggleEnergyType = (id: string) => {
    patchConfig('energyType', 'toggle', null, id)
  }

  // 省份操作
  const addProvince = () => {
    if (newProvince.trim()) {
      patchConfig('province', 'add', { name: newProvince.trim() })
      setNewProvince('')
    }
  }

  const deleteProvince = (id: string) => {
    patchConfig('province', 'delete', null, id)
  }

  const toggleProvince = (id: string) => {
    patchConfig('province', 'toggle', null, id)
  }

  // 投注档位操作
  const addBetAmount = () => {
    const amount = Number(newBetAmount)
    if (amount > 0) {
      patchConfig('betAmount', 'add', { amount })
      setNewBetAmount('')
    }
  }

  const deleteBetAmount = (amount: number) => {
    patchConfig('betAmount', 'delete', null, String(amount))
  }

  const toggleBetAmount = (amount: number) => {
    patchConfig('betAmount', 'toggle', null, String(amount))
  }

  // 周期配置
  const updateCycle = (minutes: number, data: Partial<CycleConfig>) => {
    patchConfig('cycle', 'update', data, String(minutes))
  }

  // 动画配置
  const updateAnimation = (data: Partial<AnimationConfig>) => {
    patchConfig('animation', 'update', data)
  }

  // 赔率配置
  const updateOdds = (data: Partial<typeof config.odds>) => {
    patchConfig('odds', 'update', data)
  }

  // 基础配置
  const updateBasic = (data: Partial<Pick<SystemConfig, 'unitPrice' | 'minQuantity' | 'maxQuantity'>>) => {
    patchConfig('basic', 'update', data)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  const tabs: { id: ConfigTab; label: string; icon: string }[] = [
    { id: 'basic', label: '基础设置', icon: '⚙️' },
    { id: 'energy', label: '能源类型', icon: '⚡' },
    { id: 'province', label: '省份管理', icon: '🗺️' },
    { id: 'betAmount', label: '投注档位', icon: '💰' },
    { id: 'cycle', label: '投资周期', icon: '⏱️' },
    { id: 'odds', label: '赔率设置', icon: '📊' },
    { id: 'animation', label: '开奖动画', icon: '🎬' },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">系统配置</h1>

      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900/50 border border-green-500 text-green-300' 
            : 'bg-red-900/50 border border-red-500 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* 标签导航 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 基础设置 */}
      {activeTab === 'basic' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-6">基础设置</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-gray-300 mb-2">单价（元/股）</label>
              <input
                type="number"
                value={config.unitPrice}
                onChange={(e) => updateBasic({ unitPrice: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                min="1"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">最小购买股数</label>
              <input
                type="number"
                value={config.minQuantity}
                onChange={(e) => updateBasic({ minQuantity: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                min="1"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">最大购买股数</label>
              <input
                type="number"
                value={config.maxQuantity}
                onChange={(e) => updateBasic({ maxQuantity: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                min="1"
              />
            </div>
          </div>
        </div>
      )}

      {/* 能源类型管理 */}
      {activeTab === 'energy' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">能源类型管理</h2>
          
          {/* 列表 */}
          <div className="space-y-3 mb-6">
            {config.energyTypes.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.name.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-gray-400 text-sm">ID: {item.id} | 排序: {item.sortOrder}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={item.color}
                    onChange={(e) => updateEnergyType(item.id, { color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <button
                    onClick={() => toggleEnergyType(item.id)}
                    className={`px-3 py-1 rounded text-sm ${
                      item.enabled 
                        ? 'bg-green-600 text-white' 
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {item.enabled ? '启用' : '禁用'}
                  </button>
                  <button
                    onClick={() => deleteEnergyType(item.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 新增 */}
          <div className="flex gap-4">
            <input
              type="text"
              value={newEnergyType.name}
              onChange={(e) => setNewEnergyType({ ...newEnergyType, name: e.target.value })}
              placeholder="能源类型名称"
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
            />
            <input
              type="color"
              value={newEnergyType.color}
              onChange={(e) => setNewEnergyType({ ...newEnergyType, color: e.target.value })}
              className="w-14 h-12 rounded cursor-pointer"
            />
            <button
              onClick={addEnergyType}
              disabled={saving}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>
      )}

      {/* 省份管理 */}
      {activeTab === 'province' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">省份管理</h2>
          
          <div className="flex flex-wrap gap-2 mb-6">
            {config.provinces.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  item.enabled ? 'bg-gray-700' : 'bg-gray-700/50'
                }`}
              >
                <span className={`${item.enabled ? 'text-white' : 'text-gray-500'}`}>
                  {item.name}
                </span>
                <button
                  onClick={() => toggleProvince(item.id)}
                  className={`text-xs px-2 py-0.5 rounded ${
                    item.enabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {item.enabled ? '启' : '禁'}
                </button>
                <button
                  onClick={() => deleteProvince(item.id)}
                  className="text-gray-400 hover:text-red-400 text-lg"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newProvince}
              onChange={(e) => setNewProvince(e.target.value)}
              placeholder="新增省份"
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
              onKeyDown={(e) => e.key === 'Enter' && addProvince()}
            />
            <button
              onClick={addProvince}
              disabled={saving}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>
      )}

      {/* 投注档位管理 */}
      {activeTab === 'betAmount' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">投注档位管理</h2>
          
          <div className="flex flex-wrap gap-3 mb-6">
            {config.betAmounts.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
              <div
                key={item.amount}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
                  item.enabled ? 'bg-gray-700' : 'bg-gray-700/50'
                }`}
              >
                <span className={`font-bold ${item.enabled ? 'text-white' : 'text-gray-500'}`}>
                  ¥{item.amount.toLocaleString()}
                </span>
                <button
                  onClick={() => toggleBetAmount(item.amount)}
                  className={`text-xs px-2 py-0.5 rounded ${
                    item.enabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {item.enabled ? '启' : '禁'}
                </button>
                <button
                  onClick={() => deleteBetAmount(item.amount)}
                  className="text-gray-400 hover:text-red-400 text-lg"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={newBetAmount}
              onChange={(e) => setNewBetAmount(e.target.value)}
              placeholder="新增投注金额"
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
              min="0"
            />
            <button
              onClick={addBetAmount}
              disabled={saving}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>
      )}

      {/* 周期配置 */}
      {activeTab === 'cycle' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-6">投资周期配置</h2>
          
          <div className="space-y-4">
            {config.cycles.map((item) => (
              <div key={item.minutes} className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">⏱️</span>
                    <div>
                      <p className="text-white font-bold text-lg">{item.minutes} 分钟周期</p>
                      <p className="text-gray-400 text-sm">每 {item.minutes} 分钟开奖一次</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateCycle(item.minutes, { enabled: !item.enabled })}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      item.enabled 
                        ? 'bg-green-600 text-white' 
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {item.enabled ? '启用中' : '已禁用'}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">封盘时间（秒）</label>
                    <input
                      type="number"
                      value={item.sealSeconds}
                      onChange={(e) => updateCycle(item.minutes, { sealSeconds: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-green-500"
                      min="10"
                      max={item.minutes * 60}
                    />
                    <p className="text-gray-500 text-xs mt-1">开奖前多少秒封盘</p>
                  </div>
                  <div className="flex items-end">
                    <div className="bg-gray-600 rounded-lg p-3 w-full">
                      <p className="text-gray-300 text-sm">
                        投注时间：<span className="text-green-400 font-bold">{item.minutes * 60 - item.sealSeconds}</span> 秒
                      </p>
                      <p className="text-gray-300 text-sm">
                        封盘时间：<span className="text-red-400 font-bold">{item.sealSeconds}</span> 秒
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 赔率配置 */}
      {activeTab === 'odds' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-6">赔率设置</h2>
          
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-center mb-4">
                <span className="text-3xl">⚡</span>
                <h3 className="text-white font-bold mt-2">能源类型赔率</h3>
                <p className="text-gray-400 text-sm">猜中能源類型</p>
              </div>
              <input
                type="number"
                value={config.odds.energyType}
                onChange={(e) => updateOdds({ energyType: Number(e.target.value) })}
                className="w-full text-center text-3xl font-bold px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-yellow-400 focus:outline-none focus:border-green-500"
                step="0.1"
                min="1"
              />
              <p className="text-center text-gray-400 text-sm mt-2">倍</p>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-center mb-4">
                <span className="text-3xl">🗺️</span>
                <h3 className="text-white font-bold mt-2">省份赔率</h3>
                <p className="text-gray-400 text-sm">猜中省份</p>
              </div>
              <input
                type="number"
                value={config.odds.province}
                onChange={(e) => updateOdds({ province: Number(e.target.value) })}
                className="w-full text-center text-3xl font-bold px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-yellow-400 focus:outline-none focus:border-green-500"
                step="0.1"
                min="1"
              />
              <p className="text-center text-gray-400 text-sm mt-2">倍</p>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-center mb-4">
                <span className="text-3xl">💰</span>
                <h3 className="text-white font-bold mt-2">金额赔率</h3>
                <p className="text-gray-400 text-sm">猜中金額區間</p>
              </div>
              <input
                type="number"
                value={config.odds.amount}
                onChange={(e) => updateOdds({ amount: Number(e.target.value) })}
                className="w-full text-center text-3xl font-bold px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-yellow-400 focus:outline-none focus:border-green-500"
                step="0.1"
                min="1"
              />
              <p className="text-center text-gray-400 text-sm mt-2">倍</p>
            </div>
          </div>
        </div>
      )}

      {/* 开奖动画配置 */}
      {activeTab === 'animation' && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-6">开奖动画设置</h2>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-700 rounded-lg p-6">
              <h3 className="text-white font-medium mb-4">动画时长</h3>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  value={config.animation.duration}
                  onChange={(e) => updateAnimation({ duration: Number(e.target.value) })}
                  min="5"
                  max="30"
                  className="flex-1"
                />
                <span className="text-3xl font-bold text-green-400">{config.animation.duration}</span>
                <span className="text-gray-400">秒</span>
              </div>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-6">
              <h3 className="text-white font-medium mb-4">视觉效果</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <span className="text-gray-300">粒子效果</span>
                  <input
                    type="checkbox"
                    checked={config.animation.showParticles}
                    onChange={(e) => updateAnimation({ showParticles: e.target.checked })}
                    className="w-6 h-6 rounded"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-gray-300">倒计时显示</span>
                  <input
                    type="checkbox"
                    checked={config.animation.showCountdown}
                    onChange={(e) => updateAnimation({ showCountdown: e.target.checked })}
                    className="w-6 h-6 rounded"
                  />
                </label>
              </div>
            </div>
          </div>
          
          {/* 动画预览 */}
          <div className="mt-6 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-xl p-8 text-center border border-green-500/30">
            <div className="text-4xl mb-4 animate-bounce">🎰</div>
            <h3 className="text-2xl font-bold text-white mb-2 animate-pulse">开奖中...</h3>
            <div className="text-6xl font-black text-green-400 mb-4 animate-pulse">
              {config.animation.duration}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full w-1/2" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
