'use client'

import Link from 'next/link'
import { useUser } from '@/hooks/useUser'

export default function HomePage() {
  const { isLoggedIn } = useUser()

  return (
    <div>
      {/* Hero Section */}
      <section className="relative h-[600px] bg-gradient-to-r from-[#00529b] to-[#32b24a]">
        <div className="absolute inset-0 opacity-20">
          <img 
            src="https://picsum.photos/1920/600?random=1" 
            className="w-full h-full object-cover"
            alt="Hero Background"
          />
        </div>
        <div className="relative max-w-[1440px] mx-auto px-10 h-full flex items-center">
          <div className="text-white max-w-2xl">
            <h1 className="text-5xl font-bold mb-6">
              引領能源未來
              <br />
              <span className="text-[#7db38a]">創造可持續的綠色能源世界</span>
            </h1>
            <p className="text-xl mb-8 opacity-90">
              港華智慧能源致力於提供一站式清潔能源方案，包括可再生能源、能源儲存及智慧能源平台，助力實現國家「雙碳」目標。
            </p>
            <div className="flex space-x-4">
              <Link 
                href="/invest" 
                className="bg-[#32b24a] text-white px-8 py-3 rounded-full font-bold hover:bg-[#1a8b33] transition-colors"
              >
                立即投資
              </Link>
              <Link 
                href="/about" 
                className="border-2 border-white text-white px-8 py-3 rounded-full font-bold hover:bg-white hover:text-[#00529b] transition-colors"
              >
                了解更多
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-[1440px] mx-auto px-10">
          <h2 className="text-3xl font-bold text-center text-[#00529b] mb-16">我們的優勢</h2>
          <div className="grid grid-cols-4 gap-8">
            {[
              { icon: '⚡', title: '清潔能源', desc: '提供多元化清潔能源解決方案' },
              { icon: '🔒', title: '安全可靠', desc: '嚴格的風險控制體系' },
              { icon: '📈', title: '穩定收益', desc: '專業的投資管理團隊' },
              { icon: '🌐', title: '全球佈局', desc: '覆蓋多個國家和地區' },
            ].map((item, i) => (
              <div key={i} className="text-center p-8 rounded-xl bg-gray-50 hover:shadow-lg transition-shadow">
                <div className="text-5xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-[#00529b] mb-2">{item.title}</h3>
                <p className="text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Energy Types */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-[1440px] mx-auto px-10">
          <h2 className="text-3xl font-bold text-center text-[#00529b] mb-16">能源類別</h2>
          <div className="grid grid-cols-5 gap-6">
            {[
              { name: '核能', color: 'bg-purple-500' },
              { name: '氫能', color: 'bg-blue-300' },
              { name: '電能', color: 'bg-gray-400' },
              { name: '風能', color: 'bg-green-600' },
              { name: '水能', color: 'bg-orange-500' },
              { name: '太陽能', color: 'bg-blue-500' },
              { name: '地熱能', color: 'bg-yellow-600' },
              { name: '洋流能', color: 'bg-cyan-500' },
              { name: '波浪能', color: 'bg-pink-600' },
              { name: '潮汐能', color: 'bg-red-600' },
            ].map((item, i) => (
              <div 
                key={i} 
                className={`${item.color} rounded-lg p-6 text-white text-center hover:scale-105 transition-transform cursor-pointer`}
              >
                <h3 className="text-lg font-bold">{item.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#32b24a]">
        <div className="max-w-[1440px] mx-auto px-10 text-center text-white">
          <h2 className="text-4xl font-bold mb-6">開啟您的綠色能源投資之旅</h2>
          <p className="text-xl mb-8 opacity-90">立即加入，共同創造可持續的未來</p>
          <Link 
            href={isLoggedIn ? '/invest' : '/login'} 
            className="inline-block bg-white text-[#32b24a] px-10 py-4 rounded-full font-bold text-lg hover:bg-gray-100 transition-colors"
          >
            {isLoggedIn ? '立即投資' : '立即登錄'}
          </Link>
        </div>
      </section>
    </div>
  )
}
