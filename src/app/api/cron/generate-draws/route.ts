import { NextRequest, NextResponse } from 'next/server'
import Draw from '@/models/Draw'
import dbConnect from '@/lib/db'

/**
 * Vercel Cron Job - 每天生成开奖记录
 * 调用方式: vercel.json 配置 cron
 * 也可以手动调用: GET /api/cron/generate-draws?date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    // 验证 cron 密钥（防止未授权访问）
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // 本地开发环境跳过验证
    const isDev = process.env.NODE_ENV === 'development'
    if (!isDev && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    // 获取日期参数或使用今天
    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0]

    // 计算每天的期号数量
    const cycles = [
      { interval: 5, periodsPerDay: 288 },   // 24*60/5 = 288
      { interval: 10, periodsPerDay: 144 },  // 24*60/10 = 144
      { interval: 15, periodsPerDay: 96 },   // 24*60/15 = 96
    ]

    const results = []

    for (const cycle of cycles) {
      // 检查今天是否已有记录
      const existingCount = await Draw.countDocuments({ 
        date: dateStr, 
        interval: cycle.interval 
      })

      if (existingCount >= cycle.periodsPerDay) {
        results.push({
          interval: cycle.interval,
          status: 'skipped',
          reason: 'already_exists',
          count: existingCount
        })
        continue
      }

      // 获取已存在的期号
      const existingPeriods = await Draw.find({ 
        date: dateStr, 
        interval: cycle.interval 
      }).distinct('period')
      
      const existingPeriodSet = new Set(existingPeriods)

      // 生成今天的开奖记录（只生成不存在的）
      const drawsToCreate = []
      
      for (let period = 0; period < cycle.periodsPerDay; period++) {
        // 跳过已存在的期号
        if (existingPeriodSet.has(period)) continue

        // 生成随机10位数字结果
        const result = Array.from({ length: 10 }, () => 
          Math.floor(Math.random() * 10)
        ).join('')

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

      // 批量插入
      if (drawsToCreate.length > 0) {
        try {
          await Draw.insertMany(drawsToCreate, { ordered: false })
        } catch (err) {
          // 忽略重复键错误
          console.log('部分记录已存在，跳过')
        }
      }

      results.push({
        interval: cycle.interval,
        status: 'created',
        count: drawsToCreate.length,
        existing: existingCount
      })
    }

    console.log(`✅ [Cron] 生成开奖记录完成: ${dateStr}`, results)

    return NextResponse.json({
      success: true,
      date: dateStr,
      results,
    })

  } catch (error) {
    console.error('❌ [Cron] 生成开奖记录失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
