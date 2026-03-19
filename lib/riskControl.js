/**
 * 风控检查模块
 * 防止恶意刷单、异常投注等
 */

const redis = require('./redis');

// 风控规则配置
const RISK_RULES = {
    // 单期最大投注金额（null 表示不限制）
    maxBetAmountPerPeriod: null,
    // 单期最大投注次数
    maxBetsPerPeriod: 1,
    // 单日最大投注金额（null 表示不限制）
    maxBetAmountPerDay: null,
    // 单日最大提现金额
    maxWithdrawPerDay: 50000,
    // 单日最大提现次数
    maxWithdrawCountPerDay: 5,
    // 单日最大充值金额
    maxDepositPerDay: 100000,
    // 单日最大充值次数
    maxDepositCountPerDay: 10,
    // 异常投注倍数（检查倍投）
    abnormalBetMultiplier: 10,
    // 黑名单阈值（连续失败次数）
    blacklistThreshold: 10
};

/**
 * 检查投注风控
 * @param {object} params - { userId, date, interval, period, amount, numbers }
 * @returns {object} { allowed, risks, message }
 */
async function checkBetRisk(params) {
    const { userId, date, interval, period, amount, numbers } = params;
    const risks = [];
    
    try {
        // 1. 检查单期投注金额（null 表示不限制）
        if (RISK_RULES.maxBetAmountPerPeriod !== null && amount > RISK_RULES.maxBetAmountPerPeriod) {
            risks.push({
                type: 'SINGLE_BET_AMOUNT_EXCEEDED',
                message: `单期投注金额超过限额 (${RISK_RULES.maxBetAmountPerPeriod})`,
                severity: 'high'
            });
        }
        
        // 2. 检查用户黑名单（Redis缓存）
        const blacklistKey = `risk:blacklist:${userId}`;
        if (redis.isAvailable()) {
            const isBlacklisted = await redis.get(blacklistKey);
            if (isBlacklisted) {
                return {
                    allowed: false,
                    risks: [{ type: 'USER_BLACKLISTED', message: '账户已被风控限制', severity: 'critical' }],
                    message: '账户已被风控限制，请联系客服'
                };
            }
        }
        
        // 3. 检查本期投注次数（内存计数或Redis）
        const periodBetCountKey = `risk:betcount:${userId}:${date}:${interval}:${period}`;
        const currentBetCount = await getCounter(periodBetCountKey, 86400);
        
        if (currentBetCount >= RISK_RULES.maxBetsPerPeriod) {
            risks.push({
                type: 'PERIOD_BET_COUNT_EXCEEDED',
                message: `单期投注次数超过限额 (${RISK_RULES.maxBetsPerPeriod}次)`,
                severity: 'high'
            });
        }
        
        // 4. 检查今日投注金额（null 表示不限制）
        if (RISK_RULES.maxBetAmountPerDay !== null) {
            const dailyBetAmountKey = `risk:dailybet:${userId}:${date}`;
            const dailyBetAmount = await getCounter(dailyBetAmountKey, 86400);
            
            if (dailyBetAmount + amount > RISK_RULES.maxBetAmountPerDay) {
                risks.push({
                    type: 'DAILY_BET_AMOUNT_EXCEEDED',
                    message: `今日投注金额已达上限 (${RISK_RULES.maxBetAmountPerDay})`,
                    severity: 'high'
                });
            }
        }
        
        // 5. 检查重复投注（相同数字组合）
        const betHash = `${date}:${interval}:${period}:${numbers?.join?.(',') || numbers}`;
        const duplicateKey = `risk:duplicate:${userId}:${betHash}`;
        const isDuplicate = await getCounter(duplicateKey, 300);
        
        if (isDuplicate > 0) {
            risks.push({
                type: 'DUPLICATE_BET',
                message: '检测到重复投注',
                severity: 'low'
            });
        }
        
        // 6. 检查异常倍投
        const lastBetKey = `risk:lastbet:${userId}`;
        const lastBet = await getLastValue(lastBetKey);
        
        if (lastBet && amount > lastBet.amount * RISK_RULES.abnormalBetMultiplier) {
            risks.push({
                type: 'ABNORMAL_MULTIPLIER',
                message: `检测到异常倍投 (${amount / lastBet.amount}倍)`,
                severity: 'medium'
            });
        }
        
        // 7. 检查投注时间（是否在截止前）
        const now = new Date();
        const periodEndMinutes = (period + 1) * interval;
        const periodEndTime = new Date(date);
        periodEndTime.setHours(Math.floor(periodEndMinutes / 60), periodEndMinutes % 60, 0, 0);
        
        const timeDiff = periodEndTime.getTime() - now.getTime();
        if (timeDiff < 30000) { // 开奖前30秒
            risks.push({
                type: 'LATE_BET',
                message: '开奖前最后30秒投注',
                severity: 'low'
            });
        }
        
        // 判断是否允许
        const criticalRisks = risks.filter(r => r.severity === 'critical');
        const highRisks = risks.filter(r => r.severity === 'high');
        
        const allowed = criticalRisks.length === 0 && highRisks.length < 2;
        
        return {
            allowed,
            risks,
            message: risks.length > 0 ? '存在风险提示' : null
        };
        
    } catch (error) {
        console.error('风控检查失败:', error);
        // 出错时默认允许（避免影响正常用户）
        return { allowed: true, risks: [], error: error.message };
    }
}

/**
 * 检查提现风控
 */
