import { NextRequest, NextResponse } from 'next/server'
import Draw from '@/models/Draw'
import dbConnect from '@/lib/db'

/**
 * 公开的开奖结果 API（无需登录）
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const interval = searchParams.get('interval')
    const limit = parseInt(searchParams.get('limit') || '20')

    const query: Record<string, unknown> = {}

    if (date) {
      query.date = date
    }

    if (interval) {
      query.interval = parseInt(interval)
    }

    const draws = await Draw.find(query)
      .sort({ date: -1, interval: 1, period: -1 })
      .limit(limit)

    return NextResponse.json({
      success: true,
      draws: draws.map(d => ({
        _id: d._id,
        interval: d.interval,
        date: d.date,
        period: d.period,
        result: d.result,
        status: d.status,
      })),
    })
  } catch (error) {
    console.error('Get draws error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
