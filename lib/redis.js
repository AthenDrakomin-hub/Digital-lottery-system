/**
 * Redis连接工具
 * 支持Upstash Redis和其他Redis服务
 */

let redis = null;
let redisConnected = false;
let connectionPromise = null;

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
            redisConnected = true;
            console.log('✅ Upstash Redis已配置');
        } else {
            // 使用标准Redis客户端 (redis v4+)
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

            redis.on('ready', () => {
                console.log('✅ Redis已连接');
                redisConnected = true;
            });

            redis.on('end', () => {
                console.log('⚠️  Redis已断开');
                redisConnected = false;
            });

            // 连接Redis（异步，但不等待）
            connectionPromise = redis.connect().catch(err => {
                console.error('Redis连接失败:', err.message);
                redisConnected = false;
            });
        }

        return redis;
    } catch (error) {
        console.error('Redis初始化失败:', error.message);
        return null;
    }
}

/**
 * 确保Redis已连接
 */
async function ensureConnected() {
    const client = getRedisClient();
    if (!client) return false;
    
    // 如果是标准Redis客户端，确保已连接
    if (connectionPromise) {
        try {
            await connectionPromise;
        } catch (e) {
            return false;
        }
    }
    
    return redisConnected || (redis && redis.isOpen);
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
        // 标准 Redis v4
        if (client.isReady || client.isOpen) {
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
        try {
            await redis.quit();
        } catch (e) {
            // 忽略关闭错误
        }
        redis = null;
        redisConnected = false;
    }
}

/**
 * 安全执行Redis命令
 * 处理Redis v4 API差异
 */
const safeRedis = {
    async get(client, key) {
        if (!client) return null;
        try {
            return await client.get(key);
        } catch (e) {
            console.error('Redis GET错误:', e.message);
            return null;
        }
    },
    
    async set(client, key, value, ttl) {
        if (!client) return false;
        try {
            // Redis v4: 使用 set 方法配合 EX 选项
            if (ttl) {
                await client.set(key, value, { EX: ttl });
            } else {
                await client.set(key, value);
            }
            return true;
        } catch (e) {
            console.error('Redis SET错误:', e.message);
            return false;
        }
    },
    
    async del(client, key) {
        if (!client) return false;
        try {
            await client.del(key);
            return true;
        } catch (e) {
            console.error('Redis DEL错误:', e.message);
            return false;
        }
    },
    
    async incrByFloat(client, key, amount) {
        if (!client) return null;
        try {
            return await client.incrByFloat(key, amount);
        } catch (e) {
            console.error('Redis INCRBYFLOAT错误:', e.message);
            return null;
        }
    },
    
    async expire(client, key, ttl) {
        if (!client) return false;
        try {
            await client.expire(key, ttl);
            return true;
        } catch (e) {
            console.error('Redis EXPIRE错误:', e.message);
            return false;
        }
    },
    
    async ttl(client, key) {
        if (!client) return -1;
        try {
            return await client.ttl(key);
        } catch (e) {
            console.error('Redis TTL错误:', e.message);
            return -1;
        }
    },
    
    async keys(client, pattern) {
        if (!client) return [];
        try {
            return await client.keys(pattern);
        } catch (e) {
            console.error('Redis KEYS错误:', e.message);
            return [];
        }
    }
};

module.exports = {
    getRedisClient,
    isRedisReady,
    closeRedis,
    ensureConnected,
    safeRedis
};
