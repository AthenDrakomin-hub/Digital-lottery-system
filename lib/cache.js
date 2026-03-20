/**
 * 缓存服务模块
 * 提供开奖结果缓存和用户余额缓存功能
 */

const { getRedisClient, isRedisReady, ensureConnected, safeRedis } = require('./redis');

// 缓存键前缀
const CACHE_PREFIX = {
    DRAW: 'draw:',           // 开奖结果缓存
    DRAWS_DAILY: 'draws:',   // 每日开奖列表缓存
    USER_BALANCE: 'balance:', // 用户余额缓存
    USER_LOCK: 'lock:'       // 用户余额锁
};

// 缓存过期时间（秒）
const CACHE_TTL = {
    DRAW: 86400,           // 开奖结果：1天
    DRAWS_DAILY: 3600,     // 每日开奖列表：1小时
    USER_BALANCE: 300,     // 用户余额：5分钟
    USER_LOCK: 10          // 用户锁：10秒
};

/**
 * 检查缓存是否可用
 */
async function checkCacheAvailable() {
    const client = getRedisClient();
    if (!client) return false;
    return await isRedisReady();
}

/**
 * 缓存服务类
 */
class CacheService {
    constructor() {
        this.enabled = false;
        this.checkReady();
    }

    /**
     * 检查缓存是否可用
     */
    async checkReady() {
        this.enabled = await checkCacheAvailable();
        return this.enabled;
    }

    // ==================== 开奖结果缓存 ====================

