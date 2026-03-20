import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import Config from '@/models/Config'
import User from '@/models/User'
import Transaction from '@/models/Transaction'
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
 * 系统配置 API
 * 
 * GET /api/config - 获取公开配置
 * GET /api/config?admin=true - 获取完整配置（管理员）
 * GET /api/config?dashboard=true - 获取仪表盘数据（管理员）
 * GET /api/config?period=true&cycle=5 - 获取期号状态
 * PUT /api/config - 更新配置（管理员）
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const isAdmin = searchParams.get('admin') === 'true'
    const isDashboard = searchParams.get('dashboard') === 'true'
    const isPeriod = searchParams.get('period') === 'true'

    // 获取期号状态
    if (isPeriod) {
      const cycle = parseInt(searchParams.get('cycle') || '5')
      const config = await Config.findOne()
      const sealSeconds = config?.cycles?.find((c: { minutes: number }) => c.minutes === cycle)?.sealSeconds || 30

      const now = new Date()
      const minutesInDay = now.getHours() * 60 + now.getMinutes()
      const periodIndex = Math.floor(minutesInDay / cycle)
      const secondsInPeriod = (now.getMinutes() % cycle) * 60 + now.getSeconds()
      const remainingSeconds = cycle * 60 - secondsInPeriod
      const isSealed = remainingSeconds <= sealSeconds

      const currentPeriod = `${now.toISOString().split('T')[0].replace(/-/g, '')}${cycle}${periodIndex.toString().padStart(3, '0')}`
      const nextPeriod = `${now.toISOString().split('T')[0].replace(/-/g, '')}${cycle}${(periodIndex + 1).toString().padStart(3, '0')}`

      return NextResponse.json({
        success: true,
        data: {
          currentPeriod,
          nextPeriod,
          remainingSeconds,
          isSealed,
          sealSeconds,
          cycleMinutes: cycle,
        },
      })
    }

    // 获取仪表盘数据（管理员）
    if (isDashboard) {
      const admin = await verifyAdmin(request)
      if (!admin) {
        return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [totalUsers, activeUsers, todayTransactions, todayStats, pendingDraws, balanceResult, recentUsers] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        Transaction.countDocuments({ createdAt: { $gte: today } }),
        Transaction.aggregate([
          { $match: { createdAt: { $gte: today } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Draw.countDocuments({ status: 'pending' }),
        User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
        User.find().sort({ createdAt: -1 }).limit(5).select('username realName balance createdAt'),
      ])

      return NextResponse.json({
        success: true,
        stats: {
          totalUsers,
          activeUsers,
          todayTransactions,
          todayAmount: todayStats[0]?.total || 0,
          pendingLotteries: pendingDraws,
          totalBalance: balanceResult[0]?.total || 0,
        },
        recentUsers: recentUsers.map(u => ({
          _id: u._id,
          username: u.username,
          realName: u.realName,
          balance: u.balance,
          createdAt: u.createdAt,
        })),
      })
    }

    // 获取配置
    const config = await Config.findOne() || {}

    // 公开配置
    const publicConfig = {
      energyTypes: config.energyTypes || [],
      provinces: config.provinces || [],
      betAmounts: config.betAmounts || [],
      unitPrice: config.unitPrice || 2,
      minQuantity: config.minQuantity || 1,
      maxQuantity: config.maxQuantity || 1000,
      cycles: config.cycles || [],
    }

    // 管理员返回完整配置
    if (isAdmin) {
      const admin = await verifyAdmin(request)
      if (!admin) {
        return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
      }
      return NextResponse.json({ success: true, config })
    }

    return NextResponse.json({ success: true, config: publicConfig })

  } catch (error) {
    console.error('Get config error:', error)
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

    const body = await request.json()
    
    const config = await Config.findOneAndUpdate(
      {},
      { $set: body },
      { new: true, upsert: true }
    )

    return NextResponse.json({ success: true, config })

  } catch (error) {
    console.error('Update config error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
