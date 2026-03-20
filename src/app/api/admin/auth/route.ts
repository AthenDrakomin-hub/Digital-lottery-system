import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import Admin from '@/models/Admin'
import { connectDB } from '@/lib/mongodb'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '請輸入用戶名和密碼' }, { status: 400 })
    }

    // Find admin
    const admin = await Admin.findOne({ username })
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
    await connectDB()
    
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
