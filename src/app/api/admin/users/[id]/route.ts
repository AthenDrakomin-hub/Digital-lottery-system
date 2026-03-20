import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import User from '@/models/User'
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

export async function GET(
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
    const user = await User.findById(id).select('-password')

    if (!user) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
        balance: user.balance,
        status: user.status,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
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

    await dbConnect()

    const { id } = await params
    const body = await request.json()

    const user = await User.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true }
    ).select('-password')

    if (!user) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        status: user.status,
      },
    })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ success: false, error: '更新失敗' }, { status: 500 })
  }
}
