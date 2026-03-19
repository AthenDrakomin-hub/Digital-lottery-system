/**
 * 限流中间件
 * 支持 Redis 和内存两种模式
 */

const redis = require('./redis');

// 内存存储（Redis不可用时的降级方案）
const memoryStore = new Map();

// 清理过期记录（每分钟执行一次）
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
        if (now > value.resetAt) {
            memoryStore.delete(key);
        }
    }
}, 60000);

/**
 * 限流配置
 */
const RATE_LIMITS = {
    // 投注接口：每秒1次，每分钟10次
    bet: { 
        windowMs: 60000, 
        max: 10, 
        keyPrefix: 'rate:bet',
        message: '投注操作过于频繁，请稍后再试'
    },
    // 充值接口：每分钟3次
    deposit: { 
        windowMs: 60000, 
        max: 3, 
        keyPrefix: 'rate:deposit',
        message: '充值操作过于频繁，请稍后再试'
    },
    // 提现接口：每分钟1次
    withdraw: { 
        windowMs: 60000, 
        max: 1, 
        keyPrefix: 'rate:withdraw',
        message: '提现操作过于频繁，请稍后再试'
    },
    // 登录接口：每分钟5次
    login: { 
        windowMs: 60000, 
        max: 5, 
        keyPrefix: 'rate:login',
        message: '登录尝试过于频繁，请稍后再试'
    },
    // 默认：每分钟20次
    default: { 
        windowMs: 60000, 
        max: 20, 
        keyPrefix: 'rate:default',
        message: '请求过于频繁，请稍后再试'
    }
};

/**
 * 获取客户端标识（IP + 用户ID）
 */
function getClientIdentifier(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                req.headers['x-real-ip'] || 
                req.connection?.remoteAddress || 
                'unknown';
    const userId = req.user?._id || req.body?.userId || 'anonymous';
    return `${ip}:${userId}`;
}

/**
 * Redis限流检查
 */
async function checkRateLimitRedis(key, config) {
    try {
        const current = await redis.incr(key);
        
        if (current === 1) {
            await redis.expire(key, Math.ceil(config.windowMs / 1000));
        }
        
        const ttl = await redis.ttl(key);
        
        return {
            allowed: current <= config.max,
            current,
            max: config.max,
            resetIn: ttl * 1000
        };
    } catch (error) {
        console.error('Redis限流检查失败:', error);
        // Redis失败时降级到内存模式
        return null;
    }
}

/**
 * 内存限流检查
 */
function checkRateLimitMemory(key, config) {
    const now = Date.now();
    const record = memoryStore.get(key);
    
    if (!record || now > record.resetAt) {
        // 创建新记录
        memoryStore.set(key, {
            count: 1,
            resetAt: now + config.windowMs
        });
        return {
            allowed: true,
            current: 1,
            max: config.max,
            resetIn: config.windowMs
        };
    }
    
    // 增加计数
    record.count++;
    const resetIn = record.resetAt - now;
    
    return {
        allowed: record.count <= config.max,
        current: record.count,
        max: config.max,
        resetIn
    };
}

/**
 * 创建限流中间件
 * @param {string} type - 限流类型
 * @param {object} customConfig - 自定义配置
 */
function createRateLimiter(type = 'default', customConfig = {}) {
    const config = { ...RATE_LIMITS[type], ...customConfig };
    
    return async (req, res, next) => {
        const clientId = getClientIdentifier(req);
        const key = `${config.keyPrefix}:${clientId}`;
        
        let result;
        
        // 优先使用Redis
        if (redis.isAvailable()) {
            result = await checkRateLimitRedis(key, config);
        }
        
        // Redis不可用或失败，使用内存
        if (!result) {
            result = checkRateLimitMemory(key, config);
        }
        
        // 设置响应头
        res.setHeader('X-RateLimit-Limit', result.max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, result.max - result.current));
        res.setHeader('X-RateLimit-Reset', Date.now() + result.resetIn);
        
        if (!result.allowed) {
            return res.status(429).json({
                error: config.message,
                retryAfter: Math.ceil(result.resetIn / 1000)
            });
        }
        
        // 传递限流信息
        req.rateLimit = result;
        next?.();
    };
}

/**
 * 限流检查函数（用于API处理函数）
 */
async function checkRateLimit(req, type = 'default') {
    const config = RATE_LIMITS[type] || RATE_LIMITS.default;
    const clientId = getClientIdentifier(req);
    const key = `${config.keyPrefix}:${clientId}`;
    
    if (redis.isAvailable()) {
        const result = await checkRateLimitRedis(key, config);
        if (result) return { ...result, config };
    }
    
    const result = checkRateLimitMemory(key, config);
    return { ...result, config };
}

module.exports = {
    createRateLimiter,
    checkRateLimit,
    RATE_LIMITS
};
