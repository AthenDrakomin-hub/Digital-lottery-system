import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Admin from '@/models/Admin'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7'

/**
 * 认证管理 API
 * 
 * POST /api/auth - 用户登录
 * POST /api/auth?type=admin - 管理员登录
 * GET /api/auth - 获取当前用户信息
 * GET /api/auth?type=admin - 获取当前管理员信息
 * DELETE /api/auth - 用户登出
 * DELETE /api/auth?type=admin - 管理员登出
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    
    const body = await request.json()
    const { username, password } = body
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '請輸入用戶名和密碼' }, { status: 400 })
    }

    // 管理员登录
    if (type === 'admin') {
      const admin = await Admin.findOne({ username })
      
      if (!admin) {
        // 自动创建默认管理员
        const hashedPassword = await bcrypt.hash('admin123', 10)
        const newAdmin = await Admin.create({
          username: 'admin',
          password: hashedPassword,
          role: 'admin',
        })
        const token = jwt.sign({ id: newAdmin._id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
        const response = NextResponse.json({ 
          success: true, 
          admin: { id: newAdmin._id, username: newAdmin.username, role: newAdmin.role } 
        })
        response.cookies.set('admin_token', token, { 
          httpOnly: true, 
          secure: process.env.NODE_ENV === 'production',
          maxAge: parseInt(JWT_EXPIRES_IN) * 24 * 60 * 60,
          path: '/' 
        })
        return response
      }

      const isValid = await bcrypt.compare(password, admin.password)
      if (!isValid) {
        return NextResponse.json({ success: false, error: '密碼錯誤' }, { status: 401 })
      }

      const token = jwt.sign({ id: admin._id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
      const response = NextResponse.json({ 
        success: true, 
        admin: { id: admin._id, username: admin.username, role: admin.role } 
      })
      response.cookies.set('admin_token', token, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: parseInt(JWT_EXPIRES_IN) * 24 * 60 * 60,
        path: '/' 
      })
      return response
    }

    // 用户登录
    const user = await User.findOne({ username })
    if (!user) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 401 })
    }

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return NextResponse.json({ success: false, error: '密碼錯誤' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: '賬戶已被禁用' }, { status: 403 })
    }

    const token = jwt.sign({ id: user._id, role: 'user' }, JWT_SECRET, { expiresIn: '7d' })
    const response = NextResponse.json({ 
      success: true, 
      user: { id: user._id, username: user.username, balance: user.balance } 
    })
    response.cookies.set('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: parseInt(JWT_EXPIRES_IN) * 24 * 60 * 60,
      path: '/' 
    })
    return response

  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ success: false, error: '服務器錯誤' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const tokenName = type === 'admin' ? 'admin_token' : 'token'
    const token = request.cookies.get(tokenName)?.value

    if (!token) {
      return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string }
    await dbConnect()

    if (type === 'admin') {
      const admin = await Admin.findById(decoded.id).select('-password')
      if (!admin) {
        return NextResponse.json({ success: false, error: '管理員不存在' }, { status: 401 })
      }
      return NextResponse.json({ success: true, admin })
    }

    const user = await User.findById(decoded.id).select('-password')
    if (!user) {
      return NextResponse.json({ success: false, error: '用戶不存在' }, { status: 401 })
    }
    return NextResponse.json({ success: true, user })

  } catch {
    return NextResponse.json({ success: false, error: '未登錄' }, { status: 401 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const tokenName = type === 'admin' ? 'admin_token' : 'token'
  
  const response = NextResponse.json({ success: true })
  response.cookies.delete(tokenName)
  return response
}
