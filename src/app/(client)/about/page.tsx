export default function AboutPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative h-[400px] bg-gradient-to-r from-[#00529b] to-[#32b24a]">
        <div className="absolute inset-0 opacity-20">
          <img 
            src="https://picsum.photos/1920/400?random=2" 
            className="w-full h-full object-cover"
            alt="About Background"
          />
        </div>
        <div className="relative max-w-[1440px] mx-auto px-10 h-full flex items-center">
          <div className="text-white">
            <h1 className="text-5xl font-bold mb-4">關於我們</h1>
            <p className="text-xl opacity-90">引領能源未來，創造可持續的綠色能源世界</p>
          </div>
        </div>
      </section>

      {/* Company Info */}
      <section className="py-20 bg-white">
        <div className="max-w-[1440px] mx-auto px-10">
          <div className="grid grid-cols-2 gap-16">
            <div>
              <h2 className="text-3xl font-bold text-[#00529b] mb-8">公司簡介</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                港華智慧能源有限公司是香港中華煤氣有限公司旗下的清潔能源投資平台。
                我們致力於為投資者提供安全、穩定、高效的綠色能源投資服務，
                助力實現國家「雙碳」目標，推動可持續發展。
              </p>
              <p className="text-gray-600 leading-relaxed">
                作為行業領先的智慧能源平台，我們整合了核能、氫能、風能、太陽能等多種清潔能源項目，
                為投資者提供多元化的投資選擇和專業的資產管理服務。
              </p>
            </div>
            <div>
              <img 
                src="https://picsum.photos/600/400?random=3" 
                className="w-full rounded-lg shadow-lg"
                alt="Company"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-[1440px] mx-auto px-10">
          <div className="grid grid-cols-4 gap-8">
            {[
              { value: '100+', label: '能源項目' },
              { value: '50萬+', label: '投資用戶' },
              { value: '100億+', label: '管理資產' },
              { value: '99.9%', label: '用戶滿意度' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-[#32b24a] mb-2">{item.value}</div>
                <div className="text-gray-500">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-white">
        <div className="max-w-[1440px] mx-auto px-10">
          <h2 className="text-3xl font-bold text-center text-[#00529b] mb-16">核心價值</h2>
          <div className="grid grid-cols-3 gap-8">
            {[
              { title: '安全可靠', desc: '嚴格的風險控制體系，保障投資安全', icon: '🔒' },
              { title: '專業服務', desc: '專業的投資團隊，提供全方位服務', icon: '💼' },
              { title: '綠色發展', desc: '踐行ESG理念，推動可持續發展', icon: '🌱' },
            ].map((item, i) => (
              <div key={i} className="text-center p-8 rounded-xl bg-gray-50">
                <div className="text-5xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-[#00529b] mb-2">{item.title}</h3>
                <p className="text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
