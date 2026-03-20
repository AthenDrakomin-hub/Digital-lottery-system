import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import Draw from '@/models/Draw'

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

/**
 * 开奖管理 API
 * 
 * GET /api/draws - 获取开奖记录（公开）
 * GET /api/draws?admin=true - 获取开奖记录（管理员，含统计）
 * POST /api/draws - 创建/更新开奖结果（管理员）
 * PUT /api/draws?id=xxx - 更新开奖状态（管理员）
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const isAdmin = searchParams.get('admin') === 'true'
    
    const date = searchParams.get('date')
    const interval = searchParams.get('interval')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')

    const query: Record<string, unknown> = {}

    if (date) query.date = date
    if (interval) query.interval = parseInt(interval)
    if (status) query.status = status

    const draws = await Draw.find(query)
      .sort({ date: -1, interval: 1, period: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await Draw.countDocuments(query)

    // 管理员返回完整信息
    const responseData = draws.map(d => ({
      _id: d._id,
      interval: d.interval,
      date: d.date,
      period: d.period,
      result: d.result,
      status: d.status,
      ...(isAdmin && { settlementStats: d.settlementStats, settledAt: d.settledAt }),
    }))

    return NextResponse.json({
      success: true,
      draws: responseData,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })

  } catch (error) {
    console.error('Get draws error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { interval, date, period, result } = body

    // 验证结果格式
    if (result && !/^\d{10}$/.test(result)) {
      return NextResponse.json({ success: false, error: '開獎結果必須是10位數字' }, { status: 400 })
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

export async function PUT(request: NextRequest) {
  try {
    await dbConnect()
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 })
    }

    const body = await request.json()
    const draw = await Draw.findByIdAndUpdate(id, { ...body, updatedAt: new Date() }, { new: true })

    if (!draw) {
      return NextResponse.json({ success: false, error: '記錄不存在' }, { status: 404 })
    }

    return NextResponse.json({ success: true, draw })

  } catch (error) {
    console.error('Update draw error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
