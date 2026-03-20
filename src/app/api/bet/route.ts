import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Bet from '@/models/Bet'
import Transaction from '@/models/Transaction'
import Config from '@/models/Config'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// 验证用户登录
async function verifyUser(request: NextRequest) {
  // 优先从 cookie 获取 token
  let token = request.cookies.get('user_token')?.value
  
  // 如果没有 cookie，尝试从 header 获取
  if (!token) {
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1]
    }
  }
  
  if (!token) return null
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string }
    return decoded
  } catch {
    return null
  }
}

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
    nextPeriodStartsIn: isSealed ? remainingSeconds : 0,
  }
}

// 生成期号
function generatePeriod(cycle: number): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const minutes = now.getHours() * 60 + now.getMinutes()
  const periodNum = Math.floor(minutes / cycle) + 1
  return `${dateStr}${periodNum.toString().padStart(4, '0')}`
}

// 投注 POST
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '請先登錄' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { province, energyType, quantity, cycle = 5 } = body

    // 参数验证
    if (!province || !energyType || !quantity || quantity < 1) {
      return NextResponse.json({ 
        success: false, 
        error: '請選擇省份、能源類型並輸入有效股數' 
      }, { status: 400 })
    }

    // 获取配置
    let config = await Config.findOne()
    const sealSeconds = config?.cycles?.find((c: { minutes: number }) => c.minutes === cycle)?.sealSeconds || 30
    const unitPrice = config?.unitPrice || 2
    const minQuantity = config?.minQuantity || 1
    const maxQuantity = config?.maxQuantity || 1000

    // 验证数量范围
    if (quantity < minQuantity || quantity > maxQuantity) {
      return NextResponse.json({ 
        success: false, 
        error: `購買股數需在 ${minQuantity} - ${maxQuantity} 之間` 
      }, { status: 400 })
    }

    // 检查封盘状态
    const periodStatus = calculatePeriodStatus(cycle, sealSeconds)
    if (periodStatus.isSealed) {
      return NextResponse.json({ 
        success: false, 
        error: '當前期已封盤，請等待下一期開盤',
        data: {
          isSealed: true,
          remainingSeconds: periodStatus.remainingSeconds,
          nextPeriod: periodStatus.nextPeriod,
        }
      }, { status: 400 })
    }

    // 获取用户信息
    const userDoc = await User.findById(user.id)
    if (!userDoc) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
    }

    if (!userDoc.isActive) {
      return NextResponse.json({ success: false, error: '賬戶已被禁用' }, { status: 403 })
    }

    const totalAmount = quantity * unitPrice

    // 验证余额
    if (userDoc.balance < totalAmount) {
      return NextResponse.json({ 
        success: false, 
        error: `餘額不足，當前餘額: ¥${userDoc.balance.toFixed(2)}` 
      }, { status: 400 })
    }

    const period = periodStatus.currentPeriod

    // 使用事务处理
    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      // 1. 扣减余额
      const newBalance = userDoc.balance - totalAmount
      await User.findByIdAndUpdate(
        user.id,
        { 
          $set: { 
            balance: newBalance,
            lastActiveAt: new Date()
          } 
        },
        { session }
      )

      // 2. 创建投注记录
      const bet = await Bet.create([{
        userId: user.id,
        period,
        cycle,
        province,
        energyType,
        quantity,
        unitPrice,
        totalAmount,
        status: 'pending',
      }], { session })

      // 3. 创建交易记录
      await Transaction.create([{
        userId: user.id,
        type: 'bet',
        amount: totalAmount,
        balance: newBalance,
        remark: `投注: ${province} - ${energyType} x${quantity}股 (期號: ${period})`,
      }], { session })

      // 提交事务
      await session.commitTransaction()
      session.endSession()

      return NextResponse.json({
        success: true,
        data: {
          betId: bet[0]._id,
          period,
          province,
          energyType,
          quantity,
          totalAmount,
          newBalance,
          remainingSeconds: periodStatus.remainingSeconds,
        },
        message: '投注成功'
      })

    } catch (transactionError) {
      // 回滚事务
      await session.abortTransaction()
      session.endSession()
      throw transactionError
    }

  } catch (error) {
    console.error('Bet error:', error)
    return NextResponse.json({ 
      success: false, 
      error: '投注失敗，請稍後重試' 
    }, { status: 500 })
  }
}

// 获取投注记录 GET
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '請先登錄' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status')

    const query: Record<string, unknown> = { userId: user.id }
    if (status && ['pending', 'won', 'lost', 'cancelled'].includes(status)) {
      query.status = status
    }

    const bets = await Bet.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()

    const total = await Bet.countDocuments(query)

    return NextResponse.json({
      success: true,
      data: bets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })

  } catch (error) {
    console.error('Get bets error:', error)
    return NextResponse.json({ 
      success: false, 
      error: '獲取投注記錄失敗' 
    }, { status: 500 })
  }
}
