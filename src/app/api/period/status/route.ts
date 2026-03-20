import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Config from '@/models/Config'

// 计算当前期号状态
function calculatePeriodStatus(cycleMinutes: number, sealSeconds: number) {
  const now = new Date()
  const totalSecondsInCycle = cycleMinutes * 60
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  const secondsInCurrentCycle = secondsSinceMidnight % totalSecondsInCycle
  const remainingSeconds = totalSecondsInCycle - secondsInCurrentCycle
  
  // 判断是否封盘
  const isSealed = remainingSeconds <= sealSeconds
  
  // 计算期号
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const periodNum = Math.floor(secondsSinceMidnight / totalSecondsInCycle) + 1
  const currentPeriod = `${dateStr}${periodNum.toString().padStart(4, '0')}`
  const nextPeriod = `${dateStr}${(periodNum + 1).toString().padStart(4, '0')}`
  
  return {
    currentPeriod,
    nextPeriod,
    remainingSeconds,
    isSealed,
    sealSeconds,
    cycleMinutes,
  }
}

// 获取当前期号状态
export async function GET(request: NextRequest) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const cycle = parseInt(searchParams.get('cycle') || '5')

    // 获取配置
    let config = await Config.findOne()
    if (!config) {
      config = await Config.create({})
    }

    const cycleConfig = config.cycles?.find((c: { minutes: number }) => c.minutes === cycle) || 
      { minutes: cycle, enabled: true, sealSeconds: 30 }

    const status = calculatePeriodStatus(cycle, cycleConfig.sealSeconds)

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        animation: config.animation || { duration: 10, showParticles: true, showCountdown: true },
        unitPrice: config.unitPrice || 2,
        minQuantity: config.minQuantity || 1,
        maxQuantity: config.maxQuantity || 1000,
      },
    })

  } catch (error) {
    console.error('Get period status error:', error)
    return NextResponse.json({ 
      success: false, 
      error: '獲取期號狀態失敗' 
    }, { status: 500 })
  }
}
