import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import User from '@/models/User'
import Transaction from '@/models/Transaction'
import LotteryResult from '@/models/LotteryResult'
import { connectDB } from '@/lib/mongodb'

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

    await connectDB()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [totalUsers, activeUsers, todayTransactions, todayStats, pendingLotteries, balanceResult, recentUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      Transaction.countDocuments({ createdAt: { $gte: today } }),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      LotteryResult.countDocuments({ status: 'pending' }),
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
        pendingLotteries,
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
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
