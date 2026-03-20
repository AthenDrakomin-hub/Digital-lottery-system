import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Admin from '@/models/Admin'
import User from '@/models/User'
import Config from '@/models/Config'

// 数据库连接诊断 API（仅用于调试）
export async function GET() {
  const diagnostics: {
    timestamp: string
    envCheck: {
      MONGODB_URI: boolean
      MONGODB_URI_prefix: string
      JWT_SECRET: boolean
      NODE_ENV: string
    }
    connectionAttempt?: {
      success: boolean
      error?: string
      duration?: number
      host?: string
      dbName?: string
    }
    collections?: {
      admins: number
      users: number
      configs: number
    }
    mongooseState?: string
  } = {
    timestamp: new Date().toISOString(),
    envCheck: {
      MONGODB_URI: !!process.env.MONGODB_URI,
      MONGODB_URI_prefix: process.env.MONGODB_URI 
        ? process.env.MONGODB_URI.substring(0, 30) + '...' 
        : 'not set',
      JWT_SECRET: !!process.env.JWT_SECRET,
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
  }

  // 检查 MONGODB_URI 是否设置
  if (!process.env.MONGODB_URI) {
    diagnostics.connectionAttempt = {
      success: false,
      error: 'MONGODB_URI 环境变量未设置',
    }
    return NextResponse.json(diagnostics, { status: 500 })
  }

  // 尝试连接数据库
  const startTime = Date.now()
  try {
    const mongooseModule = await import('mongoose')
    
    // 创建新连接进行测试
    const conn = await mongooseModule.default.connect(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      dbName: 'lottery', // 指定数据库名
    })

    diagnostics.connectionAttempt = {
      success: true,
      duration: Date.now() - startTime,
      host: conn.connection.host,
      dbName: conn.connection.name,
    }
    diagnostics.mongooseState = conn.connection.readyState.toString()

    // 检查各集合数量
    try {
      const adminCount = await Admin.countDocuments()
      const userCount = await User.countDocuments()
      const configCount = await Config.countDocuments()
      
      diagnostics.collections = {
        admins: adminCount,
        users: userCount,
        configs: configCount,
      }
    } catch (countError) {
      console.error('Count documents error:', countError)
    }

    // 关闭测试连接
    await mongooseModule.default.disconnect()

    return NextResponse.json(diagnostics)
  } catch (error) {
    diagnostics.connectionAttempt = {
      success: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      duration: Date.now() - startTime,
    }
    return NextResponse.json(diagnostics, { status: 500 })
  }
}
