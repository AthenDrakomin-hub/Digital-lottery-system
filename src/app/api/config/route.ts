import { NextResponse } from 'next/server'
import Config from '@/models/Config'
import dbConnect from '@/lib/db'

// 获取配置（公开接口）
export async function GET() {
  try {
    await dbConnect()

    let config = await Config.findOne()
    
    if (!config) {
      // 创建默认配置
      config = await Config.create({})
    }
    
    return NextResponse.json({
      success: true,
      config: {
        energyTypes: config.energyTypes || [],
        provinces: config.provinces || [],
        betAmounts: config.betAmounts || [],
        odds: config.odds || { energyType: 1.8, province: 2.5, amount: 3.0 },
        cycles: config.cycles || [
          { minutes: 5, enabled: true, sealSeconds: 30 },
          { minutes: 10, enabled: true, sealSeconds: 30 },
          { minutes: 15, enabled: true, sealSeconds: 30 },
        ],
        animation: config.animation || { duration: 10, showParticles: true, showCountdown: true },
        unitPrice: config.unitPrice || 2,
        minQuantity: config.minQuantity || 1,
        maxQuantity: config.maxQuantity || 1000,
      },
    })
  } catch (error) {
    console.error('Get config error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
