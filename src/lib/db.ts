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
    throw new Error('请在环境变量中设置 MONGODB_URI')
  }

  // 如果已有连接，直接返回
  if (cached.conn) {
    return cached.conn
  }

  // 如果没有连接promise，创建一个
  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '1'),
      maxIdleTimeMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
    }

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('✅ 数据库连接成功')
      return mongoose.connection
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}

export default dbConnect
