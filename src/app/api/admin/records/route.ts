import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
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

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type')

    const query: Record<string, unknown> = {}

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59'),
      }
    }

    if (type && type !== 'all') {
      query.type = type
    }

    const records = await Transaction.find(query)
      .populate('userId', 'username realName')
      .sort({ createdAt: -1 })
      .limit(100)

    return NextResponse.json({
      success: true,
      records: records.map(r => ({
        _id: r._id,
        userId: r.userId,
        type: r.type,
        amount: r.amount,
        balance: r.balance,
        remark: r.remark,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get records error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
