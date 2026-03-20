import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Bet from '@/models/Bet'
import Transaction from '@/models/Transaction'
import Config from '@/models/Config'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

async function verifyUser(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; role: string }
  } catch {
    return null
  }
}

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
 * 投注管理 API
 * 
 * GET /api/bet - 获取投注记录
 * GET /api/bet?type=recharge - 获取充值记录(管理员)
 * POST /api/bet - 投注
 * POST /api/bet?type=recharge - 用户充值(管理员)
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    // 获取充值记录（管理员）
    if (type === 'recharge') {
      const admin = await verifyAdmin(request)
      if (!admin) {
        return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
      }

      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const userId = searchParams.get('userId')

      const query: Record<string, unknown> = { type: { $in: ['deposit', 'withdraw'] } }
      if (userId) query.userId = userId

      const [records, total] = await Promise.all([
        Transaction.find(query)
          .populate('userId', 'username realName')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Transaction.countDocuments(query),
      ])

      return NextResponse.json({
        success: true,
        records,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }

    // 获取投注记录
    const user = await verifyUser(request)
    const admin = await verifyAdmin(request)
    
    if (!user && !admin) {
      return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const query: Record<string, unknown> = {}
    
    // 普通用户只能看自己的投注
    if (user && !admin) {
      query.userId = user.id
    }

    const [bets, total] = await Promise.all([
      Bet.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Bet.countDocuments(query),
    ])

    return NextResponse.json({
      success: true,
      data: bets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })

  } catch (error) {
    console.error('Get bets error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    // 用户充值（管理员）
    if (type === 'recharge') {
      const admin = await verifyAdmin(request)
      if (!admin) {
        return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
      }

      const body = await request.json()
      const { userId, amount, remark } = body

      if (!userId || !amount || amount <= 0) {
        return NextResponse.json({ success: false, error: '參數錯誤' }, { status: 400 })
      }

      const user = await User.findById(userId)
      if (!user) {
        return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
      }

      user.balance += amount
      await user.save()

      await Transaction.create({
        userId,
        type: 'deposit',
        amount,
        balance: user.balance,
        remark: remark || '管理員充值',
      })

      return NextResponse.json({ success: true, balance: user.balance })
    }

    // 投注
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
    }

    const body = await request.json()
    const { province, energyType, quantity, cycle = 5 } = body

    if (!province || !energyType || !quantity) {
      return NextResponse.json({ success: false, error: '請填寫完整信息' }, { status: 400 })
    }

    // 获取配置
    const config = await Config.findOne()
    const unitPrice = config?.unitPrice || 2
    const sealSeconds = config?.cycles?.find((c: { minutes: number }) => c.minutes === cycle)?.sealSeconds || 30

    // 计算当前期号
    const now = new Date()
    const periodIndex = Math.floor((now.getHours() * 60 + now.getMinutes()) / cycle)
    const period = `${now.toISOString().split('T')[0].replace(/-/g, '')}${cycle}${periodIndex.toString().padStart(3, '0')}`

    // 检查封盘
    const secondsInPeriod = (now.getMinutes() % cycle) * 60 + now.getSeconds()
    const remainingSeconds = cycle * 60 - secondsInPeriod
    const isSealed = remainingSeconds <= sealSeconds

    if (isSealed) {
      return NextResponse.json({ 
        success: false, 
        error: '當前期已封盤', 
        data: { isSealed } 
      }, { status: 400 })
    }

    const totalAmount = quantity * unitPrice

    // 检查余额
    const userData = await User.findById(user.id)
    if (!userData || userData.balance < totalAmount) {
      return NextResponse.json({ success: false, error: '餘額不足' }, { status: 400 })
    }

    // 扣款
    userData.balance -= totalAmount
    await userData.save()

    // 创建投注记录
    const bet = await Bet.create({
      userId: user.id,
      period,
      cycle,
      province,
      energyType,
      quantity,
      unitPrice,
      totalAmount,
      status: 'pending',
    })

    // 交易记录
    await Transaction.create({
      userId: user.id,
      type: 'bet',
      amount: totalAmount,
      balance: userData.balance,
      remark: `投注 ${period} 期`,
    })

    return NextResponse.json({ 
      success: true, 
      data: { 
        _id: bet._id,
        period, 
        quantity, 
        totalAmount 
      } 
    })

  } catch (error) {
    console.error('Bet error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
