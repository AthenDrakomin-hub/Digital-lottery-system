import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import Draw from '@/models/Draw'
import dbConnect from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value
  if (!token) return null
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string }
    if (decoded.role !== 'admin') return null
    return decoded
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const interval = searchParams.get('interval')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')

    const query: Record<string, unknown> = {}

    if (date) {
      query.date = date
    }

    if (interval) {
      query.interval = parseInt(interval)
    }

    if (status) {
      query.status = status
    }

    const draws = await Draw.find(query)
      .sort({ date: -1, interval: 1, period: 1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await Draw.countDocuments(query)

    return NextResponse.json({
      success: true,
      draws: draws.map(d => ({
        _id: d._id,
        interval: d.interval,
        date: d.date,
        period: d.period,
        result: d.result,
        status: d.status,
        settlementStats: d.settlementStats,
        updatedAt: d.updatedAt,
        settledAt: d.settledAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get draws error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { interval, date, period, result } = body

    // 验证结果格式
    if (result && !/^\d{10}$/.test(result)) {
      return NextResponse.json({ 
        success: false, 
        error: '開獎結果必須是10位數字' 
      }, { status: 400 })
    }

    // 检查是否已存在
    const existing = await Draw.findOne({ date, interval, period })
    if (existing) {
      // 更新
      existing.result = result
      existing.status = 'settled'
      existing.settledAt = new Date()
      existing.updatedAt = new Date()
      await existing.save()
      
      return NextResponse.json({ success: true, draw: existing })
    }

    // 创建新记录
    const draw = await Draw.create({
      interval,
      date,
      period,
      result,
      status: 'settled',
      settledAt: new Date(),
      updatedAt: new Date(),
    })

    return NextResponse.json({ success: true, draw })
  } catch (error) {
    console.error('Create draw error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
