import type { Metadata } from 'next'
import { Noto_Sans_TC } from 'next/font/google'
import '@/styles/globals.css'

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-tc',
})

export const metadata: Metadata = {
  title: '港華智慧能源 | Towngas Smart Energy',
  description: '港華智慧能源致力於提供一站式清潔能源方案，包括可再生能源、能源儲存及智慧能源平台。',
  keywords: '港華智慧能源, 綠色能源, 可再生能源, 投資中心, 智慧能源, Towngas',
  openGraph: {
    title: '港華智慧能源 Towngas Smart Energy',
    description: '引領能源未來，創造可持續的綠色能源世界。',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-HK" className={notoSansTC.variable}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
