import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
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

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const users = await User.find().sort({ createdAt: -1 }).select('-password')

    return NextResponse.json({
      success: true,
      users: users.map(u => ({
        _id: u._id,
        username: u.username,
        realName: u.realName,
        phone: u.phone,
        email: u.email,
        balance: u.balance,
        status: u.status,
        createdAt: u.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get users error:', error)
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

    const { username, password, realName, phone, email, balance } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '用戶名和密碼不能為空' }, { status: 400 })
    }

    // Check if username exists
    const existing = await User.findOne({ username })
    if (existing) {
      return NextResponse.json({ success: false, error: '用戶名已存在' }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await User.create({
      username,
      password: hashedPassword,
      realName,
      phone,
      email,
      balance: balance || 0,
      status: 'active',
    })

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        realName: user.realName,
        balance: user.balance,
      },
    })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ success: false, error: '創建失敗' }, { status: 500 })
  }
}
