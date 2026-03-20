'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/hooks/useUser'
import { useRouter } from 'next/navigation'

type Tab = 'management' | 'wallet' | 'recharge' | 'withdraw' | 'records' | 'cards'

export default function DashboardPage() {
  const { user, isLoggedIn, loading } = useUser()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('management')

  // 未登录重定向 - 等待加载完成后再判断
  useEffect(() => {
    if (!loading && !isLoggedIn) {
      router.push('/login')
    }
  }, [loading, isLoggedIn, router])

  // 加载中或未登录时显示
  if (loading || !isLoggedIn || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-500">{loading ? '載入中...' : '請先登錄...'}</p>
        </div>
      </div>
    )
  }

  const menuItems = [
    { id: 'management', label: '賬戶管理', section: '賬戶信息' },
    { id: 'wallet', label: '賬戶錢包', section: '資金管理' },
    { id: 'recharge', label: '我要儲蓄', section: '資金管理' },
    { id: 'withdraw', label: '我要提現', section: '資金管理' },
    { id: 'records', label: '交易記錄', section: '交易記錄' },
    { id: 'cards', label: '銀行卡管理', section: '賬戶信息' },
  ]

  return (
    <div className="max-w-[1440px] mx-auto px-10 py-10 flex gap-10">
      {/* Sidebar */}
      <aside className="w-[280px] shrink-0">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 sticky top-24">
          {/* User Header */}
          <div className="gradient-green-sidebar p-8 text-white text-center">
            <div className="text-[10px] mb-4 opacity-80 uppercase tracking-widest">個人中心</div>
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-4 border-2 border-white/30 flex items-center justify-center">
              <span className="text-2xl font-bold">{user.username.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="font-bold text-sm mb-1">你好，{user.username}</div>
            <div className="text-2xl font-black mb-4 tracking-tight">¥ {user.balance.toLocaleString()}.00</div>
            <div className="flex justify-center space-x-2">
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded">銀行卡 已綁定</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded">手機 已綁定</span>
            </div>
          </div>

          {/* Menu */}
          <div className="flex flex-col py-2">
            {menuItems.map((item, i) => {
              const showSection = i === 0 || item.section !== menuItems[i-1].section
              return (
                <div key={item.id}>
                  {showSection && (
                    <div className="bg-[#f0f9ff] text-[#32b24a] text-[11px] font-bold px-4 py-2 mt-2">
                      {item.section}
                    </div>
                  )}
                  <button 
                    onClick={() => setActiveTab(item.id as Tab)}
                    className={`w-full px-10 py-2.5 text-left text-sm transition-all ${
                      activeTab === item.id 
                        ? 'bg-[#1a8b33] text-white border-r-4 border-yellow-400 font-bold' 
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 min-h-[650px]">
          {/* 账户管理 */}
          {activeTab === 'management' && (
            <div className="space-y-8">
              <h3 className="text-[#32b24a] font-bold border-b border-gray-100 pb-2">賬戶管理</h3>
              
              <div className="flex flex-col items-center mb-10">
                <div className="w-20 h-20 bg-[#32b24a] rounded-full flex items-center justify-center text-white text-2xl font-black mb-2">
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-xl font-bold">{user.username}</div>
              </div>

              <div className="grid grid-cols-2 text-sm text-gray-500 border-b border-gray-50 pb-6 mb-6">
                <div>用戶名: <span className="text-gray-800 ml-2">{user.username}</span></div>
                <div>手機號: <span className="text-gray-800 ml-2">{user.phone || '未綁定'}</span></div>
              </div>

              <div className="space-y-4">
                {[
                  { label: '登錄密碼', sub: '定期修改更安全', link: '修改密碼' },
                  { label: '綁定銀行卡', sub: '最多可綁定5張', link: '去綁定' },
                  { label: '實名認證', sub: user.realName ? '已認證' : '未認證', link: user.realName ? '查看' : '去認證' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border border-gray-100 rounded hover:bg-gray-50">
                    <div>
                      <div className="font-bold text-sm text-gray-700">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.sub}</div>
                    </div>
                    <button className="text-blue-500 text-xs hover:underline">{item.link}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 账户钱包 */}
          {activeTab === 'wallet' && (
            <div className="space-y-8">
              <h3 className="text-[#32b24a] font-bold border-b border-gray-100 pb-2">賬戶錢包</h3>
              
              <div className="py-10">
                <div className="text-sm text-gray-500 mb-4">主錢包餘額（元）</div>
                <div className="text-5xl font-bold text-orange-400 mb-8">
                  ¥ {user.balance.toLocaleString()}.00
                </div>
                
                <div className="flex space-x-4">
                  <button 
                    onClick={() => setActiveTab('recharge')}
                    className="bg-[#32b24a] text-white px-8 py-3 rounded-lg font-bold hover:bg-[#1a8b33]"
                  >
                    立即儲蓄
                  </button>
                  <button 
                    onClick={() => setActiveTab('withdraw')}
                    className="bg-orange-500 text-white px-8 py-3 rounded-lg font-bold hover:bg-orange-600"
                  >
                    立即提現
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 储蓄 */}
          {activeTab === 'recharge' && (
            <div className="space-y-8">
              <h3 className="text-[#32b24a] font-bold border-b border-gray-100 pb-2">存款</h3>
              <div className="flex flex-col items-center justify-center pt-20">
                <p className="text-gray-500 mb-4">溫馨提示：存款請與 <span className="text-[#32b24a] cursor-pointer underline">在線客服</span> 聯繫</p>
              </div>
            </div>
          )}

          {/* 提现 */}
          {activeTab === 'withdraw' && (
            <div className="space-y-8">
              <h3 className="text-[#32b24a] font-bold border-b border-gray-100 pb-2">提款</h3>
              <div className="max-w-xl mx-auto space-y-6 py-6">
                <div className="flex items-center space-x-4 text-sm">
                  <span className="w-24 text-right text-gray-500">可提現金額：</span>
                  <span className="text-red-500 font-bold text-xl">¥ {user.balance.toLocaleString()}.00</span>
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <span className="w-24 text-right text-gray-500">提現金額：</span>
                  <input type="text" placeholder="請輸入提現金額" className="flex-1 border border-gray-200 p-2 rounded outline-none focus:border-[#32b24a]" />
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <span className="w-24 text-right text-gray-500">資金密碼：</span>
                  <input type="password" placeholder="請輸入提款密碼" className="flex-1 border border-gray-200 p-2 rounded outline-none focus:border-[#32b24a]" />
                </div>
                <div className="flex justify-center pt-4">
                  <button className="bg-blue-500 text-white px-12 py-2 rounded-full font-bold hover:bg-blue-600">
                    申請提款
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 交易记录 */}
          {activeTab === 'records' && (
            <div className="space-y-6">
              <h3 className="text-[#32b24a] font-bold border-b border-gray-100 pb-2">交易記錄</h3>
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 border-y border-gray-100">
                    <th className="py-3 px-1">時間</th>
                    <th className="py-3 px-1">類型</th>
                    <th className="py-3 px-1">金額</th>
                    <th className="py-3 px-1">餘額</th>
                    <th className="py-3 px-1">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="py-10 text-gray-300 italic">暫無交易記錄</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 银行卡管理 */}
          {activeTab === 'cards' && (
            <div className="space-y-8">
              <h3 className="text-[#32b24a] font-bold border-b border-gray-100 pb-2">銀行卡管理</h3>
              <div className="bg-blue-50 p-4 rounded text-xs text-blue-500 mb-8 border border-blue-100">
                同一賬戶最多綁定 5 張銀行卡！
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="bank-card h-[160px] flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div className="text-sm font-bold italic">示範銀行</div>
                    <div className="text-xs opacity-80">持卡人：***</div>
                  </div>
                  <div>
                    <div className="text-xl tracking-wider mb-2">**** **** **** 1234</div>
                    <div className="text-xs opacity-60">綁定時間: 2025/01/01</div>
                  </div>
                </div>
                <div className="border-2 border-dashed border-blue-400 rounded-lg h-[160px] flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 text-blue-500">
                  <div className="text-4xl mb-2">+</div>
                  <span className="text-sm font-bold">添加新的銀行卡</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
