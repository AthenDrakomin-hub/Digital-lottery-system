import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 输出为独立模式，适合部署
  output: 'standalone',
  
  // 实验性功能
  experimental: {
    // 启用服务端Actions
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
