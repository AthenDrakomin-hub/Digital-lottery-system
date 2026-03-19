const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error('请在环境变量中设置 MONGODB_URI');
}

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
    // 如果已有连接，直接返回
    if (cached.conn) {
        return cached.conn;
    }

    // 如果没有连接promise，创建一个
    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }

    // 等待连接完成
    cached.conn = await cached.promise;
    return cached.conn;
}

module.exports = dbConnect;
