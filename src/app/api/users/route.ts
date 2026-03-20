import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Transaction from '@/models/Transaction'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// 验证管理员
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

// 验证用户
async function verifyUser(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; role: string }
  } catch {
    return null
  }
}

/**
 * 用户管理 API
 * 
 * GET /api/users - 获取用户列表(管理员)
 * GET /api/users?me=true - 获取当前用户信息
 * POST /api/users - 创建用户(管理员)
 * PUT /api/users - 更新当前用户信息
 * DELETE /api/users?id=xxx - 删除用户(管理员)
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    
    // 获取当前用户信息
    if (searchParams.get('me') === 'true') {
      const user = await verifyUser(request)
      if (!user) {
        return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
      }
      const userData = await User.findById(user.id).select('-password')
      return NextResponse.json({ success: true, user: userData })
    }

    // 管理员获取用户列表
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search')

    const query: Record<string, unknown> = {}
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { realName: { $regex: search, $options: 'i' } },
      ]
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(query),
    ])

    return NextResponse.json({
      success: true,
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })

  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { username, password, realName, phone, balance = 0 } = body

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '請填寫必填項' }, { status: 400 })
    }

    const existing = await User.findOne({ username })
    if (existing) {
      return NextResponse.json({ success: false, error: '用戶名已存在' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await User.create({
      username,
      password: hashedPassword,
      realName,
      phone,
      balance,
      isActive: true,
    })

    // 初始余额记录
    if (balance > 0) {
      await Transaction.create({
        userId: user._id,
        type: 'deposit',
        amount: balance,
        balance: balance,
        remark: '開戶初始餘額',
      })
    }

    return NextResponse.json({ 
      success: true, 
      user: { id: user._id, username: user.username, balance: user.balance } 
    })

  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const body = await request.json()
    const userId = searchParams.get('id')

    // 管理员更新用户
    if (userId) {
      const admin = await verifyAdmin(request)
      if (!admin) {
        return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
      }

      const user = await User.findByIdAndUpdate(userId, body, { new: true }).select('-password')
      return NextResponse.json({ success: true, user })
    }

    // 用户更新自己的信息
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
    }

    const allowedFields = ['realName', 'phone', 'email']
    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    const updatedUser = await User.findByIdAndUpdate(user.id, updates, { new: true }).select('-password')
    return NextResponse.json({ success: true, user: updatedUser })

  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await dbConnect()
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('id')
    if (!userId) {
      return NextResponse.json({ success: false, error: '缺少用戶ID' }, { status: 400 })
    }

    await User.findByIdAndUpdate(userId, { deletedAt: new Date() })
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}
