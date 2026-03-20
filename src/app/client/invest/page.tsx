'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/hooks/useUser'
import { useRouter } from 'next/navigation'

// 能源类型
const ENERGY_TYPES = [
  { id: 'nuclear', name: '核能', color: 'bg-purple-500' },
  { id: 'hydrogen', name: '氫能', color: 'bg-blue-300' },
  { id: 'electric', name: '電能', color: 'bg-gray-400' },
  { id: 'wind', name: '風能', color: 'bg-green-600' },
  { id: 'water', name: '水能', color: 'bg-orange-500' },
  { id: 'solar', name: '太陽能', color: 'bg-blue-500' },
  { id: 'geothermal', name: '地熱能', color: 'bg-yellow-600' },
  { id: 'ocean', name: '洋流能', color: 'bg-cyan-500' },
  { id: 'wave', name: '波浪能', color: 'bg-pink-600' },
  { id: 'tidal', name: '潮汐能', color: 'bg-red-600' }
]

// 省份
const PROVINCES = ['浙江', '河北', '廣東', '安徽', '山東', '江蘇', '蒙古', '河南', '新疆', '四川']

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
  const [timeLeft, setTimeLeft] = useState(30)
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [bets, setBets] = useState<BetRecord[]>([])
  const [loadingBets, setLoadingBets] = useState(false)

  // 倒计时
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 30)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 未登录重定向
  useEffect(() => {
    if (!loading && !isLoggedIn) {
      router.push('/client/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn])

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

  // 初始加载投注记录
  useEffect(() => {
    if (isLoggedIn) {
      fetchBets()
    }
  }, [isLoggedIn, fetchBets])

  // 投注提交
  const handleSubmit = async () => {
    if (!selectedProvince || !selectedEnergy) {
      setMessage({ type: 'error', text: '請選擇省份和能源類型' })
      return
    }

    if (quantity < 1) {
      setMessage({ type: 'error', text: '請輸入有效股數' })
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
        // 重置选择
        setSelectedProvince(null)
        setSelectedEnergy(null)
        setQuantity(1)
        // 刷新投注记录
        fetchBets()
      } else {
        setMessage({ type: 'error', text: data.error || '投注失敗' })
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

  const totalAmount = quantity * 2

  return (
    <div className="bg-gray-100 min-h-screen py-10 px-4">
      <div className="max-w-[1200px] mx-auto bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-[#32b24a] p-6 flex items-center justify-between text-white">
          <div>
            <h1 className="text-3xl font-black italic tracking-widest">競價結果</h1>
            <p className="text-xs opacity-80 mt-1">本輪交易: 20250320001輪 | 競價截止時間</p>
          </div>
          
          {/* 倒计时 */}
          <div className="flex space-x-1">
            {formatTime(timeLeft).split('').map((char, i) => (
              <div key={i} className={`w-10 h-14 ${char === ':' ? 'flex items-center text-4xl' : 'bg-gray-800 rounded flex items-center justify-center text-3xl font-bold animate-countdown'}`}>
                {char}
              </div>
            ))}
          </div>

          {/* 能源类型标签 */}
          <div className="flex space-x-1">
            {ENERGY_TYPES.map(t => (
              <div key={t.id} className={`${t.color} w-8 h-8 rounded text-[10px] flex items-center justify-center font-bold text-white text-center leading-tight p-0.5`}>
                {t.name}
              </div>
            ))}
          </div>
        </div>

        {/* 用户余额显示 */}
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">當前餘額：</span>
            <span className="text-xl font-bold text-green-600">¥{user?.balance?.toFixed(2) || '0.00'}</span>
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
              {PROVINCES.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedProvince(p)}
                  className={`py-2 rounded text-sm font-medium transition-colors ${
                    selectedProvince === p 
                      ? 'bg-[#32b24a] text-white' 
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
            <h3 className="text-sm font-bold text-gray-700 mb-3">選擇能源類型</h3>
            <div className="grid grid-cols-5 gap-2">
              {ENERGY_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedEnergy(t.id)}
                  className={`${t.color} py-3 rounded text-white text-sm font-bold hover:opacity-80 transition-opacity ${
                    selectedEnergy === t.id ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                  }`}
                >
                  {t.name}
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
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200"
              >
                -
              </button>
              <input 
                type="number" 
                value={quantity} 
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                className="w-16 text-center py-2 outline-none"
              />
              <button 
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200"
              >
                +
              </button>
            </div>
            <span className="text-sm text-gray-500">股</span>
            <span className="text-sm">
              單價：<span className="text-[#32b24a] font-bold">2元</span>
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
            disabled={!selectedProvince || !selectedEnergy || submitting}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
              selectedProvince && selectedEnergy && !submitting
                ? 'bg-[#32b24a] text-white hover:bg-[#1a8b33]'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? '提交中...' : '一鍵交易'}
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
