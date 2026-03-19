// 加载环境变量（确保在任何模块中使用前已加载）
require('dotenv').config();

const mongoose = require('mongoose');

/**
 * 缓存数据库连接，避免每次函数调用都重新连接
 * 在Vercel Serverless环境中，全局变量在函数实例之间共享
 */
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

/**
 * 连接数据库
 * @returns {Promise<mongoose.Connection>}
 */
async function dbConnect() {
    // 检查环境变量
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        throw new Error('请在环境变量中设置 MONGODB_URI');
    }

    // 如果已有连接，直接返回
    if (cached.conn) {
        return cached.conn;
    }

    // 如果没有连接promise，创建一个
    if (!cached.promise) {
        // 优化的连接配置 - 针对 Vercel Serverless 环境
        const opts = {
            bufferCommands: false,
            appName: "devrel.vercel.integration", // Vercel Integration 标识
            maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10, // 连接池大小
            minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 1, // 最小连接数
            maxIdleTimeMS: 5000, // 空闲连接超时（Vercel 推荐）
            serverSelectionTimeoutMS: 5000, // 服务器选择超时
            socketTimeoutMS: 45000, // Socket超时
            connectTimeoutMS: 10000, // 连接超时
            heartbeatFrequencyMS: 10000, // 心跳频率
            retryWrites: true, // 重试写入
            retryReads: true, // 重试读取
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            console.log('✅ 数据库连接成功');
            return mongoose;
        });
    }

    // 等待连接完成
    cached.conn = await cached.promise;
    return cached.conn;
}

module.exports = dbConnect;
