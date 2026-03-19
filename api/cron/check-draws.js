const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');
const { queue } = require('../../lib/queue');
const { drawLock } = require('../../lib/lock');
const cache = require('../../lib/cache');

/**
 * 生成随机10位数字字符串（不重复）
 */
function generateRandomResult() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Fisher-Yates 洗牌算法
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.join('');
}

/**
 * 检查并处理开奖
 * 使用幂等性设计，确保同一期号只处理一次
 */
async function processDraw(dateStr, interval, period, hours, minutes) {
    // 使用分布式锁确保幂等性
    const lockKey = `draw:check:${dateStr}:${interval}:${period}`;
    const lockResult = await drawLock.acquire(dateStr, interval, period, 30000);
    
    if (!lockResult.success) {
        console.log(`[CheckDraws] 跳过已处理的期号: ${dateStr} ${interval}分钟 第${period + 1}期`);
        return null;
    }

    try {
        await dbConnect();

        // 检查是否已开奖（双重保险）
        const existing = await Draw.findOne({ 
            date: dateStr, 
            interval, 
            period,
            status: { $in: ['drawn', 'settled'] }
        });

        if (existing) {
            console.log(`[CheckDraws] 期号已开奖: ${dateStr} ${interval}分钟 第${period + 1}期`);
            return null;
        }

        // 查找预设结果
        const preset = await Draw.findOne({ 
            date: dateStr, 
            interval, 
            period 
        });

        let result;
        if (preset && preset.result && /^\d{10}$/.test(preset.result)) {
            // 使用预设结果
            result = preset.result;
        } else {
            // 没有预设，随机生成
            result = generateRandomResult();
        }

        // 更新或创建开奖记录
        await Draw.findOneAndUpdate(
            { date: dateStr, interval, period },
            { 
                result,
                status: 'drawn',
                updatedAt: new Date()
            },
            { upsert: true }
        );

        // 删除该日期该周期的缓存
        await cache.deleteDailyDraws(dateStr, interval);

        // 发布到消息队列，异步处理结算
        await queue.publishDrawSettlement({
            date: dateStr,
            interval,
            period,
            result
        });

        return { 
            date: dateStr, 
            interval, 
            period: period + 1, // 返回1-based期号
            result,
            time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
        };
    } finally {
        // 释放锁
        if (lockResult.value) {
            await drawLock.release(dateStr, interval, period, lockResult.value);
        }
    }
}

module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        // 验证请求来源（使用secret token）
        const { secret } = req.query;
        if (secret !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: '未授权' });
        }

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const minutesSinceMidnight = hours * 60 + minutes;

        // 定义要检查的周期
        const intervals = [5, 10, 15];
        const results = [];

        // 并行处理所有周期的开奖检查
        const promises = [];
        
        for (const interval of intervals) {
            // 计算当前分钟数对应的期号 (0-based)
            const period = Math.floor(minutesSinceMidnight / interval);
            const totalPeriods = interval === 5 ? 288 : (interval === 10 ? 144 : 96);

            // 确保period在有效范围内
            if (period >= totalPeriods) {
                continue;
            }

            promises.push(processDraw(dateStr, interval, period, hours, minutes));
        }

        // 等待所有处理完成
        const drawResults = await Promise.all(promises);
        
        // 过滤掉null结果
        for (const result of drawResults) {
            if (result) {
                results.push(result);
            }
        }

        res.json({ 
            triggered: now.toISOString(),
            date: dateStr,
            time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
            results,
            message: results.length > 0 ? '开奖完成，结算任务已提交到队列' : '无新期号需要开奖'
        });
    } catch (error) {
        console.error('定时开奖检查错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
