'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/hooks/useUser'
import { useRouter } from 'next/navigation'

// 投注记录接口
interface BetRecord {
  _id: string
  period: string
  province: string
  energyType: string
  quantity: number
  totalAmount: number
  status: 'pending' | 'won' | 'lost' | 'cancelled'
  winAmount: number
  createdAt: string
}

// 期号状态
interface PeriodStatus {
  currentPeriod: string
  nextPeriod: string
  remainingSeconds: number
  isSealed: boolean
  sealSeconds: number
  cycleMinutes: number
}

// 最新开奖结果
interface LatestDraw {
  _id: string
  interval: number
  date: string
  period: number
  result: string
  status: string
}

// 能源名称映射
const ENERGY_NAMES: Record<string, string> = {
  nuclear: '核能',
  hydrogen: '氫能',
  electric: '電能',
  wind: '風能',
  water: '水能',
  solar: '太陽能',
  geothermal: '地熱能',
  ocean: '洋流能',
  wave: '波浪能',
  tidal: '潮汐能',
}

export default function InvestPage() {
  const { isLoggedIn, loading, user } = useUser()
  const router = useRouter()
  
  // 配置状态
  const [energyTypes, setEnergyTypes] = useState<Array<{id: string; name: string; color: string}>>([])
  const [provinces, setProvinces] = useState<string[]>([])
  const [unitPrice, setUnitPrice] = useState(2)
  const [minQuantity, setMinQuantity] = useState(1)
  const [maxQuantity, setMaxQuantity] = useState(1000)
  
  // 期号状态
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSealWarning, setShowSealWarning] = useState(false)
  
  // 投注状态
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [bets, setBets] = useState<BetRecord[]>([])
  const [loadingBets, setLoadingBets] = useState(false)
  
  // 最新开奖结果
  const [latestDraw, setLatestDraw] = useState<LatestDraw | null>(null)
  const [showDrawResult, setShowDrawResult] = useState(false)

  // 获取配置
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.config) {
        setEnergyTypes(data.config.energyTypes?.filter((e: { enabled: boolean }) => e.enabled) || [])
        setProvinces(data.config.provinces?.filter((p: { enabled: boolean }) => p.enabled).map((p: { name: string }) => p.name) || [])
        setUnitPrice(data.config.unitPrice || 2)
        setMinQuantity(data.config.minQuantity || 1)
        setMaxQuantity(data.config.maxQuantity || 1000)
      }
    } catch (error) {
      console.error('获取配置失败:', error)
    }
  }, [])

  // 获取期号状态
  const fetchPeriodStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/period/status?cycle=5', { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setPeriodStatus(data.data)
        setTimeLeft(data.data.remainingSeconds)
      }
    } catch (error) {
      console.error('获取期号状态失败:', error)
    }
  }, [])

  // 获取最新开奖结果
  const fetchLatestDraw = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/draws?date=${today}&interval=5&limit=1`, { credentials: 'include' })
      const data = await res.json()
      if (data.success && data.draws?.length > 0) {
        setLatestDraw(data.draws[0])
      }
    } catch (error) {
      console.error('获取开奖结果失败:', error)
    }
  }, [])

  // 获取投注记录
  const fetchBets = useCallback(async () => {
    if (!isLoggedIn) return
    
    setLoadingBets(true)
    try {
      const res = await fetch('/api/bet?limit=10', { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setBets(data.data || [])
      }
    } catch (error) {
      console.error('获取投注记录失败:', error)
    } finally {
      setLoadingBets(false)
    }
  }, [isLoggedIn])

  // 未登录重定向
  useEffect(() => {
    if (!loading && !isLoggedIn) {
      router.push('/client/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn])

  // 初始加载
  useEffect(() => {
    if (isLoggedIn) {
      fetchConfig()
      fetchPeriodStatus()
      fetchLatestDraw()
      fetchBets()
    }
  }, [isLoggedIn, fetchConfig, fetchPeriodStatus, fetchLatestDraw, fetchBets])

  // 倒计时
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // 期号结束，刷新数据
          fetchPeriodStatus()
          fetchLatestDraw()
          fetchBets()
          return periodStatus?.cycleMinutes ? periodStatus.cycleMinutes * 60 : 300
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [periodStatus, fetchPeriodStatus, fetchLatestDraw, fetchBets])

  // 封盘警告
  useEffect(() => {
    if (periodStatus?.sealSeconds && timeLeft <= periodStatus.sealSeconds && timeLeft > 0) {
      setShowSealWarning(true)
    } else {
      setShowSealWarning(false)
    }
  }, [timeLeft, periodStatus])

  // 投注提交
  const handleSubmit = async () => {
    if (!selectedProvince || !selectedEnergy) {
      setMessage({ type: 'error', text: '請選擇省份和能源類型' })
      return
    }

    if (periodStatus?.isSealed) {
      setMessage({ type: 'error', text: '當前期已封盤，請等待下一期開盤' })
      return
    }

    if (quantity < minQuantity || quantity > maxQuantity) {
      setMessage({ type: 'error', text: `購買股數需在 ${minQuantity} - ${maxQuantity} 之間` })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          province: selectedProvince,
          energyType: selectedEnergy,
          quantity,
          cycle: 5,
        }),
        credentials: 'include',
      })

      const data = await res.json()

      if (data.success) {
        setMessage({ type: 'success', text: `投注成功！期號: ${data.data.period}` })
        setSelectedProvince(null)
        setSelectedEnergy(null)
        setQuantity(1)
        fetchBets()
      } else {
        setMessage({ type: 'error', text: data.error || '投注失敗' })
        if (data.data?.isSealed) {
          setPeriodStatus(prev => prev ? { ...prev, isSealed: true } : null)
        }
      }
    } catch {
      setMessage({ type: 'error', text: '網絡錯誤，請稍後重試' })
    } finally {
      setSubmitting(false)
    }
  }

  // 格式化时间
  const formatTime = (t: number) => {
    const minutes = Math.floor(t / 60)
    const seconds = t % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // 格式化状态
  const formatStatus = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: '待開獎', color: 'text-yellow-600' },
      won: { text: '已中獎', color: 'text-green-600' },
      lost: { text: '未中獎', color: 'text-red-600' },
      cancelled: { text: '已取消', color: 'text-gray-500' },
    }
    return statusMap[status] || { text: status, color: 'text-gray-500' }
  }

  // 根据数字索引获取能源类型
  const getEnergyByIndex = (index: number) => {
    if (index < 0 || index >= energyTypes.length) return null
    return energyTypes[index]
  }

  // 渲染开奖结果数字球
  const renderResultBalls = (result: string) => {
    if (!result) return null
    const digits = result.split('')
    return (
      <div className="flex gap-1 justify-center">
        {digits.map((digit, index) => (
          <div
            key={index}
            className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg"
          >
            {digit}
          </div>
        ))}
      </div>
    )
  }

  // 加载中或未登录时显示
  if (loading || !isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-500">{loading ? '載入中...' : '請先登錄...'}</p>
        </div>
      </div>
    )
  }

  const totalAmount = quantity * unitPrice

  return (
    <div className="bg-gray-100 min-h-screen py-10 px-4">
      {/* 开奖结果弹窗 */}
      {showDrawResult && latestDraw && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowDrawResult(false)}>
          <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl p-8 max-w-md w-full mx-4 text-center border border-green-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-4">🎰</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              第 {latestDraw.period} 期開獎結果
            </h2>
            <p className="text-gray-400 text-sm mb-6">{latestDraw.date}</p>
            
            {/* 开奖结果数字球 */}
            <div className="mb-6">
              {renderResultBalls(latestDraw.result)}
            </div>

            {/* 能源类型映射 */}
            {latestDraw.result && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <p className="text-gray-400 text-sm mb-2">開獎能源類型</p>
                <div className="flex justify-center">
                  {(() => {
                    const energyIndex = parseInt(latestDraw.result[0])
                    const energy = getEnergyByIndex(energyIndex)
                    return energy ? (
                      <span 
                        className="px-4 py-2 rounded-lg text-white font-bold text-lg"
                        style={{ backgroundColor: energy.color }}
                      >
                        {energy.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">未知</span>
                    )
                  })()}
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  數字 {latestDraw.result[0]} = {getEnergyByIndex(parseInt(latestDraw.result[0]))?.name || '未知'}
                </p>
              </div>
            )}

            <button
              onClick={() => setShowDrawResult(false)}
              className="px-8 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[1200px] mx-auto bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className={`p-6 text-white transition-colors ${
          periodStatus?.isSealed ? 'bg-red-600' : 'bg-[#32b24a]'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black italic tracking-widest">
                {periodStatus?.isSealed ? '封盤中' : '競價結果'}
              </h1>
              <p className="text-xs opacity-80 mt-1">
                當前期號: {periodStatus?.currentPeriod || '---'} | 
                {periodStatus?.isSealed ? '等待開獎' : '競價進行中'}
              </p>
            </div>
            
            {/* 倒计时 */}
            <div className="flex items-center gap-6">
              <div className="flex space-x-1">
                {formatTime(timeLeft).split('').map((char, i) => (
                  <div key={i} className={`w-10 h-14 ${char === ':' ? 'flex items-center text-4xl' : 'bg-gray-800 rounded flex items-center justify-center text-3xl font-bold'} ${showSealWarning ? 'animate-pulse text-red-300' : ''}`}>
                    {char}
                  </div>
                ))}
              </div>

              {/* 查看最新开奖 */}
              {latestDraw && (
                <button
                  onClick={() => setShowDrawResult(true)}
                  className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <span>上一期結果</span>
                  <div className="flex gap-0.5">
                    {latestDraw.result?.slice(0, 3).split('').map((d, i) => (
                      <span key={i} className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs text-gray-800 font-bold">
                        {d}
                      </span>
                    ))}
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* 能源类型标签 */}
          <div className="flex space-x-1 mt-4">
            {energyTypes.slice(0, 10).map((t, index) => (
              <div 
                key={t.id} 
                style={{ backgroundColor: t.color }}
                className="px-2 py-1 rounded text-xs flex items-center gap-1 font-bold text-white"
              >
                <span className="bg-black/20 px-1 rounded">{index}</span>
                <span>{t.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 封盘警告 */}
        {periodStatus?.isSealed && (
          <div className="bg-red-50 border-b border-red-100 px-6 py-3">
            <div className="flex items-center text-red-600">
              <span className="text-xl mr-2">🔒</span>
              <span className="font-bold">當前期已封盤，暫停投注，請等待開獎結果</span>
            </div>
          </div>
        )}

        {/* 用户余额显示 */}
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">當前期號：</span>
              <span className="font-bold text-green-600">{periodStatus?.currentPeriod || '---'}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">當前餘額：</span>
              <span className="text-xl font-bold text-green-600">¥{user?.balance?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-700' 
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* 投注面板 */}
        <div className="p-6">
          {/* 省份选择 */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">選擇省份</h3>
            <div className="grid grid-cols-5 gap-2">
              {provinces.map(p => (
                <button
                  key={p}
                  onClick={() => !periodStatus?.isSealed && setSelectedProvince(p)}
                  disabled={periodStatus?.isSealed}
                  className={`py-2 rounded text-sm font-medium transition-colors ${
                    selectedProvince === p 
                      ? 'bg-[#32b24a] text-white' 
                      : periodStatus?.isSealed
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 能源类型选择 */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">
              選擇能源類型
              <span className="text-gray-400 font-normal ml-2">（數字0-9對應）</span>
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {energyTypes.map((t, index) => (
                <button
                  key={t.id}
                  onClick={() => !periodStatus?.isSealed && setSelectedEnergy(t.id)}
                  disabled={periodStatus?.isSealed}
                  style={{ backgroundColor: t.color }}
                  className={`py-3 rounded text-white text-sm font-bold transition-opacity flex items-center justify-center gap-1 ${
                    periodStatus?.isSealed ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'
                  } ${selectedEnergy === t.id ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                >
                  <span className="bg-black/20 px-1.5 rounded text-xs">{index}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 数量选择 */}
          <div className="mb-6 flex items-center space-x-4">
            <span className="text-sm text-gray-700">購買股數：</span>
            <div className="flex items-center border border-gray-300 rounded overflow-hidden">
              <button 
                type="button"
                onClick={() => setQuantity(Math.max(minQuantity, quantity - 1))}
                disabled={periodStatus?.isSealed}
                className={`px-4 py-2 ${periodStatus?.isSealed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                -
              </button>
              <input 
                type="number" 
                value={quantity} 
                onChange={(e) => setQuantity(Math.max(minQuantity, Math.min(maxQuantity, parseInt(e.target.value) || minQuantity)))}
                disabled={periodStatus?.isSealed}
                min={minQuantity}
                max={maxQuantity}
                className={`w-16 text-center py-2 outline-none ${periodStatus?.isSealed ? 'bg-gray-100 text-gray-400' : ''}`}
              />
              <button 
                type="button"
                onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                disabled={periodStatus?.isSealed}
                className={`px-4 py-2 ${periodStatus?.isSealed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                +
              </button>
            </div>
            <span className="text-sm text-gray-500">股 ({minQuantity}-{maxQuantity})</span>
            <span className="text-sm">
              單價：<span className="text-[#32b24a] font-bold">¥{unitPrice}</span>
            </span>
          </div>

          {/* 总金额 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">已選 <span className="text-red-500 font-bold">{selectedProvince && selectedEnergy ? quantity : 0}</span> 股</span>
              <span className="text-lg">
                共計：<span className="text-red-500 font-bold text-2xl">¥{selectedProvince && selectedEnergy ? totalAmount : 0}</span>
              </span>
            </div>
          </div>

          {/* 提交按钮 */}
          <button 
            onClick={handleSubmit}
            disabled={!selectedProvince || !selectedEnergy || submitting || periodStatus?.isSealed}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
              selectedProvince && selectedEnergy && !submitting && !periodStatus?.isSealed
                ? 'bg-[#32b24a] text-white hover:bg-[#1a8b33]'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {periodStatus?.isSealed 
              ? '🔒 封盤中，暫停投注' 
              : submitting 
                ? '提交中...' 
                : '一鍵交易'}
          </button>
        </div>

        {/* 交易记录表格 */}
        <div className="p-6 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4">今日交易記錄</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-y border-gray-100">
                  <th className="py-2 px-1">交易單號</th>
                  <th className="py-2 px-1">交易時間</th>
                  <th className="py-2 px-1">能源類別</th>
                  <th className="py-2 px-1">股數</th>
                  <th className="py-2 px-1">交易金額</th>
                  <th className="py-2 px-1">盈利</th>
                  <th className="py-2 px-1">狀態</th>
                </tr>
              </thead>
              <tbody>
                {loadingBets ? (
                  <tr>
                    <td colSpan={7} className="py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : bets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-gray-300 italic">
                      今日暫無交易記錄
                    </td>
                  </tr>
                ) : (
                  bets.map((bet) => {
                    const status = formatStatus(bet.status)
                    return (
                      <tr key={bet._id} className="border-b border-gray-50">
                        <td className="py-3 text-gray-700 font-mono">{bet.period}</td>
                        <td className="py-3 text-gray-600">
                          {new Date(bet.createdAt).toLocaleString('zh-TW', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="py-3">
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                            {ENERGY_NAMES[bet.energyType] || bet.energyType}
                          </span>
                        </td>
                        <td className="py-3 text-gray-700">{bet.quantity}</td>
                        <td className="py-3 text-gray-700 font-medium">¥{bet.totalAmount}</td>
                        <td className={`py-3 font-bold ${bet.winAmount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {bet.winAmount > 0 ? `+¥${bet.winAmount}` : '-'}
                        </td>
                        <td className={`py-3 ${status.color} font-medium`}>
                          {status.text}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