    /**
     * 获取开奖结果缓存
     * @param {string} date - 日期 YYYY-MM-DD
     * @param {number} interval - 周期 5/10/15
     * @param {number} period - 期号
     */
    async getDrawResult(date, interval, period) {
        const client = getRedisClient();
        if (!client) return null;

        try {
            const key = `${CACHE_PREFIX.DRAW}${date}:${interval}:${period}`;
            const data = await safeRedis.get(client, key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('获取开奖结果缓存失败:', error.message);
            return null;
        }
    }

    /**
     * 设置开奖结果缓存
     * @param {string} date - 日期
     * @param {number} interval - 周期
     * @param {number} period - 期号
     * @param {Object} data - 开奖数据
     */
    async setDrawResult(date, interval, period, data) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            const key = `${CACHE_PREFIX.DRAW}${date}:${interval}:${period}`;
            return await safeRedis.set(client, key, JSON.stringify(data), CACHE_TTL.DRAW);
        } catch (error) {
            console.error('设置开奖结果缓存失败:', error.message);
            return false;
        }
    }

    /**
     * 获取每日开奖列表缓存
     * @param {string} date - 日期
     * @param {number} interval - 周期
     */
    async getDailyDraws(date, interval) {
        const client = getRedisClient();
        if (!client) return null;

        try {
            const key = `${CACHE_PREFIX.DRAWS_DAILY}${date}:${interval}`;
            const data = await safeRedis.get(client, key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('获取每日开奖列表缓存失败:', error.message);
            return null;
        }
    }

    /**
     * 设置每日开奖列表缓存
     * @param {string} date - 日期
     * @param {number} interval - 周期
     * @param {Array} draws - 开奖列表
     * @param {number} ttl - 过期时间（秒），默认1小时
     */
    async setDailyDraws(date, interval, draws, ttl = CACHE_TTL.DRAWS_DAILY) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            const key = `${CACHE_PREFIX.DRAWS_DAILY}${date}:${interval}`;
            return await safeRedis.set(client, key, JSON.stringify(draws), ttl);
        } catch (error) {
            console.error('设置每日开奖列表缓存失败:', error.message);
            return false;
        }
    }

    /**
     * 删除每日开奖列表缓存
     * @param {string} date - 日期
     * @param {number} interval - 周期
     */
    async delDailyDraws(date, interval) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            const key = `${CACHE_PREFIX.DRAWS_DAILY}${date}:${interval}`;
            return await safeRedis.del(client, key);
        } catch (error) {
            console.error('删除每日开奖列表缓存失败:', error.message);
            return false;
        }
    }

    // ==================== 用户余额缓存 ====================

    /**
     * 获取用户余额（优先从缓存读取）
     * @param {string} userId - 用户ID
     * @param {Function} dbFallback - 数据库回退函数
     */
    async getUserBalance(userId, dbFallback = null) {
        const client = getRedisClient();
        
        // 如果Redis不可用，直接从数据库读取
        if (!client) {
            if (dbFallback) {
                return await dbFallback(userId);
            }
            return null;
        }

        try {
            const key = `${CACHE_PREFIX.USER_BALANCE}${userId}`;
            const cached = await safeRedis.get(client, key);
            
            if (cached !== null) {
                return parseFloat(cached);
            }

            // 缓存未命中，从数据库读取
            if (dbFallback) {
                const balance = await dbFallback(userId);
                // 写入缓存
                if (balance !== null) {
                    await safeRedis.set(client, key, balance.toString(), CACHE_TTL.USER_BALANCE);
                }
                return balance;
            }

            return null;
        } catch (error) {
            console.error('获取用户余额缓存失败:', error.message);
            // 降级到数据库
            if (dbFallback) {
                return await dbFallback(userId);
            }
            return null;
        }
    }

    /**
     * 设置用户余额缓存
     * @param {string} userId - 用户ID
     * @param {number} balance - 余额
     */
    async setUserBalance(userId, balance) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            const key = `${CACHE_PREFIX.USER_BALANCE}${userId}`;
            return await safeRedis.set(client, key, balance.toString(), CACHE_TTL.USER_BALANCE);
        } catch (error) {
            console.error('设置用户余额缓存失败:', error.message);
            return false;
        }
    }

    /**
     * 删除用户余额缓存
     * @param {string} userId - 用户ID
     */
    async delUserBalance(userId) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            const key = `${CACHE_PREFIX.USER_BALANCE}${userId}`;
            return await safeRedis.del(client, key);
        } catch (error) {
            console.error('删除用户余额缓存失败:', error.message);
            return false;
        }
    }

    /**
     * 原子操作：扣除用户余额（用于投注）
     * @param {string} userId - 用户ID
     * @param {number} amount - 扣除金额
     * @param {Function} dbFallback - 数据库回退函数
     * @returns {Object} { success: boolean, balance: number, message: string }
     */
    async deductBalance(userId, amount, dbFallback = null) {
        const client = getRedisClient();
        
        // 如果Redis不可用，直接操作数据库
        if (!client) {
            if (dbFallback) {
                return await dbFallback(userId, -amount);
            }
            return { success: false, message: '缓存不可用且无回退函数' };
        }

        try {
            // 使用分布式锁
            const lockKey = `${CACHE_PREFIX.USER_LOCK}${userId}`;
            const lockAcquired = await this.acquireLock(lockKey, 5);

            if (!lockAcquired) {
                return { success: false, message: '操作频繁，请稍后重试' };
            }

            try {
                // 获取当前余额
                const balanceKey = `${CACHE_PREFIX.USER_BALANCE}${userId}`;
                let currentBalance = await safeRedis.get(client, balanceKey);

                // 如果缓存中没有，从数据库读取
                if (currentBalance === null && dbFallback) {
                    currentBalance = await dbFallback(userId);
                    if (currentBalance === null) {
                        return { success: false, message: '用户不存在' };
                    }
                } else {
                    currentBalance = currentBalance ? parseFloat(currentBalance) : 0;
                }

                // 检查余额是否足够
                if (currentBalance < amount) {
                    return { 
                        success: false, 
                        balance: currentBalance, 
                        message: '余额不足' 
                    };
                }

                // 扣除余额
                const newBalance = currentBalance - amount;
                await safeRedis.set(client, balanceKey, newBalance.toString(), CACHE_TTL.USER_BALANCE);

                return { 
                    success: true, 
                    balance: newBalance, 
                    previousBalance: currentBalance,
                    deducted: amount,
                    message: '扣款成功' 
                };
            } finally {
                // 释放锁
                await this.releaseLock(lockKey);
            }
        } catch (error) {
            console.error('扣除余额失败:', error.message);
            return { success: false, message: '操作失败: ' + error.message };
        }
    }

    /**
     * 原子操作：增加用户余额（用于中奖、充值）
     * @param {string} userId - 用户ID
     * @param {number} amount - 增加金额
     * @returns {Object} { success: boolean, balance: number }
     */
    async addBalance(userId, amount) {
        const client = getRedisClient();
        if (!client) {
            return { success: false, message: '缓存不可用' };
        }

        try {
            const balanceKey = `${CACHE_PREFIX.USER_BALANCE}${userId}`;
            
            // 使用INCRBYFLOAT原子操作
            let newBalance = await safeRedis.incrByFloat(client, balanceKey, amount);
            
            if (newBalance === null) {
                return { success: false, message: '增加余额失败' };
            }
            
            // 如果是新增的key，设置过期时间
            const ttl = await safeRedis.ttl(client, balanceKey);
            if (ttl === -1) {
                await safeRedis.expire(client, balanceKey, CACHE_TTL.USER_BALANCE);
            }

            return { 
                success: true, 
                balance: parseFloat(newBalance),
                added: amount
            };
        } catch (error) {
            console.error('增加余额失败:', error.message);
            return { success: false, message: '操作失败: ' + error.message };
        }
    }

    // ==================== 分布式锁 ====================

    /**
     * 获取分布式锁
     * @param {string} key - 锁的键
     * @param {number} ttl - 锁的过期时间（秒）
     */
    async acquireLock(key, ttl = 10) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            // 使用SET NX EX原子操作
            const result = await client.set(key, '1', 'NX', 'EX', ttl);
            return result === 'OK';
        } catch (error) {
            console.error('获取锁失败:', error.message);
            return false;
        }
    }

    /**
     * 释放分布式锁
     * @param {string} key - 锁的键
     */
    async releaseLock(key) {
        const client = getRedisClient();
        if (!client) return false;

        try {
            await safeRedis.del(client, key);
            return true;
        } catch (error) {
            console.error('释放锁失败:', error.message);
            return false;
        }
    }

    // ==================== 缓存管理 ====================

    /**
     * 清除所有缓存
     */
    async clearAll() {
        const client = getRedisClient();
        if (!client) return false;

        try {
            // 获取所有匹配的key
            const keys = await safeRedis.keys(client, `${CACHE_PREFIX.DRAW}*`);
            const keys2 = await safeRedis.keys(client, `${CACHE_PREFIX.DRAWS_DAILY}*`);
            const keys3 = await safeRedis.keys(client, `${CACHE_PREFIX.USER_BALANCE}*`);
            
            const allKeys = [...keys, ...keys2, ...keys3];
            
            if (allKeys.length > 0) {
                for (const key of allKeys) {
                    await safeRedis.del(client, key);
                }
            }
            
            return true;
        } catch (error) {
            console.error('清除缓存失败:', error.message);
            return false;
        }
    }

    /**
     * 获取缓存统计信息
     */
    async getStats() {
        const client = getRedisClient();
        if (!client) {
            return { enabled: false };
        }

        try {
            const drawKeys = await safeRedis.keys(client, `${CACHE_PREFIX.DRAW}*`);
            const dailyKeys = await safeRedis.keys(client, `${CACHE_PREFIX.DRAWS_DAILY}*`);
            const balanceKeys = await safeRedis.keys(client, `${CACHE_PREFIX.USER_BALANCE}*`);

            return {
                enabled: true,
                draws: drawKeys.length,
                dailyDraws: dailyKeys.length,
                userBalances: balanceKeys.length
            };
        } catch (error) {
            console.error('获取缓存统计失败:', error.message);
            return { enabled: false, error: error.message };
        }
    }
}

// 导出单例
const cacheService = new CacheService();

module.exports = cacheService;
