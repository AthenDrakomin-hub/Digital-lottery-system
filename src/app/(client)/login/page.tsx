'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '../layout'

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username.trim() || !password.trim()) {
      setError('請輸入用戶名和密碼')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: 'include',
      })

      const data = await res.json()

      if (data.success && data.user) {
        setUser(data.user)
        router.push('/invest')
      } else {
        setError(data.error || '登錄失敗，請稍後重試')
      }
    } catch (err) {
      setError('網絡錯誤，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full min-h-screen flex items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 bg-[#00a8b5]">
        <img 
          src="https://picsum.photos/1920/1080?blur=5&random=30" 
          className="w-full h-full object-cover opacity-60 mix-blend-multiply" 
          alt="bg" 
        />
        <div className="absolute inset-0 flex flex-wrap opacity-30">
          {Array.from({length: 80}).map((_, i) => (
            <div key={i} className="w-32 h-32 border border-white/20 transform rotate-45 m-4" />
          ))}
        </div>
      </div>

      {/* 21+ Badge */}
      <div className="absolute top-10 right-10 bg-white/95 p-3 rounded shadow-xl border-2 border-orange-400 z-10 flex flex-col items-center">
        <span className="text-orange-600 font-extrabold text-xl">21+</span>
        <span className="text-[10px] text-orange-400 font-bold">CADPA</span>
        <span className="text-[10px] text-gray-600">適齡提示</span>
      </div>

      {/* Login Box */}
      <div className="relative z-20 w-[500px] bg-white rounded-md shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-[#32b24a]" />
        <div className="p-12">
          {/* Logo */}
          <div className="flex justify-center mb-12">
            <Link href="/home" className="flex items-center space-x-3">
              <img 
                src="https://www.towngassmartenergy.com/images/common/logo.png" 
                className="h-10" 
                alt="Logo" 
              />
              <div className="flex flex-col text-[#00529b] font-bold leading-tight">
                <span className="text-xl tracking-tight">港華智慧能源</span>
                <span className="text-[11px]">Towngas Smart Energy</span>
              </div>
            </Link>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form className="space-y-8" onSubmit={handleSubmit}>
            <div className="relative border-b border-gray-200 focus-within:border-[#32b24a] transition-colors">
              <div className="absolute inset-y-0 left-0 flex items-center">
                <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                </svg>
              </div>
              <input 
                type="text" 
                placeholder="請輸入用戶名" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full pl-8 py-3 outline-none text-sm placeholder:text-gray-300 disabled:bg-gray-50"
              />
            </div>

            <div className="relative border-b border-gray-200 focus-within:border-[#32b24a] transition-colors">
              <div className="absolute inset-y-0 left-0 flex items-center">
                <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
                </svg>
              </div>
              <input 
                type="password" 
                placeholder="請輸入密碼" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-8 py-3 outline-none text-sm placeholder:text-gray-300 disabled:bg-gray-50"
              />
            </div>

            <div className="flex items-center text-xs text-gray-400">
              <input type="checkbox" id="remember" className="mr-2" />
              <label htmlFor="remember">記住密碼</label>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#1a8b33] text-white py-3.5 rounded-md font-bold text-lg hover:bg-[#157a2c] shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '登錄中...' : '登錄'}
            </button>

            <div className="flex justify-between space-x-4 pt-4">
              <button type="button" className="flex-1 bg-[#2d8f36] text-white py-2.5 rounded-md text-sm hover:bg-green-700 transition-colors">
                免費註冊
              </button>
              <button type="button" className="flex-1 bg-[#2d8f36] text-white py-2.5 rounded-md text-sm hover:bg-green-700 transition-colors">
                聯繫客服
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
