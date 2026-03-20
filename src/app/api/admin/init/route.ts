import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import Admin from '@/models/Admin'
import Config from '@/models/Config'
import dbConnect from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 检查是否需要初始化
export async function GET() {
  try {
    await dbConnect()
    
    const adminCount = await Admin.countDocuments()
    
    return NextResponse.json({
      success: true,
      needsInit: adminCount === 0,
      adminCount,
    })
  } catch (error) {
    console.error('Check init error:', error)
    return NextResponse.json({ success: false, error: '檢查失敗' }, { status: 500 })
  }
}

// 初始化系统
export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    
    const body = await request.json()
    const { setupKey, username, password } = body

    // 验证安装密钥（防止未授权访问）
    const validSetupKey = process.env.CRON_SECRET || 'setup-key-change-me'
    if (setupKey !== validSetupKey) {
      return NextResponse.json({ success: false, error: '無效的安裝密鑰' }, { status: 403 })
    }

    // 检查是否已有管理员
    const existingAdmin = await Admin.findOne({ username: username || 'admin' })
    if (existingAdmin) {
      return NextResponse.json({ 
        success: true, 
        message: '管理員已存在',
        admin: { username: existingAdmin.username }
      })
    }

    // 创建默认管理员
    const hashedPassword = await bcrypt.hash(password || 'admin123', 10)
    
    const admin = await Admin.create({
      username: username || 'admin',
      password: hashedPassword,
      role: 'admin',
    })

    // 创建默认配置
    const existingConfig = await Config.findOne()
    if (!existingConfig) {
      await Config.create({})
    }

    console.log('✅ 系统初始化完成')

    return NextResponse.json({
      success: true,
      message: '系統初始化成功',
      admin: {
        id: admin._id,
        username: admin.username,
      },
      defaultPassword: !password ? 'admin123' : undefined,
    })

  } catch (error) {
    console.error('Init system error:', error)
    return NextResponse.json({ success: false, error: '初始化失敗' }, { status: 500 })
  }
}
