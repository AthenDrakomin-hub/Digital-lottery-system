import { NextRequest, NextResponse } from 'next/server'
import Config from '@/models/Config'
import dbConnect from '@/lib/db'

// 获取配置
export async function GET() {
  try {
    await dbConnect()

    let config = await Config.findOne()
    
    if (!config) {
      // 创建默认配置
      config = await Config.create({
        energyTypes: ['核能', '氫能', '電能', '風能', '水能', '太陽能', '地熱能', '洋流能', '波浪能', '潮汐能'],
        provinces: ['北京', '上海', '廣東', '江蘇', '浙江', '山東', '四川', '湖北', '河南', '福建'],
        betAmounts: [100, 500, 1000, 5000, 10000],
        odds: { energyType: 1.8, province: 2.5, amount: 3.0 },
      })
    }
    
    return NextResponse.json({
      success: true,
      config: {
        energyTypes: config.energyTypes,
        provinces: config.provinces,
        betAmounts: config.betAmounts,
        odds: config.odds,
      },
    })
  } catch (error) {
    console.error('Get config error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
