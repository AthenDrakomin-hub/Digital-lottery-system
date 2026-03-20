import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import LotteryResult from '@/models/LotteryResult'
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
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const results = await LotteryResult.find({ date })
      .sort({ cycle: 1, period: 1 })

    return NextResponse.json({
      success: true,
      results: results.map(r => ({
        _id: r._id,
        period: r.period,
        cycle: r.cycle,
        date: r.date,
        results: r.results,
        status: r.status,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get lottery results error:', error)
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

    const { date, cycle, result } = await request.json()

    if (!date || !cycle || !result) {
      return NextResponse.json({ success: false, error: '參數不完整' }, { status: 400 })
    }

    // Generate period number
    const todayResults = await LotteryResult.find({ date, cycle })
    const periodNum = todayResults.length + 1
    const period = `${date.replace(/-/g, '')}${String(cycle).padStart(2, '0')}${String(periodNum).padStart(3, '0')}`

    // Create result
    const lotteryResult = await LotteryResult.create({
      period,
      cycle,
      date,
      results: [result],
      status: 'pending',
    })

    return NextResponse.json({
      success: true,
      result: {
        _id: lotteryResult._id,
        period: lotteryResult.period,
        cycle: lotteryResult.cycle,
        date: lotteryResult.date,
        results: lotteryResult.results,
        status: lotteryResult.status,
      },
    })
  } catch (error) {
    console.error('Create lottery result error:', error)
    return NextResponse.json({ success: false, error: '創建失敗' }, { status: 500 })
  }
}
