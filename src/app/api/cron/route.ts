import { NextRequest, NextResponse } from 'next/server'
import Draw from '@/models/Draw'
import dbConnect from '@/lib/db'

/**
 * 定时任务 API
 * 
 * GET /api/cron - 生成开奖记录（Vercel Cron 调用）
 * GET /api/cron?date=YYYY-MM-DD - 生成指定日期的开奖记录
 */
export async function GET(request: NextRequest) {
  try {
    // 验证 cron 密钥
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // 本地开发环境跳过验证
    const isDev = process.env.NODE_ENV === 'development'
    if (!isDev && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0]

    // 每天的期号数量
    const cycles = [
      { interval: 5, periodsPerDay: 288 },
      { interval: 10, periodsPerDay: 144 },
      { interval: 15, periodsPerDay: 96 },
    ]

    const results = []

    for (const cycle of cycles) {
      const existingCount = await Draw.countDocuments({ date: dateStr, interval: cycle.interval })

      if (existingCount >= cycle.periodsPerDay) {
        results.push({ interval: cycle.interval, status: 'skipped', count: existingCount })
        continue
      }

      const existingPeriods = await Draw.find({ date: dateStr, interval: cycle.interval }).distinct('period')
      const existingPeriodSet = new Set(existingPeriods)

      const drawsToCreate = []
      for (let period = 0; period < cycle.periodsPerDay; period++) {
        if (existingPeriodSet.has(period)) continue

        const result = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('')
        drawsToCreate.push({
          interval: cycle.interval,
          date: dateStr,
          period,
          result,
          status: 'settled',
          settledAt: new Date(),
          updatedAt: new Date(),
        })
      }

      if (drawsToCreate.length > 0) {
        try {
          await Draw.insertMany(drawsToCreate, { ordered: false })
        } catch { /* ignore duplicate errors */ }
      }

      results.push({ interval: cycle.interval, status: 'created', count: drawsToCreate.length })
    }

    return NextResponse.json({ success: true, date: dateStr, results })

  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
