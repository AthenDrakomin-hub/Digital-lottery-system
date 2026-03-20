import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await connectDB()

    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, unknown> = {}
    
    if (body.status) {
      updateData.status = body.status
    }
    
    if (body.result) {
      updateData.results = [body.result]
    }

    const result = await LotteryResult.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )

    if (!result) {
      return NextResponse.json({ success: false, error: '開獎結果不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      result: {
        _id: result._id,
        period: result.period,
        status: result.status,
        results: result.results,
      },
    })
  } catch (error) {
    console.error('Update lottery result error:', error)
    return NextResponse.json({ success: false, error: '更新失敗' }, { status: 500 })
  }
}
