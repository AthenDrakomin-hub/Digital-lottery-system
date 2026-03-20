import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import Admin from '@/models/Admin'
import Config from '@/models/Config'
import dbConnect from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 自动初始化默认管理员
async function ensureDefaultAdmin() {
  try {
    const existingAdmin = await Admin.findOne({ username: 'admin' })
    if (existingAdmin) return existingAdmin

    // 创建默认管理员
    const hashedPassword = await bcrypt.hash('admin123', 10)
    const admin = await Admin.create({
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
    })
    
    console.log('✅ 自动创建默认管理员: admin / admin123')
    return admin
  } catch (error) {
    console.error('创建默认管理员失败:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '請輸入用戶名和密碼' }, { status: 400 })
    }

    // 尝试查找管理员
    let admin = await Admin.findOne({ username: username.trim() })
    
    // 如果是 admin 用户且不存在，自动创建
    if (!admin && username.trim() === 'admin') {
      admin = await ensureDefaultAdmin()
    }

    if (!admin) {
      return NextResponse.json({ success: false, error: '用戶名或密碼錯誤' }, { status: 401 })
    }

    // Verify password
    const isValid = await bcrypt.compare(password, admin.password)
    if (!isValid) {
      return NextResponse.json({ success: false, error: '用戶名或密碼錯誤' }, { status: 401 })
    }

    // Generate token
    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    const response = NextResponse.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
      },
    })

    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json({ success: false, error: '登錄失敗' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect()
    
    const token = request.cookies.get('admin_token')?.value
    if (!token) {
      return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string }
    
    const admin = await Admin.findById(decoded.id).select('-password')
    if (!admin) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
      },
    })
  } catch {
    return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('admin_token')
  return response
}
