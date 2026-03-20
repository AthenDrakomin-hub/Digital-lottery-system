import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import { maskUserInfo } from '@/lib/mask'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// JWT payload 类型
interface JwtPayload {
  id: string
  userId?: string
  username: string
  role: string
  iat: number
  exp: number
}

// 验证管理员权限
async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    await dbConnect()
    const user = await User.findById(decoded.id || decoded.userId)
    return user && user.role === 'admin' && user.isActive ? user : null
  } catch {
    return null
  }
}

// 获取用户列表（管理员）或当前用户信息
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    let decoded: JwtPayload
    
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    } catch {
      return NextResponse.json({ error: 'Token无效或已过期' }, { status: 401 })
    }

    await dbConnect()

    // 检查是否是管理员请求列表
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (action === 'list') {
      const admin = await verifyAdmin(req)
      if (!admin) {
        return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
      }

      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const search = searchParams.get('search') || ''

      interface UserQuery {
        $or?: Array<{
          username?: { $regex: string; $options: string }
          realName?: { $regex: string; $options: string }
        }>
      }
      const query: UserQuery = {}
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { realName: { $regex: search, $options: 'i' } }
        ]
      }

      const users = await User.find(query)
        .select('-password -idCard')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)

      const total = await User.countDocuments(query)

      return NextResponse.json({
        users: users.map(u => maskUserInfo(u.toObject())),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      })
    }

    // 获取当前用户信息
    const user = await User.findById(decoded.id || decoded.userId).select('-password -idCard')
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      user: maskUserInfo(user.toObject())
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
