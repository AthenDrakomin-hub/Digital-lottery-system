import mongoose from 'mongoose'

// 声明全局类型
declare global {
  var mongoose: {
    conn: mongoose.Connection | null
    promise: Promise<mongoose.Connection> | null
  }
}

// 缓存连接
let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

/**
 * 连接数据库
 * 优化Vercel Serverless环境下的连接管理
 */
async function dbConnect(): Promise<mongoose.Connection> {
  const MONGODB_URI = process.env.MONGODB_URI
  
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI 环境变量未设置')
    throw new Error('请在环境变量中设置 MONGODB_URI')
  }

  // 如果已有连接，直接返回
  if (cached.conn) {
    // 验证连接是否仍然有效
    if (cached.conn.readyState === 1) {
      return cached.conn
    }
    // 连接已断开，重新建立
    cached.conn = null
    cached.promise = null
  }

  // 如果没有连接promise，创建一个
  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      // 不硬编码数据库名，使用 URI 中的默认数据库或 Mongoose 默认
      maxPoolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '1'),
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
    }

    cached.promise = mongoose.connect(MONGODB_URI, opts)
      .then((mongoose) => {
        console.log('✅ 数据库连接成功')
        return mongoose.connection
      })
      .catch((error) => {
        console.error('❌ 数据库连接失败:', error.message)
        cached.promise = null
        throw error
      })
  }

  try {
    cached.conn = await cached.promise
    return cached.conn
  } catch (error) {
    cached.promise = null
    throw error
  }
}

export default dbConnect
