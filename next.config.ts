import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 服务端Actions
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // 图片优化配置
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  
  // 环境变量
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
  },
}

export default nextConfig
