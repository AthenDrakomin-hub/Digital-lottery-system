import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import User from '@/models/User'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 获取当前用户信息
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    let decoded: any
    
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return NextResponse.json({ success: false, error: 'Token无效或已过期' }, { status: 401 })
    }

    await dbConnect()
    const user = await User.findById(decoded.id || decoded.userId).select('-password -idCard')
    
    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: '用户不存在或已被禁用' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
      }
    })
  } catch (error: any) {
    console.error('Auth check error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
  }
}

// 登录
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '请输入用户名和密码' }, { status: 400 })
    }

    await dbConnect()
    
    const user = await User.findOne({ username: username.trim() })
    if (!user) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: '账户已被禁用，请联系管理员' }, { status: 403 })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 })
    }

    // 更新最后登录信息
    user.lastLoginAt = new Date()
    user.lastActiveAt = new Date()
    await user.save()

    // 生成Token
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
      }
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
  }
}

// 登出（客户端清除Token即可）
export async function DELETE() {
  return NextResponse.json({ success: true, message: '已登出' })
}
