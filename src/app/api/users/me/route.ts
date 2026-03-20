import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import User from '@/models/User'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export async function GET(request: NextRequest) {
  try {
    // 优先从 cookie 获取 token
    let token = request.cookies.get('user_token')?.value
    
    // 如果没有 cookie，尝试从 header 获取
    if (!token) {
      const authHeader = request.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]
      }
    }
    
    if (!token) {
      return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string }
    
    await dbConnect()
    
    const user = await User.findById(decoded.id).select('-password')
    if (!user) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: '賬戶已被禁用' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
        isActive: user.isActive,
      },
    })

  } catch {
    return NextResponse.json({ success: false, error: '無效的登錄狀態' }, { status: 401 })
  }
}
