import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // 输出为独立模式，适合部署
  output: 'standalone',
  
  // 显式设置根目录，避免多锁文件警告
  outputFileTracingRoot: path.join(__dirname),
  
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
  
  // 允许开发环境跨域访问
  allowedDevOrigins: [
    '5a1adc88-4828-4cda-9591-83583da169bf.dev.coze.site',
  ],
}

export default nextConfig
