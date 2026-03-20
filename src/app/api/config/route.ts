import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import dbConnect from '@/lib/db'
import Config, { DEFAULT_FIELD_MAPPING } from '@/models/Config'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 验证管理员权限
async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET)
    const User = (await import('@/models/User')).default
    await dbConnect()
    const user = await User.findById(decoded.id || decoded.userId)
    return user && user.role === 'admin' && user.isActive ? user : null
  } catch {
    return null
  }
}

// 获取配置
export async function GET(req: NextRequest) {
  try {
    await dbConnect()

    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key') || 'fieldMapping'

    // 初始化默认配置
    await (Config as any).initDefaults()

    const config = await Config.findOne({ key })
    
    return NextResponse.json({
      success: true,
      data: config ? config.value : DEFAULT_FIELD_MAPPING
    })
  } catch (error: any) {
    console.error('Get config error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// 更新配置（需要管理员权限）
export async function PUT(req: NextRequest) {
  try {
    const admin = await verifyAdmin(req)
    if (!admin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
    }

    await dbConnect()

    const body = await req.json()
    const { key = 'fieldMapping', value } = body

    if (!value) {
      return NextResponse.json({ error: '缺少配置值' }, { status: 400 })
    }

    const config = await Config.findOneAndUpdate(
      { key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    )

    return NextResponse.json({
      success: true,
      message: '配置已更新',
      data: config.value
    })
  } catch (error: any) {
    console.error('Update config error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
