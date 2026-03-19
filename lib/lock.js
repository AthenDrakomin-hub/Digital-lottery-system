/**
 * 分布式锁模块 - 基于Redis
 * 用于确保幂等性，防止重复执行
 */

const { getRedisClient } = require('./redis');

// 锁的默认TTL（毫秒）
const DEFAULT_LOCK_TTL = 30000; // 30秒

// 锁的key前缀
const LOCK_PREFIX = 'lottery:lock:';

/**
 * 分布式锁类
 */
class DistributedLock {
    constructor() {
        this.redis = null;
    }

    /**
     * 获取Redis客户端
     */
    _getRedis() {
        if (!this.redis) {
            this.redis = getRedisClient();
        }
        return this.redis;
    }

    /**
     * 尝试获取锁
     * @param {string} lockKey - 锁的键
     * @param {number} ttl - 锁的过期时间（毫秒）
     * @param {string} value - 锁的值（用于释放时验证）
     * @returns {boolean} 是否获取成功
     */
    async acquire(lockKey, ttl = DEFAULT_LOCK_TTL, value = null) {
        const redis = this._getRedis();
        if (!redis) {
            // Redis未配置，默认允许执行（降级处理）
            console.log(`[Lock] Redis未配置，跳过锁: ${lockKey}`);
            return true;
        }

        const key = LOCK_PREFIX + lockKey;
        const lockValue = value || `${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

        try {
            // 使用SET NX EX原子操作
            // NX: 仅当key不存在时设置
            // PX: 设置过期时间（毫秒）
            const result = await redis.set(key, lockValue, 'NX', 'PX', ttl);
            
            if (result === 'OK') {
                console.log(`[Lock] 获取锁成功: ${lockKey}`);
                return { success: true, value: lockValue };
            } else {
                console.log(`[Lock] 获取锁失败（已被占用）: ${lockKey}`);
                return { success: false, value: null };
            }
        } catch (error) {
            console.error(`[Lock] 获取锁异常: ${lockKey}`, error);
            // 异常情况下允许执行（降级处理）
            return { success: true, value: null };
        }
    }

    /**
     * 释放锁
     * @param {string} lockKey - 锁的键
     * @param {string} value - 锁的值（用于验证）
     * @returns {boolean} 是否释放成功
     */
    async release(lockKey, value) {
        const redis = this._getRedis();
        if (!redis) return true;

        const key = LOCK_PREFIX + lockKey;

        try {
            // 使用Lua脚本确保原子性
            // 仅当值匹配时才删除
            const script = `
                if redis.call("GET", KEYS[1]) == ARGV[1] then
                    return redis.call("DEL", KEYS[1])
                else
                    return 0
                end
            `;
            
            const result = await redis.eval(script, 1, key, value);
            
            if (result === 1) {
                console.log(`[Lock] 释放锁成功: ${lockKey}`);
                return true;
            } else {
                console.log(`[Lock] 释放锁失败（值不匹配或已过期）: ${lockKey}`);
                return false;
            }
        } catch (error) {
            console.error(`[Lock] 释放锁异常: ${lockKey}`, error);
            return false;
        }
    }

    /**
     * 续期锁（延长过期时间）
     * @param {string} lockKey - 锁的键
     * @param {string} value - 锁的值
     * @param {number} ttl - 新的过期时间（毫秒）
     * @returns {boolean} 是否续期成功
     */
    async renew(lockKey, value, ttl = DEFAULT_LOCK_TTL) {
        const redis = this._getRedis();
        if (!redis) return true;

        const key = LOCK_PREFIX + lockKey;

        try {
            // 使用Lua脚本确保原子性
            const script = `
                if redis.call("GET", KEYS[1]) == ARGV[1] then
                    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `;
            
            const result = await redis.eval(script, 1, key, value, ttl);
            
            if (result === 1) {
                console.log(`[Lock] 续期锁成功: ${lockKey}`);
                return true;
            } else {
                console.log(`[Lock] 续期锁失败: ${lockKey}`);
                return false;
            }
        } catch (error) {
            console.error(`[Lock] 续期锁异常: ${lockKey}`, error);
            return false;
        }
    }

    /**
     * 检查锁是否存在
     * @param {string} lockKey - 锁的键
     * @returns {boolean} 是否存在
     */
    async exists(lockKey) {
        const redis = this._getRedis();
        if (!redis) return false;

        const key = LOCK_PREFIX + lockKey;

        try {
            const result = await redis.exists(key);
            return result === 1;
        } catch (error) {
            console.error(`[Lock] 检查锁异常: ${lockKey}`, error);
            return false;
        }
    }

    /**
     * 获取锁的剩余TTL
     * @param {string} lockKey - 锁的键
     * @returns {number} 剩余毫秒数，-1表示不存在，-2表示无过期时间
     */
    async ttl(lockKey) {
        const redis = this._getRedis();
        if (!redis) return -1;

        const key = LOCK_PREFIX + lockKey;

        try {
            return await redis.pttl(key);
        } catch (error) {
            console.error(`[Lock] 获取TTL异常: ${lockKey}`, error);
            return -1;
        }
    }

    /**
     * 使用锁执行函数（自动获取和释放）
     * @param {string} lockKey - 锁的键
     * @param {Function} fn - 要执行的函数
     * @param {number} ttl - 锁的过期时间
     * @returns {object} 执行结果
     */
    async withLock(lockKey, fn, ttl = DEFAULT_LOCK_TTL) {
        const lockResult = await this.acquire(lockKey, ttl);
        
        if (!lockResult.success) {
            return {
                success: false,
                error: 'LOCK_ACQUIRE_FAILED',
                message: '获取锁失败，可能正在被其他进程处理'
            };
        }

        try {
            const result = await fn();
            return {
                success: true,
                result
            };
        } catch (error) {
            console.error(`[Lock] 执行函数异常: ${lockKey}`, error);
            return {
                success: false,
                error: 'EXECUTION_ERROR',
                message: error.message
            };
        } finally {
            if (lockResult.value) {
                await this.release(lockKey, lockResult.value);
            }
        }
    }
}

/**
 * 开奖结算锁管理器
 * 专门用于开奖结算场景的锁
 */
class DrawSettlementLock {
    constructor(lock) {
        this.lock = lock;
    }

    /**
     * 生成开奖结算锁的key
     * @param {string} date - 日期
     * @param {number} interval - 周期
     * @param {number} period - 期号
     */
    _getKey(date, interval, period) {
        return `draw:${date}:${interval}:${period}`;
    }

    /**
     * 获取开奖结算锁
     * @param {string} date - 日期
     * @param {number} interval - 周期
     * @param {number} period - 期号
     * @param {number} ttl - 过期时间（默认60秒）
     */
    async acquire(date, interval, period, ttl = 60000) {
        const key = this._getKey(date, interval, period);
        return await this.lock.acquire(key, ttl);
    }

    /**
     * 释放开奖结算锁
     */
    async release(date, interval, period, value) {
        const key = this._getKey(date, interval, period);
        return await this.lock.release(key, value);
    }

    /**
     * 检查开奖是否已被处理
     */
    async isProcessed(date, interval, period) {
        const key = this._getKey(date, interval, period);
        return await this.lock.exists(key);
    }

    /**
     * 使用锁执行开奖结算
     */
    async withDrawLock(date, interval, period, fn) {
        const key = this._getKey(date, interval, period);
        return await this.lock.withLock(key, fn, 60000);
    }
}

// 导出单例
const lock = new DistributedLock();
const drawLock = new DrawSettlementLock(lock);

module.exports = {
    lock,
    drawLock,
    DistributedLock,
    DrawSettlementLock,
    DEFAULT_LOCK_TTL
};
