/**
 * 兜底补偿机制 API
 * 用于检查和处理遗漏的开奖和结算
 */

const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const Bet = require('../../models/Bet');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');
const { queue } = require('../../lib/queue');
const { drawLock } = require('../../lib/lock');
const adminVerify = require('../admin/verify');

/**
 * 生成随机10位数字字符串（不重复）
 */
function generateRandomResult() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.join('');
}

/**
 * 检查遗漏的开奖
 * @param {string} date - 日期
 * @param {number} interval - 周期
 * @param {number} currentPeriod - 当前期号
 */
async function checkMissedDraws(date, interval, currentPeriod) {
    const totalPeriods = interval === 5 ? 288 : (interval === 10 ? 144 : 96);
    const missedPeriods = [];

    // 查询该日期该周期所有已开奖的期号
    const drawnPeriods = await Draw.find({
        date,
        interval,
        status: { $in: ['drawn', 'settled'] }
    }).distinct('period');

    const drawnSet = new Set(drawnPeriods);

    // 检查当前期号之前的所有期号
    for (let period = 0; period < currentPeriod; period++) {
        if (!drawnSet.has(period)) {
            missedPeriods.push(period);
        }
    }

    return missedPeriods;
}

/**
 * 检查遗漏的结算
 * @param {string} date - 日期
 * @param {number} interval - 周期
 */
async function checkMissedSettlements(date, interval) {
    const missedSettlements = [];

    // 查询已开奖但未结算的记录
    const drawnNotSettled = await Draw.find({
        date,
        interval,
        status: 'drawn'
    });

    for (const draw of drawnNotSettled) {
        // 检查是否有待结算的投注
        const pendingBets = await Bet.countDocuments({
            date: draw.date,
            interval: draw.interval,
            period: draw.period,
            status: 'pending'
        });

        if (pendingBets > 0) {
            missedSettlements.push({
                date: draw.date,
                interval: draw.interval,
                period: draw.period,
                result: draw.result,
                pendingBets
            });
        }
    }

    return missedSettlements;
}

/**
 * 补开遗漏的期号
 */
async function compensateMissedDraws(date, interval, periods) {
    const results = [];

    for (const period of periods) {
        const lockResult = await drawLock.acquire(date, interval, period, 30000);
        
        if (!lockResult.success) {
            console.log(`[Compensation] 跳过已处理的期号: ${date} ${interval}分钟 第${period + 1}期`);
            continue;
        }

        try {
            // 再次检查是否已开奖
            const existing = await Draw.findOne({
                date,
                interval,
                period,
                status: { $in: ['drawn', 'settled'] }
            });

            if (existing) {
                console.log(`[Compensation] 期号已开奖: ${date} ${interval}分钟 第${period + 1}期`);
                continue;
            }

            // 查找预设结果
            const preset = await Draw.findOne({ date, interval, period });
            const result = preset && preset.result && /^\d{10}$/.test(preset.result)
                ? preset.result
                : generateRandomResult();

            // 更新开奖记录
            await Draw.findOneAndUpdate(
                { date, interval, period },
                { result, status: 'drawn', updatedAt: new Date() },
                { upsert: true }
            );

            // 发布到消息队列
            await queue.publishDrawSettlement({
                date,
                interval,
                period,
                result
            });

            results.push({
                date,
                interval,
                period: period + 1,
                result,
                compensated: true
            });
        } finally {
            if (lockResult.value) {
                await drawLock.release(date, interval, period, lockResult.value);
            }
        }
    }

    return results;
}

/**
 * 补结算遗漏的期号
 */
async function compensateMissedSettlements(missedSettlements) {
    const results = [];

    for (const item of missedSettlements) {
        // 发布到消息队列
        await queue.publishDrawSettlement({
            date: item.date,
            interval: item.interval,
            period: item.period,
            result: item.result
        });

        results.push({
            date: item.date,
            interval: item.interval,
            period: item.period + 1,
            pendingBets: item.pendingBets,
            compensated: true
        });
    }

    return results;
}

module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    // GET: 检查遗漏情况
    if (req.method === 'GET') {
        try {
            // 验证权限（需要管理员或使用CRON_SECRET）
            const { secret, date } = req.query;
            
            if (secret !== process.env.CRON_SECRET) {
                const admin = await adminVerify(req);
                if (!admin) {
                    return res.status(401).json({ error: '需要管理员权限或有效的secret' });
                }
            }

            await dbConnect();

            // 使用指定日期或当前日期
            const targetDate = date || new Date().toISOString().slice(0, 10);
            const now = new Date();
            const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

            const report = {
                date: targetDate,
                checkedAt: now.toISOString(),
                missedDraws: {},
                missedSettlements: {},
                summary: {
                    totalMissedDraws: 0,
                    totalMissedSettlements: 0
                }
            };

            // 检查各周期的遗漏情况
            for (const interval of [5, 10, 15]) {
                const currentPeriod = Math.floor(minutesSinceMidnight / interval);
                
                const missedDraws = await checkMissedDraws(targetDate, interval, currentPeriod);
                report.missedDraws[interval] = missedDraws;
                report.summary.totalMissedDraws += missedDraws.length;

                const missedSettlements = await checkMissedSettlements(targetDate, interval);
                report.missedSettlements[interval] = missedSettlements;
                report.summary.totalMissedSettlements += missedSettlements.length;
            }

            res.json(report);
        } catch (error) {
            console.error('检查遗漏错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // POST: 执行补偿
    else if (req.method === 'POST') {
        try {
            // 验证权限（需要管理员）
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { date, interval, period, action } = req.body;

            await dbConnect();

            // 使用指定日期或当前日期
            const targetDate = date || new Date().toISOString().slice(0, 10);
            const now = new Date();
            const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

            const result = {
                date: targetDate,
                executedAt: now.toISOString(),
                action,
                compensatedDraws: [],
                compensatedSettlements: []
            };

            if (action === 'draw' || action === 'all') {
                // 补开遗漏的期号
                if (interval && period !== undefined) {
                    // 指定期号
                    const compensated = await compensateMissedDraws(targetDate, interval, [period]);
                    result.compensatedDraws = compensated;
                } else if (interval) {
                    // 指定周期
                    const currentPeriod = Math.floor(minutesSinceMidnight / interval);
                    const missed = await checkMissedDraws(targetDate, interval, currentPeriod);
                    const compensated = await compensateMissedDraws(targetDate, interval, missed);
                    result.compensatedDraws = compensated;
                } else {
                    // 所有周期
                    for (const int of [5, 10, 15]) {
                        const currentPeriod = Math.floor(minutesSinceMidnight / int);
                        const missed = await checkMissedDraws(targetDate, int, currentPeriod);
                        const compensated = await compensateMissedDraws(targetDate, int, missed);
                        result.compensatedDraws.push(...compensated);
                    }
                }
            }

            if (action === 'settlement' || action === 'all') {
                // 补结算遗漏的期号
                if (interval) {
                    const missed = await checkMissedSettlements(targetDate, interval);
                    const compensated = await compensateMissedSettlements(missed);
                    result.compensatedSettlements = compensated;
                } else {
                    for (const int of [5, 10, 15]) {
                        const missed = await checkMissedSettlements(targetDate, int);
                        const compensated = await compensateMissedSettlements(missed);
                        result.compensatedSettlements.push(...compensated);
                    }
                }
            }

            result.summary = {
                compensatedDraws: result.compensatedDraws.length,
                compensatedSettlements: result.compensatedSettlements.length
            };

            res.json(result);
        } catch (error) {
            console.error('执行补偿错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
