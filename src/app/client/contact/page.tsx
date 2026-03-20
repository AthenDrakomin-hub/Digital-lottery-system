'use client'

import { useState } from 'react'

export default function ContactPage() {
  const [message, setMessage] = useState('')

  return (
    <div className="max-w-[800px] mx-auto px-10 py-20">
      <div className="bg-white rounded-xl shadow-lg p-10">
        <h1 className="text-2xl font-bold text-[#00529b] mb-8 text-center">聯繫我們</h1>
        
        {/* Contact Info */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="text-center p-6 bg-gray-50 rounded-lg">
            <div className="text-3xl mb-2">📞</div>
            <div className="font-bold text-gray-700 mb-1">客服熱線</div>
            <div className="text-sm text-gray-500">400-888-8888</div>
          </div>
          <div className="text-center p-6 bg-gray-50 rounded-lg">
            <div className="text-3xl mb-2">✉️</div>
            <div className="font-bold text-gray-700 mb-1">電子郵箱</div>
            <div className="text-sm text-gray-500">service@towngas.com</div>
          </div>
          <div className="text-center p-6 bg-gray-50 rounded-lg">
            <div className="text-3xl mb-2">⏰</div>
            <div className="font-bold text-gray-700 mb-1">服務時間</div>
            <div className="text-sm text-gray-500">09:00 - 18:00</div>
          </div>
        </div>

        {/* Message Form */}
        <div className="mb-10">
          <h2 className="font-bold text-gray-700 mb-4">在線留言</h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="請輸入您的留言..."
            className="w-full h-32 border border-gray-200 rounded-lg p-4 outline-none focus:border-[#32b24a] resize-none"
          />
          <button className="mt-4 w-full bg-[#32b24a] text-white py-3 rounded-lg font-bold hover:bg-[#1a8b33] transition-colors">
            提交留言
          </button>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="font-bold text-gray-700 mb-4">常見問題</h2>
          <div className="space-y-3">
            {[
              '如何開通賬戶？',
              '如何進行充值和提現？',
              '忘記密碼怎麼辦？',
              '投資收益如何計算？',
            ].map((q, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-100">
                <span className="text-sm text-gray-700">{q}</span>
                <span className="text-gray-400">→</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