async function checkWithdrawRisk(params) {
    const { userId, amount, date } = params;
    const risks = [];
    
    try {
        // 1. 检查单次提现金额
        if (amount > RISK_RULES.maxWithdrawPerDay) {
            risks.push({
                type: 'WITHDRAW_AMOUNT_EXCEEDED',
                message: `提现金额超过单日限额 (${RISK_RULES.maxWithdrawPerDay})`,
                severity: 'high'
            });
        }
        
        // 2. 检查今日提现次数
        const withdrawCountKey = `risk:withdrawcount:${userId}:${date}`;
        const withdrawCount = await getCounter(withdrawCountKey, 86400);
        
        if (withdrawCount >= RISK_RULES.maxWithdrawCountPerDay) {
            risks.push({
                type: 'WITHDRAW_COUNT_EXCEEDED',
                message: `今日提现次数已达上限 (${RISK_RULES.maxWithdrawCountPerDay})`,
                severity: 'high'
            });
        }
        
        // 3. 检查今日提现金额
        const withdrawAmountKey = `risk:withdrawamount:${userId}:${date}`;
        const dailyWithdrawAmount = await getCounter(withdrawAmountKey, 86400);
        
        if (dailyWithdrawAmount + amount > RISK_RULES.maxWithdrawPerDay) {
            risks.push({
                type: 'DAILY_WITHDRAW_EXCEEDED',
                message: `今日提现金额已达上限 (${RISK_RULES.maxWithdrawPerDay})`,
                severity: 'high'
            });
        }
        
        const allowed = risks.filter(r => r.severity === 'high' || r.severity === 'critical').length === 0;
        
        return { allowed, risks };
        
    } catch (error) {
        console.error('提现风控检查失败:', error);
        return { allowed: true, risks: [], error: error.message };
    }
}

/**
 * 检查充值风控
 */
async function checkDepositRisk(params) {
    const { userId, amount, date } = params;
    const risks = [];
    
    try {
        // 1. 检查单次充值金额
        if (amount > RISK_RULES.maxDepositPerDay) {
            risks.push({
                type: 'DEPOSIT_AMOUNT_EXCEEDED',
                message: `充值金额超过限额`,
                severity: 'high'
            });
        }
        
        // 2. 检查今日充值次数
        const depositCountKey = `risk:depositcount:${userId}:${date}`;
        const depositCount = await getCounter(depositCountKey, 86400);
        
        if (depositCount >= RISK_RULES.maxDepositCountPerDay) {
            risks.push({
                type: 'DEPOSIT_COUNT_EXCEEDED',
                message: `今日充值次数已达上限`,
                severity: 'medium'
            });
        }
        
        const allowed = risks.filter(r => r.severity === 'high' || r.severity === 'critical').length === 0;
        
        return { allowed, risks };
        
    } catch (error) {
        console.error('充值风控检查失败:', error);
        return { allowed: true, risks: [], error: error.message };
    }
}

/**
 * 记录投注行为（用于风控统计）
 */
async function recordBetBehavior(userId, betInfo) {
    const { date, interval, period, amount, numbers } = betInfo;
    
    try {
        // 更新本期投注次数
        const periodBetCountKey = `risk:betcount:${userId}:${date}:${interval}:${period}`;
        await incrementCounter(periodBetCountKey, 86400);
        
        // 更新今日投注金额
        const dailyBetAmountKey = `risk:dailybet:${userId}:${date}`;
        await incrementCounter(dailyBetAmountKey, 86400, amount);
        
        // 记录重复投注检查
        const betHash = `${date}:${interval}:${period}:${numbers?.join?.(',') || numbers}`;
        const duplicateKey = `risk:duplicate:${userId}:${betHash}`;
        await incrementCounter(duplicateKey, 300);
        
        // 记录最近一次投注
        const lastBetKey = `risk:lastbet:${userId}`;
        await setLastValue(lastBetKey, { amount, date, interval, period }, 3600);
        
    } catch (error) {
        console.error('记录投注行为失败:', error);
    }
}

/**
 * 记录提现行为
 */
async function recordWithdrawBehavior(userId, amount, date) {
    const withdrawCountKey = `risk:withdrawcount:${userId}:${date}`;
    const withdrawAmountKey = `risk:withdrawamount:${userId}:${date}`;
    
    await incrementCounter(withdrawCountKey, 86400);
    await incrementCounter(withdrawAmountKey, 86400, amount);
}

/**
 * 添加到黑名单
 */
async function addToBlacklist(userId, reason, duration = 86400) {
    if (redis.isAvailable()) {
        await redis.setex(`risk:blacklist:${userId}`, duration, JSON.stringify({
            reason,
            addedAt: new Date().toISOString(),
            duration
        }));
    }
}

/**
 * 从黑名单移除
 */
async function removeFromBlacklist(userId) {
    if (redis.isAvailable()) {
        await redis.del(`risk:blacklist:${userId}`);
    }
}

// ===== 辅助函数 =====

async function getCounter(key, ttl) {
    if (redis.isAvailable()) {
        const value = await redis.get(key);
        return parseInt(value) || 0;
    }
    // 内存降级（简化实现）
    return 0;
}

async function incrementCounter(key, ttl, value = 1) {
    if (redis.isAvailable()) {
        const result = await redis.incrby(key, value);
        if (result === value) {
            await redis.expire(key, ttl);
        }
        return result;
    }
    return 0;
}

async function getLastValue(key) {
    if (redis.isAvailable()) {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    }
    return null;
}

async function setLastValue(key, value, ttl) {
    if (redis.isAvailable()) {
        await redis.setex(key, ttl, JSON.stringify(value));
    }
}

module.exports = {
    checkBetRisk,
    checkWithdrawRisk,
    checkDepositRisk,
    recordBetBehavior,
    recordWithdrawBehavior,
    addToBlacklist,
    removeFromBlacklist,
    RISK_RULES
};
