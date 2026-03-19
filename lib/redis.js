/**
 * Redis连接工具
 * 支持Upstash Redis和其他Redis服务
 */

let redis = null;
let redisConnected = false;

/**
 * 获取Redis客户端
 * 支持多种Redis服务：
 * - Upstash Redis（推荐用于Vercel）
 * - Redis Labs
 * - 自建Redis
 */
function getRedisClient() {
    if (redis) {
        return redis;
    }

    const REDIS_URL = process.env.REDIS_URL;
    
    if (!REDIS_URL) {
        console.log('⚠️  REDIS_URL未配置，缓存功能已禁用');
        return null;
    }

    try {
        // 检测是否为Upstash Redis
        if (REDIS_URL.includes('upstash.io')) {
            // 使用Upstash Redis SDK
            const { Redis } = require('@upstash/redis');
            redis = new Redis({
                url: REDIS_URL,
                token: process.env.REDIS_TOKEN || '',
            });
            console.log('✅ Upstash Redis已配置');
        } else {
            // 使用标准Redis客户端
            const { createClient } = require('redis');
            redis = createClient({
                url: REDIS_URL,
                socket: {
                    connectTimeout: 5000,
                    reconnectStrategy: (retries) => {
                        if (retries > 3) {
                            console.error('Redis连接失败，超过最大重试次数');
                            return new Error('Redis连接失败');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            });

            redis.on('error', (err) => {
                console.error('Redis错误:', err.message);
                redisConnected = false;
            });

            redis.on('connect', () => {
                console.log('✅ Redis已连接');
                redisConnected = true;
            });

            redis.on('disconnect', () => {
                console.log('⚠️  Redis已断开');
                redisConnected = false;
            });

            // 连接Redis
            redis.connect().catch(err => {
                console.error('Redis连接失败:', err.message);
            });
        }

        return redis;
    } catch (error) {
        console.error('Redis初始化失败:', error.message);
        return null;
    }
}

/**
 * 检查Redis是否可用
 */
async function isRedisReady() {
    const client = getRedisClient();
    if (!client) return false;

    try {
        // Upstash Redis
        if (client.ping) {
            await client.ping();
            return true;
        }
        // 标准 Redis
        if (client.isConnected && client.isConnected()) {
            return true;
        }
        return redisConnected;
    } catch (error) {
        return false;
    }
}

/**
 * 关闭Redis连接
 */
async function closeRedis() {
    if (redis && redis.quit) {
        await redis.quit();
        redis = null;
        redisConnected = false;
    }
}

module.exports = {
    getRedisClient,
    isRedisReady,
    closeRedis
};
