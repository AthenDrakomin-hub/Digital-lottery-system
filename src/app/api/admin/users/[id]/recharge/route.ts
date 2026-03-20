import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import User from '@/models/User'
import Transaction from '@/models/Transaction'
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const { amount, type, remark } = await request.json()

    if (!amount || amount === 0) {
      return NextResponse.json({ success: false, error: '請輸入有效金額' }, { status: 400 })
    }

    const user = await User.findById(id)
    if (!user) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
    }

    // Check balance for withdraw
    if (amount < 0 && user.balance + amount < 0) {
      return NextResponse.json({ success: false, error: '餘額不足' }, { status: 400 })
    }

    // Update balance
    const newBalance = user.balance + amount
    user.balance = newBalance
    await user.save()

    // Create transaction record
    await Transaction.create({
      userId: id,
      type: type || (amount > 0 ? 'deposit' : 'withdraw'),
      amount: Math.abs(amount),
      balance: newBalance,
      remark: remark || (amount > 0 ? '管理員充值' : '管理員扣款'),
    })

    return NextResponse.json({
      success: true,
      balance: newBalance,
    })
  } catch (error) {
    console.error('Recharge error:', error)
    return NextResponse.json({ success: false, error: '操作失敗' }, { status: 500 })
  }
}
